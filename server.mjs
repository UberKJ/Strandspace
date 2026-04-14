import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, join, normalize } from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import {
  loadPlants,
  loadFlowers,
  saveFlowers,
  answerWithLLM,
  answerWithStrandspace,
  answerWithHybrid,
  compareModes,
  benchmarkModes,
  inspectStrands,
  recordFeedback,
  summarizeCatalogEntry,
  defaultPlantsPath,
  defaultFlowersPath
} from "./strandspace/recall.js";
import { searchExternalKnowledge, resolveFlowerThumbnail, resolvePlantThumbnail } from "./strandspace/external.js";
import { normalizeAudience } from "./strandspace/v2.js";
import { normalizeText, parseQuestion } from "./strandspace/parser.js";
import { rankPlants } from "./strandspace/matcher.js";
import {
  buildRegionAdvice,
  filterPlantsByRegion,
  getRegionOptions,
  getRegionProfile,
  normalizeRegion
} from "./strandspace/atlas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const picturesDir = join(publicDir, "pictures");
const picturesManifestPath = join(picturesDir, "sources.json");
const flowerImageLookupCache = new Map();
const plantsPath = defaultPlantsPath;
const flowersPath = defaultFlowersPath;
let gardenDatabase = null;
const plantImageLookupCache = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function flowerSearchText(plant) {
  const anchors = plant.anchors ?? {};
  return [
    plant.name,
    plant.id,
    plant.constructStrand,
    plant.experiment_cluster,
    anchors.primary_color,
    anchors.secondary_color,
    anchors.sunlight,
    anchors.soil_type,
    anchors.fragrance,
    anchors.bloom_type,
    anchors.companions,
    ...(plant.questionIdeas ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeQueryWords(value = "") {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

const COLOR_TRAIT_WORDS = new Set([
  "blue",
  "yellow",
  "red",
  "pink",
  "purple",
  "white",
  "green",
  "orange",
  "gold",
  "silver",
  "amber",
  "violet",
  "scarlet",
  "coral",
  "magenta",
  "brown",
  "black"
]);

function looksLikeColorTraitQuery(value = "") {
  const words = normalizeQueryWords(value);
  return words.length > 0 && words.every((word) => COLOR_TRAIT_WORDS.has(word));
}

function editDistanceWithin(left = "", right = "", maxDistance = 1) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a === b) {
    return 0;
  }
  if (!a || !b) {
    return Math.max(a.length, b.length) <= maxDistance ? Math.max(a.length, b.length) : maxDistance + 1;
  }
  if (Math.abs(a.length - b.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
    previous = current;
  }

  return previous[b.length];
}

function normalizePlantSearchText(plant) {
  const anchors = plant.anchors ?? {};
  return normalizeText(
    [
      plant.name,
      plant.id,
      plant.constructStrand,
      plant.regionHint,
      plant.experiment_cluster,
      ...(plant.aliases ?? []),
      ...(plant.composites ?? []),
      ...Object.values(anchors)
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function isPlainPlantQuery(search = "") {
  const normalized = String(search).trim();
  if (!normalized || normalized.includes("?")) {
    return false;
  }

  const words = normalizeQueryWords(normalized);
  if (words.length === 0 || words.length > 3) {
    return false;
  }

  return !/^(what|which|how|does|do|is|are|tell|show|list|find|give|explain)\b/i.test(normalized);
}

function scorePlainPlantSearch(plant, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const fields = [
    plant.name,
    plant.constructStrand,
    ...(plant.aliases ?? []),
    plant.id
  ]
    .filter(Boolean)
    .map((value) => normalizeText(value));

  let score = 0;
  for (const field of fields) {
    if (field === normalizedQuery) {
      score += 250;
      continue;
    }

    const fieldTokens = new Set(field.split(/\s+/).filter(Boolean));
    const queryTokens = normalizeQueryWords(normalizedQuery);
    if (queryTokens.every((token) => fieldTokens.has(token))) {
      score += 200;
      continue;
    }

    if (fieldTokens.has(normalizedQuery)) {
      score += 150;
      continue;
    }

    if (field.includes(normalizedQuery) && normalizedQuery.length >= 4) {
      score += 60;
      continue;
    }

    if (normalizeQueryWords(normalizedQuery).length === 1) {
      const fieldWords = [...fieldTokens];
      if (fieldWords.some((word) => editDistanceWithin(word, normalizedQuery, 1) <= 1)) {
        score += 50;
      }
    }
  }

  return score;
}

function searchPlantsByName(plants, query) {
  const scored = plants
    .map((plant) => {
      const nameScore = scorePlainPlantSearch(plant, query);
      return {
        ...plant,
        score: nameScore,
        matchedBy: {
          nameScore,
          traitScore: 0
        }
      };
    })
    .filter((plant) => plant.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const exact = scored.filter((plant) => plant.score >= 200);
  if (exact.length > 0) {
    return exact;
  }

  if (scored.length > 0) {
    return scored;
  }

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return [];
  }

  return plants
    .map((plant) => {
      const candidates = [plant.name, plant.constructStrand, ...(plant.aliases ?? []), plant.id].filter(Boolean);
      const distance = Math.min(...candidates.map((candidate) => editDistanceWithin(candidate, normalizedQuery, 2)));
      const score = distance <= 2 ? 40 - distance * 10 : 0;
      return {
        ...plant,
        score,
        matchedBy: {
          nameScore: score,
          traitScore: 0
        }
      };
    })
    .filter((plant) => plant.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function scoreTokenizedPlantSearch(plant, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const queryTokens = normalizeQueryWords(normalizedQuery);
  if (queryTokens.length === 0) {
    return 0;
  }

  const searchableText = normalizePlantSearchText(plant);
  const searchableTokens = new Set(searchableText.split(/\s+/).filter(Boolean));
  let score = 0;

  for (const token of queryTokens) {
    if (token.length < 3) {
      continue;
    }

    if (searchableTokens.has(token)) {
      score += 12;
    } else if (searchableText.includes(token)) {
      score += 4;
    }
  }

  const name = normalizeText(plant.name);
  const aliases = (plant.aliases ?? []).map(normalizeText);
  if (normalizedQuery === name || aliases.includes(normalizedQuery)) {
    score += 80;
  }

  if (searchableText.includes(normalizedQuery) && normalizedQuery.length >= 4) {
    score += 20;
  }

  return score;
}

function summarizeSearchComparisonPlant(plant, region, score, matchedBy = null) {
  const summary = summarizeAtlasEntry(plant, region);
  return {
    ...summary,
    score: Number(score ?? 0),
    matchedBy,
    regionScore: summary.regionScore ?? 0,
    regionReasons: summary.regionReasons ?? []
  };
}

function normalizeMemorySearch(value = "") {
  return normalizeText(String(value ?? "").trim());
}

function memoryMatchesSearch(entry, search) {
  const normalizedSearch = normalizeMemorySearch(search);
  if (!normalizedSearch) {
    return false;
  }

  const haystack = normalizeMemorySearch([entry.plantName, entry.constructStrand, entry.searchQuery].filter(Boolean).join(" "));
  if (!haystack) {
    return false;
  }

  if (haystack === normalizedSearch) {
    return true;
  }

  if (haystack.includes(normalizedSearch) && normalizedSearch.length >= 3) {
    return true;
  }

  const searchTokens = new Set(normalizedSearch.split(/\s+/).filter(Boolean));
  return [...searchTokens].every((token) => haystack.includes(token));
}

function applyMemoryBoost(results, search, memoryEntries = []) {
  if (!search || memoryEntries.length === 0) {
    return {
      results,
      memoryHit: null
    };
  }

  const matchingEntries = memoryEntries.filter((entry) => memoryMatchesSearch(entry, search));
  if (matchingEntries.length === 0) {
    return {
      results,
      memoryHit: null
    };
  }

  const learnedIds = new Set(matchingEntries.map((entry) => normalizeMemorySearch(entry.plantId)));
  const boosted = results
    .map((entry) => {
      const key = normalizeMemorySearch(entry.id ?? entry.constructStrand ?? entry.name);
      if (!learnedIds.has(key) && !matchingEntries.some((memory) => normalizeMemorySearch(memory.plantName) === key)) {
        return entry;
      }

      const memoryHit = matchingEntries.find((memory) => {
        const memoryKey = normalizeMemorySearch(memory.plantId ?? memory.constructStrand ?? memory.plantName);
        return memoryKey === key || normalizeMemorySearch(memory.plantName) === key;
      }) ?? matchingEntries[0];

      return {
        ...entry,
        memoryHit: true,
        memoryLearnedCount: Number(memoryHit.learnedCount ?? 1),
        score: Number(entry.score ?? 0) + 40
      };
    })
    .sort((a, b) => (Number(b.score ?? 0) - Number(a.score ?? 0)) || a.name.localeCompare(b.name));

  return {
    results: boosted,
    memoryHit: matchingEntries[0]
  };
}

function buildSearchComparison(plants, query, parsed, region) {
  const tokenizedStarted = performance.now();
  const tokenizedRanked = plants
    .map((plant) => ({
      plant,
      score: scoreTokenizedPlantSearch(plant, query)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.plant.name.localeCompare(b.plant.name))
    .map(({ plant, score }) => summarizeSearchComparisonPlant(plant, region, score, { nameScore: score, traitScore: 0 }));
  const tokenizedMs = Number((performance.now() - tokenizedStarted).toFixed(3));

  const strandspaceStarted = performance.now();
  const strandbaseRanked = rankPlants(plants, parsed).map((entry) => {
    const plant = entry.plant ? entry.plant : entry;
    return summarizeSearchComparisonPlant(
      plant,
      region,
      entry.score ?? 0,
      entry.matchedBy ?? { nameScore: 0, traitScore: entry.score ?? 0 }
    );
  });
  const strandspaceMs = Number((performance.now() - strandspaceStarted).toFixed(3));

  const tokenizedTop = tokenizedRanked.slice(0, 6);
  const strandbaseTop = strandbaseRanked.slice(0, 6);
  const tokenizedIds = new Set(tokenizedTop.map((item) => item.id ?? item.constructStrand ?? item.name));
  const strandbaseIds = new Set(strandbaseTop.map((item) => item.id ?? item.constructStrand ?? item.name));

  const shared = strandbaseTop
    .filter((item) => tokenizedIds.has(item.id ?? item.constructStrand ?? item.name))
    .map((item) => item.name);

  return {
    query,
    tokenized: {
      label: "Tokenized information",
      count: tokenizedRanked.length,
      top: tokenizedTop
    },
    strandbase: {
      label: "Strandspace",
      count: strandbaseRanked.length,
      top: strandbaseTop
    },
    timings: {
      tokenizedMs,
      strandspaceMs,
      differenceMs: Number((tokenizedMs - strandspaceMs).toFixed(3))
    },
    answers: {
      tokenized: tokenizedTop[0]?.name ?? null,
      strandspace: strandbaseTop[0]?.name ?? null
    },
    shared,
    tokenizedOnly: tokenizedTop
      .filter((item) => !strandbaseIds.has(item.id ?? item.constructStrand ?? item.name))
      .map((item) => item.name),
    strandbaseOnly: strandbaseTop
      .filter((item) => !tokenizedIds.has(item.id ?? item.constructStrand ?? item.name))
      .map((item) => item.name)
  };
}

function benchmarkSearchStrategies(question, plants, runs = 20, region = "temperate") {
  const parsed = parseQuestion(question);
  const tokenizedTimes = [];
  const strandspaceTimes = [];
  let tokenizedCount = 0;
  let strandspaceCount = 0;

  for (let index = 0; index < runs; index += 1) {
    const tokenizedStarted = performance.now();
    const tokenizedRanked = plants
      .map((plant) => ({
        plant,
        score: scoreTokenizedPlantSearch(plant, question)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.plant.name.localeCompare(b.plant.name));
    tokenizedTimes.push(performance.now() - tokenizedStarted);
    tokenizedCount = tokenizedRanked.length;

    const strandStarted = performance.now();
    const strandRanked = rankPlants(plants, parsed);
    strandspaceTimes.push(performance.now() - strandStarted);
    strandspaceCount = strandRanked.length;
  }

  const average = (values) =>
    Number(
      Math.max(
        values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
        0.001
      ).toFixed(3)
    );

  return {
    query: question,
    region,
    runs,
    tokenized: {
      averageMs: average(tokenizedTimes),
      count: tokenizedCount
    },
    strandspace: {
      averageMs: average(strandspaceTimes),
      count: strandspaceCount
    },
    differenceMs: Number((average(tokenizedTimes) - average(strandspaceTimes)).toFixed(3))
  };
}

function scoreFlowerMatch(plant, query) {
  if (!query) {
    return 1;
  }

  const haystack = flowerSearchText(plant);
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 3;
    }
  }

  if (haystack.includes(query)) {
    score += 10;
  }

  if (query.includes("flower") || query.includes("flowers")) {
    score += String(plant.anchors?.plant_type ?? "").toLowerCase() === "flower" ? 4 : 1;
  }

  return score;
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function flowerPicturePath(constructStrand = "") {
  return `/pictures/${constructStrand}.jpg`;
}

async function ensurePictureFolder() {
  await mkdir(picturesDir, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPictureManifest() {
  try {
    const raw = await readFile(picturesManifestPath, "utf8");
    const payload = JSON.parse(raw);
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

async function savePictureManifest(entries) {
  await ensurePictureFolder();
  await writeFile(picturesManifestPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function recordPictureSource(record) {
  const manifest = await readPictureManifest();
  const next = manifest.filter((entry) => entry?.strand !== record.strand);
  next.unshift({
    strand: record.strand,
    flower: record.flower,
    title: record.title,
    page: record.page,
    image: record.image,
    provider: record.provider,
    source: record.source,
    savedAt: record.savedAt
  });
  await savePictureManifest(next);
}

function openGardenDatabase() {
  if (gardenDatabase) {
    return gardenDatabase;
  }

  gardenDatabase = new DatabaseSync(plantsPath);
  gardenDatabase.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS garden_memory (
      plantId TEXT PRIMARY KEY,
      plantName TEXT NOT NULL,
      constructStrand TEXT,
      region TEXT,
      note TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS strand_memory (
      plantId TEXT PRIMARY KEY,
      plantName TEXT NOT NULL,
      constructStrand TEXT NOT NULL,
      region TEXT,
      searchQuery TEXT,
      strandTrace TEXT,
      activatedStrands TEXT,
      imagePath TEXT,
      imageLink TEXT,
      keyHolder TEXT,
      source TEXT,
      learnedCount INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_garden_memory_updatedAt ON garden_memory(updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_garden_memory_favorite ON garden_memory(favorite, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_strand_memory_updatedAt ON strand_memory(updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_strand_memory_constructStrand ON strand_memory(constructStrand);
  `);

  return gardenDatabase;
}

function readGardenEntries() {
  const db = openGardenDatabase();
  return db
    .prepare("SELECT plantId, plantName, constructStrand, region, note, favorite, updatedAt FROM garden_memory ORDER BY updatedAt DESC")
    .all()
    .map((row) => ({
      ...row,
      favorite: Boolean(row.favorite)
    }));
}

function readGardenEntry(plantId) {
  if (!plantId) {
    return null;
  }

  const db = openGardenDatabase();
  const row = db
    .prepare("SELECT plantId, plantName, constructStrand, region, note, favorite, updatedAt FROM garden_memory WHERE plantId = ?")
    .get(String(plantId));

  if (!row) {
    return null;
  }

  return {
    ...row,
    favorite: Boolean(row.favorite)
  };
}

function upsertGardenEntry(payload = {}) {
  const db = openGardenDatabase();
  const plantId = String(payload.plantId ?? payload.id ?? payload.constructStrand ?? slugify(payload.plantName ?? payload.plant ?? "")).trim();
  if (!plantId) {
    throw new Error("plantId is required");
  }

  const existing = readGardenEntry(plantId) ?? {};
  const note = payload.note !== undefined ? String(payload.note ?? "").trim() : existing.note ?? null;
  const favorite =
    payload.favorite !== undefined
      ? Boolean(payload.favorite)
      : Boolean(existing.favorite);
  const plantName = String(payload.plantName ?? payload.name ?? existing.plantName ?? payload.plant ?? plantId).trim();
  const constructStrand = String(payload.constructStrand ?? existing.constructStrand ?? plantId).trim();
  const region = payload.region ?? existing.region ?? null;
  const updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO garden_memory (plantId, plantName, constructStrand, region, note, favorite, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(plantId) DO UPDATE SET
      plantName = excluded.plantName,
      constructStrand = excluded.constructStrand,
      region = excluded.region,
      note = excluded.note,
      favorite = excluded.favorite,
      updatedAt = excluded.updatedAt
  `).run(plantId, plantName, constructStrand, region, note, favorite ? 1 : 0, updatedAt);

  return readGardenEntry(plantId);
}

function safeJsonParse(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readStrandMemoryEntries() {
  const db = openGardenDatabase();
  return db
    .prepare(
      "SELECT plantId, plantName, constructStrand, region, searchQuery, strandTrace, activatedStrands, imagePath, imageLink, keyHolder, source, learnedCount, updatedAt FROM strand_memory ORDER BY updatedAt DESC"
    )
    .all()
    .map((row) => ({
      ...row,
      learnedCount: Number(row.learnedCount ?? 1),
      strandTrace: safeJsonParse(row.strandTrace, null),
      activatedStrands: safeJsonParse(row.activatedStrands, []),
      keyHolder: safeJsonParse(row.keyHolder, null)
    }));
}

function readStrandMemoryEntry(plantId) {
  if (!plantId) {
    return null;
  }

  const db = openGardenDatabase();
  const row = db
    .prepare(
      "SELECT plantId, plantName, constructStrand, region, searchQuery, strandTrace, activatedStrands, imagePath, imageLink, keyHolder, source, learnedCount, updatedAt FROM strand_memory WHERE plantId = ?"
    )
    .get(String(plantId));

  if (!row) {
    return null;
  }

  return {
    ...row,
    learnedCount: Number(row.learnedCount ?? 1),
    strandTrace: safeJsonParse(row.strandTrace, null),
    activatedStrands: safeJsonParse(row.activatedStrands, []),
    keyHolder: safeJsonParse(row.keyHolder, null)
  };
}

function upsertStrandMemory(payload = {}) {
  const db = openGardenDatabase();
  const plantId = String(payload.plantId ?? payload.id ?? payload.constructStrand ?? payload.plantName ?? payload.plant ?? "").trim();
  if (!plantId) {
    throw new Error("plantId is required");
  }

  const existing = readStrandMemoryEntry(plantId) ?? {};
  const updatedAt = new Date().toISOString();
  const row = {
    plantId,
    plantName: String(payload.plantName ?? existing.plantName ?? payload.name ?? "").trim() || plantId,
    constructStrand: String(payload.constructStrand ?? existing.constructStrand ?? plantId).trim(),
    region: String(payload.region ?? existing.region ?? "").trim() || null,
    searchQuery: String(payload.searchQuery ?? existing.searchQuery ?? payload.question ?? "").trim() || null,
    strandTrace: payload.strandTrace !== undefined ? JSON.stringify(payload.strandTrace ?? null) : existing.strandTrace ?? null,
    activatedStrands: payload.activatedStrands !== undefined ? JSON.stringify(payload.activatedStrands ?? []) : existing.activatedStrands ? JSON.stringify(existing.activatedStrands) : JSON.stringify([]),
    imagePath: String(payload.imagePath ?? existing.imagePath ?? "").trim() || null,
    imageLink: String(payload.imageLink ?? existing.imageLink ?? "").trim() || null,
    keyHolder: payload.keyHolder !== undefined ? JSON.stringify(payload.keyHolder ?? null) : existing.keyHolder ? JSON.stringify(existing.keyHolder) : null,
    source: String(payload.source ?? existing.source ?? "search-click").trim() || "search-click",
    learnedCount: Number(existing.learnedCount ?? 0) + 1,
    updatedAt
  };

  db.prepare(`
    INSERT INTO strand_memory (plantId, plantName, constructStrand, region, searchQuery, strandTrace, activatedStrands, imagePath, imageLink, keyHolder, source, learnedCount, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(plantId) DO UPDATE SET
      plantName = excluded.plantName,
      constructStrand = excluded.constructStrand,
      region = excluded.region,
      searchQuery = excluded.searchQuery,
      strandTrace = excluded.strandTrace,
      activatedStrands = excluded.activatedStrands,
      imagePath = excluded.imagePath,
      imageLink = excluded.imageLink,
      keyHolder = excluded.keyHolder,
      source = excluded.source,
      learnedCount = excluded.learnedCount,
      updatedAt = excluded.updatedAt
  `).run(
    row.plantId,
    row.plantName,
    row.constructStrand,
    row.region,
    row.searchQuery,
    row.strandTrace,
    row.activatedStrands,
    row.imagePath,
    row.imageLink,
    row.keyHolder,
    row.source,
    row.learnedCount,
    row.updatedAt
  );

  return readStrandMemoryEntry(plantId);
}

function favoritePlant(payload = {}) {
  return upsertGardenEntry({
    ...payload,
    favorite: payload.favorite ?? true
  });
}

async function summarizeFlowerEntry(entry) {
  const summary = summarizeCatalogEntry(entry, { includeImage: false });
  const imageFilePath = join(picturesDir, `${entry.constructStrand}.jpg`);
  const imagePath = (await fileExists(imageFilePath)) ? flowerPicturePath(entry.constructStrand) : null;
  return {
    ...summary,
    imagePath
  };
}

function plantThumbnailCacheKey(plant, region) {
  return [
    plant?.id ?? plant?.constructStrand ?? plant?.name ?? "",
    region ?? "",
    normalizeText(plant?.name ?? plant?.title ?? "")
  ].join("|");
}

async function resolvePlantImageForSummary(plant, options = {}) {
  const cacheKey = plantThumbnailCacheKey(plant, options.region ?? "");
  const cached = plantImageLookupCache.get(cacheKey) ?? null;
  if (cached) {
    return cached;
  }

  const media = await resolvePlantThumbnail(plant, {
    provider: options.provider ?? "wikipedia",
    audience: options.audience ?? "gardener",
    query: options.query ?? `${plant?.name ?? plant?.title ?? "plant"} plant`,
    fetchImpl: options.fetchImpl
  });

  const best = media?.bestResult ?? null;
  const payload = {
    id: plant?.id ?? plant?.constructStrand ?? plant?.name ?? "",
    strand: plant?.constructStrand ?? plant?.id ?? normalizeText(plant?.name ?? "plant"),
    title: media?.title ?? plant?.name ?? plant?.title ?? "Plant",
    imageUrl: best?.thumbnail ?? null,
    fullImageUrl: best?.url ?? null,
    pageUrl: best?.url ?? null,
    source: best?.provider ?? media?.provider ?? "wikipedia",
    imageStatus: best?.thumbnail ? "resolved" : "linked"
  };

  plantImageLookupCache.set(cacheKey, payload);
  return payload;
}

function summarizeAtlasEntry(plant, region, options = {}) {
  return {
    ...summarizeCatalogEntry(plant, { includeImage: options.includeImage ?? true, regionProfile: getRegionProfile(region) }),
    ...buildRegionAdvice(plant, region)
  };
}

function findPlantRecord(plants, summary) {
  if (!summary) {
    return null;
  }

  return plants.find((plant) => {
    const nameMatch = normalizeText(plant.name) === normalizeText(summary.name ?? "");
    const idMatch = summary.id && plant.id === summary.id;
    const strandMatch = summary.constructStrand && plant.constructStrand === summary.constructStrand;
    return nameMatch || idMatch || strandMatch;
  }) ?? null;
}

function enrichPlantSummary(summary, plants, region) {
  const record = findPlantRecord(plants, summary);
  if (!record) {
    return summary;
  }

  return {
    ...summary,
    ...summarizeAtlasEntry(record, region)
  };
}

function enrichResponseWithRegion(payload, plants, region) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const clone = { ...payload, region, regionProfile: getRegionProfile(region) };

  if (clone.matchedPlant) {
    clone.matchedPlant = enrichPlantSummary(clone.matchedPlant, plants, region);
  }

  if (Array.isArray(clone.relatedPlants)) {
    clone.relatedPlants = clone.relatedPlants.map((plant) => enrichPlantSummary(plant, plants, region));
  }

  if (clone.llm?.matchedPlant) {
    clone.llm = {
      ...clone.llm,
      matchedPlant: enrichPlantSummary(clone.llm.matchedPlant, plants, region)
    };
  }

  if (clone.strandspace?.matchedPlant) {
    clone.strandspace = {
      ...clone.strandspace,
      matchedPlant: enrichPlantSummary(clone.strandspace.matchedPlant, plants, region)
    };
  }

  if (clone.local?.strandspace?.matchedPlant) {
    clone.local = {
      ...clone.local,
      strandspace: {
        ...clone.local.strandspace,
        matchedPlant: enrichPlantSummary(clone.local.strandspace.matchedPlant, plants, region)
      }
    };
  }

  return clone;
}

async function saveFlowerThumbnail(constructStrand, thumbnailUrl, flower, provider = "wikipedia") {
  if (!thumbnailUrl) {
    return null;
  }

  await ensurePictureFolder();
  const imageFilePath = join(picturesDir, `${constructStrand}.jpg`);
  const response = await fetch(thumbnailUrl);
  if (!response.ok) {
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(imageFilePath, buffer);
  await recordPictureSource({
    strand: constructStrand,
    flower: flower.name ?? flower.title ?? constructStrand,
    title: flower.title ?? flower.name ?? constructStrand,
    page: flower.url ?? null,
    image: thumbnailUrl,
    provider,
    source: flower.source ?? "outside",
    savedAt: new Date().toISOString()
  });

  return flowerPicturePath(constructStrand);
}

async function resolveFlowerPicture(flower, options = {}) {
  const constructStrand = String(flower?.constructStrand ?? `flower-${slugify(flower?.name ?? flower?.title ?? "flower")}`).trim();
  const imageFilePath = join(picturesDir, `${constructStrand}.jpg`);
  const localStarted = performance.now();
  const localExists = await fileExists(imageFilePath);
  const localMs = performance.now() - localStarted;
  const compareExternal = options.compareExternal ?? true;
  const cacheKey = `${constructStrand}|${options.provider ?? "wikipedia"}|${normalizeText(options.query ?? `${flower?.title ?? flower?.name ?? "flower"} flower`)}`;
  let outside = flowerImageLookupCache.get(cacheKey) ?? null;

  if (!outside && compareExternal) {
    const outsideStarted = performance.now();
    outside = await resolveFlowerThumbnail(flower, {
      provider: options.provider ?? "wikipedia",
      audience: options.audience ?? "gardener",
      query: options.query ?? `${flower?.title ?? flower?.name ?? "flower"} flower`
    });
    outside.searchMs = performance.now() - outsideStarted;
    flowerImageLookupCache.set(cacheKey, outside);
  }

  const outsideMs = outside?.searchMs ?? 0;

  if (localExists) {
    return {
      imagePath: flowerPicturePath(constructStrand),
      source: "local",
      localMs,
      outsideMs,
      deltaMs: outsideMs - localMs,
      thumbnail: flowerPicturePath(constructStrand),
      provider: "local",
      cacheHit: true,
      external: outside?.bestResult ?? null
    };
  }

  outside ??= {
    bestResult: null,
    provider: options.provider ?? "wikipedia",
    searchMs: 0
  };

  const thumbnail = outside.bestResult?.thumbnail ?? null;
  const imagePath = thumbnail
    ? await saveFlowerThumbnail(constructStrand, thumbnail, flower, outside.provider)
    : null;

  return {
    imagePath,
    source: imagePath ? outside.provider ?? "wikipedia" : "missing",
    localMs,
    outsideMs,
    deltaMs: outsideMs - localMs,
    thumbnail: thumbnail ?? imagePath,
    provider: outside.provider ?? "wikipedia",
    cacheHit: false,
    external: outside.bestResult
  };
}

function normalizeImportedFlower(payload = {}) {
  const source = payload.flower ?? payload.item ?? payload;
  const name = String(source.title ?? source.name ?? "Imported flower").trim();
  const extract = String(source.extract ?? source.description ?? "").trim();
  const provider = String(source.provider ?? source.source ?? "outside").trim() || "outside";
  const id = String(source.id ?? `${provider}-${slugify(name) || "flower"}`);
  const constructStrand = String(source.constructStrand ?? `imported-${slugify(name) || id}`);
  const color = source.anchors?.primary_color ?? source.primary_color ?? null;
  const sunlight = source.anchors?.sunlight ?? source.sunlight ?? null;
  const soil = source.anchors?.soil_type ?? source.soil_type ?? null;
  const bloom = source.anchors?.bloom_type ?? source.bloom_type ?? null;

  return {
    ...source,
    id,
    name,
    title: source.title ?? name,
    provider,
    source: "imported",
    constructStrand,
    questionIdeas: Array.isArray(source.questionIdeas) && source.questionIdeas.length > 0
      ? source.questionIdeas
      : [`Tell me about ${name}.`],
    anchors: {
      plant_type: source.anchors?.plant_type ?? source.plant_type ?? "flower",
      primary_color: color ?? null,
      secondary_color: source.anchors?.secondary_color ?? source.secondary_color ?? null,
      soil_type: soil ?? null,
      pH: source.anchors?.pH ?? source.pH ?? null,
      moisture: source.anchors?.moisture ?? source.moisture ?? null,
      sunlight: sunlight ?? null,
      height: source.anchors?.height ?? source.height ?? null,
      growth_habit: source.anchors?.growth_habit ?? source.growth_habit ?? null,
      bloom_type: bloom ?? null,
      fragrance: source.anchors?.fragrance ?? source.fragrance ?? null,
      season: source.anchors?.season ?? source.season ?? null,
      wildlife: source.anchors?.wildlife ?? source.wildlife ?? null,
      companions: source.anchors?.companions ?? source.companions ?? null,
      maintenance: source.anchors?.maintenance ?? source.maintenance ?? null,
      edible: source.anchors?.edible ?? source.edible ?? null
    },
    audienceNotes: source.audienceNotes ?? {},
    composites: Array.isArray(source.composites) ? source.composites : [],
    extract,
    description: source.description ?? extract
  };
}

async function readStaticFile(urlPath) {
  const cleaned = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = join(publicDir, cleaned.replace(/^\/+/, ""));

  if (!normalize(filePath).startsWith(normalize(publicDir))) {
    throw Object.assign(new Error("Invalid path"), { statusCode: 400 });
  }

  return readFile(filePath);
}

async function handleStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const extension = extname(pathname === "/" ? "/index.html" : pathname);

  try {
    const data = await readStaticFile(pathname);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  } catch (error) {
    sendText(res, 404, "Not found");
  }
}

async function handleApi(req, res, plants, flowers) {
  const url = new URL(req.url, "http://localhost");
  const query = url.searchParams.get("q") ?? "";
  const mode = url.searchParams.get("mode") ?? "compare";
  const audience = normalizeAudience(url.searchParams.get("audience") ?? "gardener");
  const provider = url.searchParams.get("provider") ?? "wikipedia";
  const region = normalizeRegion(url.searchParams.get("region") ?? "temperate");
  const runs = Number(url.searchParams.get("runs") ?? "20");
  const regionPlants = filterPlantsByRegion(plants, region).map((entry) => entry.plant);
  const tokenizedComparison = query.trim()
    ? buildSearchComparison(regionPlants, query, parseQuestion(query), region)
    : null;

  if (url.pathname === "/api/answer") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    if (mode === "llm") {
      sendJson(
        res,
        200,
        enrichResponseWithRegion(
          {
            ...(await answerWithLLM(query, regionPlants, { audience })),
            tokenizedComparison
          },
          plants,
          region
        )
      );
      return;
    }

    if (mode === "strandspace") {
      sendJson(
        res,
        200,
        enrichResponseWithRegion(
          {
            ...(await answerWithStrandspace(query, regionPlants, { audience })),
            tokenizedComparison
          },
          plants,
          region
        )
      );
      return;
    }

    if (mode === "hybrid" || mode === "outside") {
      sendJson(
        res,
        200,
        enrichResponseWithRegion(
          {
            ...(await answerWithHybrid(query, regionPlants, {
              audience,
              provider,
              scope: mode === "outside" ? "outside" : "hybrid"
            })),
            tokenizedComparison
          },
          plants,
          region
        )
      );
      return;
    }

    sendJson(
      res,
      200,
      enrichResponseWithRegion(
        {
          ...(await compareModes(query, regionPlants, { audience })),
          tokenizedComparison
        },
        plants,
        region
      )
    );
    return;
  }

  if (url.pathname === "/api/strands") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, inspectStrands(query, regionPlants, { audience }));
    return;
  }

  if (url.pathname === "/api/benchmark") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const safeRuns = Number.isFinite(runs) && runs > 0 ? runs : 20;
    const benchmark = await benchmarkModes(query, regionPlants, safeRuns, { audience });
    const searchBenchmark = query.trim()
      ? benchmarkSearchStrategies(query, regionPlants, safeRuns, region)
      : null;

    sendJson(
      res,
      200,
      {
        ...benchmark,
        search: searchBenchmark
      }
    );
    return;
  }

  if (url.pathname === "/api/atlas") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const limit = Number(url.searchParams.get("limit") ?? "40");
    const entries = filterPlantsByRegion(plants, region).map(({ plant, fit }) => ({
      ...summarizeAtlasEntry(plant, region),
      regionScore: fit.score,
      regionReasons: fit.reasons
    }));

    sendJson(res, 200, {
      region,
      profile: getRegionProfile(region),
      regions: getRegionOptions(),
      count: entries.length,
      results: entries.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 40)
    });
    return;
  }

  if (url.pathname === "/api/plants") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const limit = Number(url.searchParams.get("limit") ?? "24");
    const search = url.searchParams.get("q") ?? "";
    const resolveImages = url.searchParams.get("resolveImages") === "1";
    const parsed = search.trim() ? parseQuestion(search) : null;
    const regionMatches = filterPlantsByRegion(plants, region);
    const regionPlantMap = new Map(
      regionMatches.map(({ plant, fit }) => [plant.id ?? plant.constructStrand ?? plant.name, fit])
    );
    const plainQuery = isPlainPlantQuery(search);
    const colorQuery = looksLikeColorTraitQuery(search);
    const searchParsed = parsed && colorQuery && !parsed.attribute
      ? {
          ...parsed,
          attribute: "primary_color",
          trait: parsed.trait || search.trim(),
          intent: parsed.intent === "lookup" ? "lookup" : parsed.intent
        }
      : parsed;
    let rankedPlants = plainQuery
      ? searchPlantsByName(regionMatches.map(({ plant }) => plant), search)
      : searchParsed
      ? rankPlants(regionMatches.map(({ plant }) => plant), searchParsed)
      : regionMatches.map(({ plant, fit }) => ({
          ...plant,
          score: fit.score,
          matchedBy: { nameScore: 0, traitScore: fit.score }
        }));

    if (rankedPlants.length === 0 && colorQuery) {
      rankedPlants = rankPlants(
        regionMatches.map(({ plant }) => plant),
        searchParsed ?? {
          ...parseQuestion(`What color is ${search}?`),
          attribute: "primary_color",
          trait: search.trim(),
          intent: "lookup"
        }
      );
    }

    const results = rankedPlants.map((entry) => {
      const plant = entry.plant ? entry.plant : entry;
      const key = plant.id ?? plant.constructStrand ?? plant.name;
      const fit = regionPlantMap.get(key) ?? null;
      const summary = summarizeAtlasEntry(plant, region);
      return {
        ...summary,
        score: Number(entry.score ?? fit?.score ?? 0),
        matchedBy: entry.matchedBy ?? null,
        regionScore: fit?.score ?? summary.regionScore ?? 0,
        regionReasons: fit?.reasons ?? summary.regionReasons ?? []
      };
    });

    const strandMemoryEntries = readStrandMemoryEntries();
    const memoryApplied = applyMemoryBoost(results, search, strandMemoryEntries);
    const rankedResults = memoryApplied.results;

    const comparison = search.trim()
      ? buildSearchComparison(
          regionMatches.map(({ plant }) => plant),
          search,
          parsed ?? parseQuestion(search),
          region
        )
      : null;

    const enrichedResults = resolveImages && rankedResults.length > 0
      ? await (async () => {
          const hydrated = rankedResults.slice();
          try {
            const result = hydrated[0];
            const plant = plants.find((entry) => (entry.id ?? entry.constructStrand ?? entry.name) === (result.id ?? result.constructStrand ?? result.name)) ?? result;
            const thumbnail = await resolvePlantImageForSummary(plant, {
              region,
              provider: "wikipedia",
              audience: "gardener",
              query: `${result.name ?? plant.name ?? "plant"} plant`
            });

            if (thumbnail?.imageUrl) {
              hydrated[0] = {
                ...result,
                image: {
                  id: thumbnail.id,
                  strand: thumbnail.strand,
                  title: thumbnail.title,
                  imageUrl: thumbnail.imageUrl,
                  fullImageUrl: thumbnail.fullImageUrl ?? thumbnail.pageUrl ?? null,
                  pageUrl: thumbnail.pageUrl,
                  source: thumbnail.source,
                  imageStatus: thumbnail.imageStatus
                },
                imagePath: thumbnail.imageUrl ?? result.imagePath ?? null,
                imageLink: thumbnail.pageUrl ?? result.imageLink ?? null,
                imageSource: thumbnail.source ?? result.imageSource ?? "web",
                imageStrand: thumbnail.strand ?? result.imageStrand ?? result.constructStrand ?? result.id
              };
            }
          } catch {
            // Keep the strand image fallback.
          }
          return hydrated;
        })()
      : rankedResults;

    sendJson(res, 200, {
      region,
      query: search,
      count: enrichedResults.length,
      comparison,
      memory: {
        count: strandMemoryEntries.length,
        hit: Boolean(memoryApplied.memoryHit),
        plantId: memoryApplied.memoryHit?.plantId ?? null,
        plantName: memoryApplied.memoryHit?.plantName ?? null
      },
      results: enrichedResults.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 24)
    });
    return;
  }

  if (url.pathname === "/api/catalog") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, plants.map(summarizeCatalogEntry));
    return;
  }

  if (url.pathname === "/api/regions") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, {
      defaultRegion: getRegionProfile("temperate").region,
      regions: getRegionOptions()
    });
    return;
  }

  if (url.pathname === "/api/flowers") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const scope = (url.searchParams.get("scope") ?? "local").toLowerCase();
    const flowerQuery = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const flowerProvider = url.searchParams.get("provider") ?? "wikipedia";
    const limitValue = url.searchParams.get("limit");
    const localLimit = Number(limitValue ?? "100");
    const outsideLimit = Number(limitValue ?? "24");

    if (scope === "outside") {
      const query = flowerQuery || "flowers";
      let external = { results: [] };
      try {
        external = await searchExternalKnowledge(query, {
          provider: flowerProvider,
          limit: Number.isFinite(outsideLimit) && outsideLimit > 0 ? outsideLimit : 24
        });
      } catch {
        external = { results: [] };
      }

      const fallback = (await Promise.all(
        flowers.map(async (entry) => summarizeFlowerEntry(entry))
      ))
        .map((entry) => ({
          ...entry,
          source: "local-fallback",
          provider: "local"
        }))
        .sort((a, b) => scoreFlowerMatch(b, query) - scoreFlowerMatch(a, query) || a.name.localeCompare(b.name))
        .slice(0, Number.isFinite(outsideLimit) && outsideLimit > 0 ? outsideLimit : 24);

      sendJson(res, 200, {
        scope: "outside",
        provider: flowerProvider,
        query,
        results: external.results.length > 0 ? external.results : fallback,
        fallback: external.results.length === 0
      });
      return;
    }

    const localFlowers = (await Promise.all(flowers.map(async (entry) => summarizeFlowerEntry(entry))))
      .map((entry) => ({
        ...entry,
        score: scoreFlowerMatch(entry, flowerQuery)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      ;

    const results = (localFlowers.length > 0 ? localFlowers : await Promise.all(flowers.map(async (entry) => summarizeFlowerEntry(entry))))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, Number.isFinite(localLimit) && localLimit > 0 ? localLimit : 100);

    sendJson(res, 200, {
      scope: "local",
      query: flowerQuery,
      results,
      count: results.length
    });
    return;
  }

  if (url.pathname === "/api/flowers/image") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let payload = {};
    try {
      payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const sourceFlower = payload.flower ?? payload.item ?? payload;
    const flowerRecord = {
      ...sourceFlower,
      title: sourceFlower.title ?? sourceFlower.name,
      name: sourceFlower.name ?? sourceFlower.title,
      constructStrand: sourceFlower.constructStrand ?? sourceFlower.id ?? `flower-${slugify(sourceFlower.name ?? sourceFlower.title ?? "flower")}`
    };
    const image = await resolveFlowerPicture(flowerRecord, {
      provider: payload.provider ?? flowerRecord.provider ?? "wikipedia",
      audience: payload.audience ?? audience,
      query: payload.query ?? `${flowerRecord.title ?? flowerRecord.name ?? "flower"} flower`
    });

    sendJson(res, 200, {
      ok: true,
      flower: {
        ...flowerRecord,
        imagePath: image.imagePath
      },
      image
    });
    return;
  }

  if (url.pathname === "/api/flowers/import") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let payload = {};
    try {
      payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const imported = normalizeImportedFlower(payload);
    const existingIndex = flowers.findIndex(
      (flower) => flower.id === imported.id || normalizeText(flower.name) === normalizeText(imported.name)
    );
    const merged = existingIndex >= 0 ? { ...flowers[existingIndex], ...imported } : imported;

    if (existingIndex >= 0) {
      flowers[existingIndex] = merged;
    } else {
      flowers.unshift(merged);
    }

    const image = await resolveFlowerPicture(merged, {
      provider: "wikipedia",
      audience,
      query: `${merged.title ?? merged.name ?? "flower"} flower`
    });
    await saveFlowers(flowers, flowersPath);

    sendJson(res, 200, {
      ok: true,
      flower: {
        ...(await summarizeFlowerEntry(merged)),
        imagePath: image.imagePath
      },
      image,
      count: flowers.length
    });
    return;
  }

  if (url.pathname === "/api/feedback") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let payload = {};
    try {
      payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const requestAudience = normalizeAudience(payload.audience ?? audience);
    const state = recordFeedback({
      ...payload,
      audience: requestAudience
    });

    sendJson(res, 200, {
      ok: true,
      audience: requestAudience,
      updatedAt: state.updatedAt,
      feedbackCount: state.feedback.length
    });
    return;
  }

  if (url.pathname === "/api/strand-memory" || url.pathname === "/api/plants/learn") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let payload = {};
    try {
      payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const saved = upsertStrandMemory(payload);
    try {
      recordFeedback({
        question: payload.searchQuery ?? payload.question ?? "",
        audience: normalizeAudience(payload.audience ?? audience),
        mode: payload.mode ?? "strandspace",
        rating: "helpful",
        activatedStrands: Array.isArray(payload.activatedStrands) ? payload.activatedStrands : []
      });
    } catch {
      // Keep learning even if the feedback log fails.
    }

    sendJson(res, 200, {
      ok: true,
      memory: saved,
      count: readStrandMemoryEntries().length
    });
    return;
  }

  if (url.pathname === "/api/garden") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const plantId = url.searchParams.get("plantId") ?? "";
    sendJson(res, 200, {
      entries: readGardenEntries(),
      selected: plantId ? readGardenEntry(plantId) : null
    });
    return;
  }

  if (url.pathname === "/api/garden/note") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let payload = {};
    try {
      payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const entry = upsertGardenEntry({
      ...payload,
      note: payload.note ?? ""
    });

    sendJson(res, 200, {
      ok: true,
      entry,
      entries: readGardenEntries()
    });
    return;
  }

  if (url.pathname === "/api/garden/notes") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let payload = {};
    try {
      payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const entry = upsertGardenEntry({
      ...payload,
      note: payload.note ?? ""
    });

    sendJson(res, 200, {
      ok: true,
      entry,
      entries: readGardenEntries()
    });
    return;
  }

  if (url.pathname === "/api/garden/favorite") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let payload = {};
    try {
      payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const entry = favoritePlant(payload);

    sendJson(res, 200, {
      ok: true,
      entry,
      entries: readGardenEntries()
    });
    return;
  }

  if (url.pathname === "/api/garden/favorites") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let payload = {};
    try {
      payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const entry = favoritePlant(payload);

    sendJson(res, 200, {
      ok: true,
      entry,
      entries: readGardenEntries()
    });
    return;
  }

  sendText(res, 404, "Not found");
}

export async function createApp() {
  const plants = await loadPlants(plantsPath);
  const flowers = await loadFlowers(flowersPath);
  openGardenDatabase();

  return http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendText(res, 400, "Missing request URL");
        return;
      }

      const url = new URL(req.url, "http://localhost");

      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, plants, flowers);
        return;
      }

      if (req.method === "GET") {
        await handleStatic(req, res);
        return;
      }

      res.writeHead(405, {
        Allow: "GET",
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end("Method not allowed");
    } catch (error) {
      sendJson(res, 500, {
        error: "Internal server error",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await createApp();

  server.listen(port, () => {
    console.log(`Rootline Atlas running at http://localhost:${port}`);
  });
}
