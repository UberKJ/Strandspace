import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { parseQuestion, normalizeText } from "./parser.js";
import {
  buildStrandTrace,
  buildKeyHolderStrand,
  findBestPlant,
  findPlantsForTrait,
  rankPlants,
  activateAnchorStrands,
  activateCompositeStrands
} from "./matcher.js";
import {
  buildAudienceFactSheet,
  composeAudienceAnswer,
  loadLearningState,
  normalizeAudience,
  observeTrace,
  rankStrandsWithLearning,
  recordFeedback,
  summarizeCatalogEntry,
  defaultLearningPath
} from "./v2.js";
import { buildQuickRecallStrands } from "./strand-taxonomy.js";
import { getPlantSources } from "./plant-sources.js";
import { getCareTemplate } from "./care-templates.js";
import { buildPlantRegionFits } from "./atlas.js";
import { getPlantMedia } from "./plant-media.js";
import {
  buildExternalAnswer,
  buildExternalTrace,
  searchExternalKnowledge
} from "./external.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultPlantsPath = join(__dirname, "..", "data", "rootline.sqlite");
const defaultPlantsSeedPath = join(__dirname, "..", "data", "plants.json");
const defaultRegionPlantsSeedPath = join(__dirname, "..", "data", "region-plants.json");
const defaultFlowersPath = join(__dirname, "..", "data", "flowers.json");
const strandCache = new Map();
const DEFAULT_MATCH_THRESHOLD = 60;
const COLOR_HINTS = new Set([
  "yellow",
  "gold",
  "golden",
  "red",
  "pink",
  "purple",
  "blue",
  "white",
  "green",
  "orange",
  "coral",
  "magenta",
  "violet",
  "lilac",
  "amber",
  "saffron",
  "peach",
  "scarlet",
  "crimson",
  "silver",
  "ivory",
  "cream"
]);

function elapsedMs(started) {
  return Number(Math.max(performance.now() - started, 0.001).toFixed(3));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function simulatedLlmDelay(question, plant, relatedPlants) {
  const wordCount = normalizeText(question).split(" ").filter(Boolean).length;
  const plantBoost = plant ? 50 : 30;
  const listBoost = relatedPlants.length > 0 ? 20 : 0;
  return 140 + wordCount * 12 + plantBoost + listBoost;
}

function simulatedStrandDelay({ cacheHit, parsed, relatedPlants }) {
  const base = cacheHit ? 0 : 22;
  const traitBoost = parsed.intent === "list" ? 4 : 2;
  const listBoost = relatedPlants.length > 0 ? 3 : 0;
  return base + traitBoost + listBoost;
}

function toTextList(items) {
  return items.join(", ");
}

function readPlantSummary(plant, parsed = null) {
  if (!plant) {
    return null;
  }

  return {
    name: plant.name,
    constructStrand: plant.constructStrand,
    anchors: plant.anchors,
    composites: plant.composites,
    ...buildPlantMetadata(plant, parsed)
  };
}

function buildLocalTrace(plant, parsed, relatedPlants, audience) {
  if (plant) {
    return buildStrandTrace(plant, parsed, { source: "local" });
  }

  const keyHolder = buildKeyHolderStrand(null, parsed, {
    source: "local",
    label: relatedPlants.length ? relatedPlants.map((item) => item.name).join(", ") : parsed.trait || parsed.plantPhrase || parsed.normalized,
    relatedPlants,
    canRelate: relatedPlants.length > 0,
    reason: relatedPlants.length
      ? "trait strands align with the requested search shape"
      : "round peg in a square hole: no local construct fits this request"
  });
  const activated = relatedPlants.flatMap((item) => buildStrandTrace(item, parsed, { source: "local" }).activated);
  const ordered = rankStrandsWithLearning([keyHolder, ...activated], audience);

  return {
    keyHolder,
    anchors: [],
    composites: [],
    activated: ordered
  };
}

function buildFactSheet(plant, audience = "gardener") {
  return buildAudienceFactSheet(plant, audience);
}

function normalizeMatchThreshold(options = {}) {
  const threshold = Number(options.localThreshold ?? DEFAULT_MATCH_THRESHOLD);
  return Number.isFinite(threshold) ? threshold : DEFAULT_MATCH_THRESHOLD;
}

function buildNoMatchReason(question, parsed, score, threshold, source = "local") {
  const target = parsed.plantPhrase || parsed.trait || parsed.normalized || question;
  const prefix = source === "outside" ? "No strong outside match" : "No strong local match";

  if (parsed.intent === "list") {
    return `${prefix} for "${target}". The current strand evidence is too weak to list matches with confidence.`;
  }

  return `${prefix} for "${target}". The best score was ${score.toFixed(1)} and the match threshold is ${threshold.toFixed(1)}.`;
}

function buildNoMatchPayload({
  mode,
  question,
  parsed,
  audience,
  score,
  threshold,
  suggestions = [],
  source = "local",
  keyHolderLabel = null
}) {
  const keyHolder = buildKeyHolderStrand(null, parsed, {
    source,
    label: keyHolderLabel ?? parsed.plantPhrase ?? parsed.trait ?? parsed.normalized,
    canRelate: false,
    reason: buildNoMatchReason(question, parsed, score, threshold, source)
  });
  const activatedStrands = [keyHolder];
  const answer = composeAudienceAnswer({
    audience,
    plant: null,
    parsed,
    baseAnswer: buildNoMatchReason(question, parsed, score, threshold, source),
    activatedStrands,
    relatedPlants: []
  });

  return {
    mode,
    audience,
    question,
    parsed,
    answer,
    matchedPlant: null,
    relatedPlants: [],
    factSheet: [],
    keyHolder,
    activatedStrands,
    suggestions,
    reused: false,
    cacheHit: false,
    matchStatus: "no_match",
    matchConfidence: score,
    matchThreshold: threshold,
    noMatchReason: keyHolder.relationReason,
    latencyMs: 0
  };
}

function summarizeMethodResult(result) {
  const activated = result.activatedStrands ?? [];
  const factSheet = result.factSheet ?? [];
  const strandKeys = activated.map((strand) => `${strand.kind}:${strand.name}`);
  const compositeKeys = activated
    .filter((strand) => strand.kind === "composite")
    .map((strand) => strand.name);

  return {
    answer: result.answer,
    matchedPlant: result.matchedPlant?.name ?? null,
    activatedCount: strandKeys.length,
    compositeCount: compositeKeys.length,
    factCount: factSheet.length,
    strandKeys,
    factLabels: factSheet.map((item) => item.label)
  };
}

function buildComparison(llm, strandspace) {
  const llmSummary = summarizeMethodResult(llm);
  const strandSummary = summarizeMethodResult(strandspace);
  const sharedStrands = llmSummary.strandKeys.filter((key) =>
    strandSummary.strandKeys.includes(key)
  );
  const sharedFacts = llmSummary.factLabels.filter((label) =>
    strandSummary.factLabels.includes(label)
  );

  return {
    sameAnswer: normalizeText(llm.answer) === normalizeText(strandspace.answer),
    samePlant: llmSummary.matchedPlant === strandSummary.matchedPlant,
    llm: llmSummary,
    strandspace: strandSummary,
    sharedStrands,
    llmOnlyStrands: llmSummary.strandKeys.filter((key) => !sharedStrands.includes(key)),
    strandspaceOnlyStrands: strandSummary.strandKeys.filter((key) => !sharedStrands.includes(key)),
    sharedFacts
  };
}

function buildPlantMetadata(plant, parsed = null) {
  if (!plant) {
    return {
      sources: [],
      careTemplate: null,
      quickStrands: [],
      regionFits: [],
      image: null
    };
  }

  const media = getPlantMedia(plant);
  return {
    sources: getPlantSources(plant),
    careTemplate: getCareTemplate(plant),
    quickStrands: buildQuickRecallStrands(plant, parsed),
    regionFits: buildPlantRegionFits(plant),
    image: media
        ? {
          id: media.id ?? plant.id,
          strand: media.strand ?? plant.constructStrand,
          title: media.title ?? plant.name,
          imageUrl: media.imageUrl ?? null,
          fullImageUrl: media.fullImageUrl ?? media.pageUrl ?? media.searchUrl ?? null,
          pageUrl: media.pageUrl ?? media.searchUrl ?? null,
          source: media.source ?? "web",
          imageStatus: media.imageStatus ?? "resolved"
        }
      : {
          id: plant.id,
          strand: plant.constructStrand,
          title: plant.name,
          imageUrl: null,
        pageUrl: null,
        source: "missing",
        imageStatus: "missing"
        },
    imagePath: media?.imageUrl ?? null,
    imageLink: media?.pageUrl ?? media?.searchUrl ?? null,
    imageStrand: media?.strand ?? plant.constructStrand
  };
}

function extractColorHints(parsed) {
  const hints = new Set();
  const tokens = [
    ...parsed.tokens,
    ...parsed.keywords,
    ...(parsed.trait ? parsed.trait.split(/\s+/) : []),
    ...(parsed.plantPhrase ? parsed.plantPhrase.split(/\s+/) : [])
  ];

  for (const token of tokens) {
    if (COLOR_HINTS.has(token)) {
      hints.add(token);
    }
  }

  return [...hints];
}

function plantMatchesColorHint(plant, hints) {
  if (hints.length === 0) {
    return false;
  }

  const anchors = plant.anchors ?? {};
  const haystack = normalizeText([anchors.primary_color, anchors.secondary_color, plant.name, ...(plant.aliases ?? [])].filter(Boolean).join(" "));
  return hints.some((hint) => haystack.includes(hint));
}

function hasSpecificPlantMention(parsed, plants) {
  const haystack = normalizeText([parsed.normalized, parsed.plantPhrase].filter(Boolean).join(" "));
  if (!haystack) {
    return false;
  }

  return plants.some((plant) => {
    const names = [plant.name, plant.constructStrand, ...(plant.aliases ?? [])]
      .filter(Boolean)
      .map((value) => normalizeText(value))
      .filter((value) => value.length >= 4);
    return names.some((name) => haystack.includes(name));
  });
}

function shouldTreatAsTraitList(parsed, plants) {
  const hints = extractColorHints(parsed);
  const broadTraitWords = /\b(plant|plants|flower|flowers|herb|tree|shrub|succulent|fern|bulb|annual|perennial|vine|grass|garden)\b/i.test(parsed.normalized);
  const hasTraitSignal = Boolean(parsed.attribute || hints.length > 0 || broadTraitWords);
  return hasTraitSignal && !hasSpecificPlantMention(parsed, plants);
}

function broadTraitListParsed(parsed) {
  const hints = extractColorHints(parsed);
  return {
    ...parsed,
    intent: "list",
    attribute: parsed.attribute ?? (hints.length > 0 ? "primary_color" : null),
    trait: parsed.trait || parsed.plantPhrase || hints.join(" "),
    plantPhrase: parsed.plantPhrase || parsed.normalized
  };
}

function buildFollowUpSuggestions(question, plants, parsed, audience = "gardener") {
  const colorHints = extractColorHints(parsed);
  const normalizedAudience = normalizeAudience(audience);
  const fallbackParsed = {
    ...parsed,
    normalized: parsed.trait || parsed.plantPhrase || colorHints.join(" ") || parsed.normalized,
    trait: parsed.trait || colorHints.join(" "),
    intent: "list"
  };
  const ranked = rankPlants(plants, fallbackParsed).filter((plant) => plant.score > 0);
  const colorMatches = colorHints.length
    ? ranked.filter((plant) => plantMatchesColorHint(plant, colorHints))
    : ranked;
  const topMatches = (colorMatches.length > 0 ? colorMatches : ranked).slice(0, 8);
  const suggestions = [];

  if (colorHints.length > 0) {
    suggestions.push({
      label: `Show all ${toTextList(colorHints)} strands`,
      question: `Which plants are ${toTextList(colorHints)}?`,
      reason: "This broader color-strand query compares every current match before narrowing back down.",
      kind: "broad"
    });
  } else if (!question || normalizeText(question).split(" ").filter(Boolean).length <= 2) {
    suggestions.push({
      label: "Show me related strands",
      question: "Which plants are most closely related?",
      reason: "The question is broad, so Strandspace can show you the closest local strand matches.",
      kind: "broad"
    });
  }

  for (const plant of topMatches) {
    const mainColor = plant.anchors?.primary_color ?? "plant";
    suggestions.push({
      label: `${plant.name} - ${mainColor}`,
      question: `What color is ${plant.name}?`,
      reason: `Matched the ${normalizedAudience} strand memory for ${mainColor}.`,
      kind: "plant",
    matchedPlant: readPlantSummary(plant, parsed)
    });
  }

  return suggestions;
}

function readJsonSeed(filePath) {
  const contents = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(contents);
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain an array of plant records`);
  }
  return parsed;
}

function readJsonSeedOptional(filePath) {
  try {
    return readJsonSeed(filePath);
  } catch {
    return [];
  }
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

function enrichPlantSeedWithMedia(plant) {
  const media = getPlantMedia(plant);
  if (!media) {
    return plant;
  }

  return {
    ...plant,
    imageUrl: media.imageUrl ?? null,
    fullImageUrl: media.fullImageUrl ?? media.pageUrl ?? media.searchUrl ?? null,
    imagePageUrl: media.pageUrl ?? media.searchUrl ?? null,
    imageSource: media.source ?? "web",
    imageStatus: media.imageStatus ?? (media.imageUrl ? "resolved" : "linked"),
    imageStrand: media.strand ?? plant.constructStrand
  };
}

function createPlantsDatabase(filePath, seedPlants) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS plants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      constructStrand TEXT NOT NULL,
      regionHint TEXT,
      data TEXT NOT NULL,
      searchText TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plants_searchText ON plants(searchText);
    CREATE INDEX IF NOT EXISTS idx_plants_regionHint ON plants(regionHint);
  `);
  db.exec("DELETE FROM plants;");

  const insert = db.prepare(
    "INSERT OR REPLACE INTO plants (id, name, constructStrand, regionHint, data, searchText) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const plant of seedPlants) {
    insert.run(
      plant.id,
      plant.name,
      plant.constructStrand,
      plant.regionHint ?? null,
      JSON.stringify(plant),
      normalizePlantSearchText(plant)
    );
  }

  return db;
}

function loadPlantsFromDatabase(filePath = defaultPlantsPath) {
  const seedPlants = [
    ...readJsonSeed(defaultPlantsSeedPath),
    ...readJsonSeed(defaultRegionPlantsSeedPath)
  ].map(enrichPlantSeedWithMedia);
  const db = createPlantsDatabase(filePath, seedPlants);
  const rows = db.prepare("SELECT data FROM plants ORDER BY name COLLATE NOCASE ASC").all();
  return rows.map((row) => JSON.parse(row.data));
}

export async function loadPlants(filePath = defaultPlantsPath) {
  if (String(filePath).endsWith(".json")) {
    return readJsonSeed(filePath);
  }

  return loadPlantsFromDatabase(filePath);
}

export async function loadFlowers(filePath = defaultFlowersPath) {
  const contents = await readFile(filePath, "utf8");
  const flowers = JSON.parse(contents);

  if (!Array.isArray(flowers)) {
    throw new Error("flowers.json must contain an array of flower records");
  }

  return flowers;
}

export async function saveFlowers(flowers, filePath = defaultFlowersPath) {
  if (!Array.isArray(flowers)) {
    throw new Error("flowers must be an array of flower records");
  }

  await writeFile(filePath, `${JSON.stringify(flowers, null, 2)}\n`, "utf8");
  return flowers;
}

function buildAttributeAnswer(plant, parsed, strands) {
  const anchors = plant.anchors ?? {};

  if (parsed.attribute === "primary_color") {
    return `${plant.name} is mostly ${anchors.primary_color}${anchors.secondary_color ? ` with ${anchors.secondary_color} accents` : ""}.`;
  }

  if (parsed.attribute === "soil_type") {
    const composite = strands.composites.find((item) => item.name.includes("soil"));
    return `${plant.name} likes ${anchors.soil_type} and a pH around ${anchors.pH}. ${composite ? composite.value : ""}`.trim();
  }

  if (parsed.attribute === "sunlight") {
    return `${plant.name} prefers ${anchors.sunlight}. It stays healthiest with ${anchors.moisture} moisture and a ${anchors.growth_habit} habit.`;
  }

  if (parsed.attribute === "height") {
    return `${plant.name} usually reaches ${anchors.height} as a ${anchors.growth_habit}.`;
  }

  if (parsed.attribute === "moisture") {
    return `${plant.name} does best with ${anchors.moisture} moisture in ${anchors.soil_type}.`;
  }

  if (parsed.attribute === "pH") {
    return `${plant.name} likes soil around pH ${anchors.pH}.`;
  }

  if (parsed.attribute === "fragrance") {
    return `${plant.name} has ${anchors.fragrance}${anchors.bloom_type ? ` and blooms as a ${anchors.bloom_type}` : ""}.`;
  }

  if (parsed.attribute === "season") {
    return `${plant.name} is most active in ${anchors.season}, with ${anchors.bloom_type} and ${anchors.sunlight} growth.`;
  }

  if (parsed.attribute === "wildlife") {
    return `${plant.name} attracts ${anchors.wildlife} and is useful for a ${anchors.season} garden.`;
  }

  if (parsed.attribute === "companions") {
    return `${plant.name} pairs well with ${anchors.companions}.`;
  }

  if (parsed.attribute === "maintenance") {
    return `${plant.name} benefits from ${anchors.maintenance}.`;
  }

  if (parsed.attribute === "edible") {
    return `${plant.name} is ${anchors.edible ?? "not typically grown as an edible plant"}.`;
  }

  return `${plant.name} is a ${anchors.plant_type} with ${anchors.primary_color} as the main color, ${anchors.sunlight} exposure, and ${anchors.height} height.`;
}

function buildListAnswer(plants, parsed) {
  if (plants.length === 0) {
    return `No plants matched "${parsed.trait || parsed.normalized}".`;
  }

  const names = toTextList(plants.map((plant) => plant.name));
  return `Plants that fit "${parsed.trait || parsed.normalized}" include ${names}.`;
}

function localMatchScore(plants, parsed) {
  const ranked = rankPlants(plants, parsed);
  const best = ranked[0] ?? null;
  return {
    ranked,
    best,
    score: best?.score ?? 0
  };
}

function buildLLMAnswer(question, plant, parsed, relatedPlants, audience, trace) {
  const baseAnswer =
    parsed.intent === "list"
      ? buildListAnswer(relatedPlants, parsed)
      : !plant
        ? `I could not confidently match "${question}" to a plant in the local catalog.`
        : buildAttributeAnswer(plant, parsed, trace);

  return composeAudienceAnswer({
    audience,
    plant,
    parsed,
    baseAnswer,
    activatedStrands: trace.activated ?? [],
    relatedPlants
  });
}

function buildStrandspaceAnswer(question, plant, parsed, relatedPlants, audience, trace) {
  if (parsed.intent === "list") {
    const names = relatedPlants.map((item) => item.name);
    const activated = relatedPlants.flatMap((item) => buildStrandTrace(item, parsed, { source: "local" }).activated);
    const keyHolder = buildKeyHolderStrand(null, parsed, {
      source: "local",
      label: names.join(", ") || parsed.trait || parsed.normalized,
      relatedPlants,
      canRelate: names.length > 0,
      reason: names.length
        ? "trait strands align across the listed plants"
        : "round peg in a square hole: no local plant list matches this request"
    });
    const unique = [
      ...new Map([keyHolder, ...activated].map((strand) => [`${strand.kind}:${strand.name}:${strand.plant}`, strand])).values()
    ];
    const ordered = rankStrandsWithLearning(unique, audience);

    const baseAnswer = names.length
      ? `Strandspace matched ${toTextList(names)} by reusing the relevant strand links already attached to those plants.`
      : `Strandspace found no matching plants for "${parsed.trait || parsed.normalized}".`;

    return {
      answer: composeAudienceAnswer({
        audience,
        plant: null,
        parsed,
        baseAnswer,
        activatedStrands: ordered,
        relatedPlants
      }),
      keyHolder,
      activatedStrands: ordered,
    matchedPlants: relatedPlants.map((item) => readPlantSummary(item, parsed))
    };
  }

  if (!plant) {
    const keyHolder = buildKeyHolderStrand(null, parsed, {
      source: "local",
      label: parsed.plantPhrase || parsed.normalized,
      canRelate: false,
      reason: "round peg in a square hole: no local plant construct fits this question"
    });
    return {
      answer: composeAudienceAnswer({
        audience,
        plant: null,
        parsed,
        baseAnswer: `Strandspace could not resolve "${question}" to a known plant construct.`,
        activatedStrands: [],
        relatedPlants
      }),
      keyHolder,
      activatedStrands: [],
      matchedPlants: []
    };
  }

  const ordered = rankStrandsWithLearning(trace.activated, audience);
  return {
    answer: composeAudienceAnswer({
      audience,
      plant,
      parsed,
      baseAnswer: buildAttributeAnswer(plant, parsed, { ...trace, activated: ordered }),
      activatedStrands: ordered,
      relatedPlants
    }),
    keyHolder: trace.keyHolder ?? ordered[0] ?? null,
    activatedStrands: ordered,
    matchedPlants: [readPlantSummary(plant, parsed)]
  };
}

function cacheKeyFor(parsed, plant, relatedPlants, audience) {
  const plantKey = plant?.constructStrand ?? relatedPlants.map((item) => item.constructStrand).join("|") ?? "none";
  return [
    normalizeAudience(audience),
    parsed.intent,
    parsed.attribute ?? "none",
    parsed.trait || parsed.plantPhrase || parsed.normalized,
    plantKey
  ].join("::");
}

function buildHybridLocalPayload(local, audience, provider = "wikipedia") {
  return {
    mode: "hybrid",
    source: "local",
    provider,
    audience,
    question: local.question,
    parsed: local.parsed,
    answer: local.strandspace.answer,
    matchedPlant: local.strandspace.matchedPlant,
    relatedPlants: local.strandspace.relatedPlants,
    factSheet: local.strandspace.factSheet,
    keyHolder: local.strandspace.keyHolder ?? local.llm?.keyHolder ?? null,
    activatedStrands: local.strandspace.activatedStrands,
    reused: local.strandspace.reused,
    cacheHit: local.strandspace.cacheHit,
    latencyMs: local.strandspace.latencyMs,
    suggestions: local.suggestions ?? [],
    local,
    llm: local.llm,
    strandspace: local.strandspace,
    comparison: local.comparison,
    localConfidence: local.localConfidence,
    external: null,
    externalResults: []
  };
}

export async function answerWithLLM(question, plants, options = {}) {
  const started = performance.now();
  const parsed = parseQuestion(question);
  const audience = normalizeAudience(options.audience ?? parsed.audienceHint ?? "gardener");
  const threshold = normalizeMatchThreshold(options);
  const listParsed = shouldTreatAsTraitList(parsed, plants) ? broadTraitListParsed(parsed) : parsed;
  const localAnalysis = localMatchScore(plants, listParsed);
  const plant = listParsed.intent === "list" ? null : localAnalysis.best;
  const relatedPlants = listParsed.intent === "list" ? findPlantsForTrait(plants, listParsed) : [];
  const trace = buildLocalTrace(plant, listParsed, relatedPlants, audience);
  const suggestions = buildFollowUpSuggestions(question, plants, parsed, audience);

  if ((listParsed.intent === "list" && relatedPlants.length === 0) || (listParsed.intent !== "list" && (!plant || localAnalysis.score < threshold))) {
    const payload = buildNoMatchPayload({
      mode: "llm",
      question,
      parsed: listParsed,
      audience,
      score: localAnalysis.score,
      threshold,
      suggestions,
      source: "local"
    });
    observeTrace({ audience, activatedStrands: payload.activatedStrands, question, mode: "llm" });
    return {
      ...payload,
      latencyMs: elapsedMs(started)
    };
  }

  await delay(simulatedLlmDelay(question, plant, relatedPlants));
  const ordered = rankStrandsWithLearning(trace.activated, audience);
  const answer = buildLLMAnswer(question, plant, listParsed, relatedPlants, audience, {
    ...trace,
    activated: ordered
  });
  observeTrace({ audience, activatedStrands: ordered, question, mode: "llm" });

  return {
    mode: "llm",
    audience,
    question,
    parsed: listParsed,
    answer,
    matchedPlant: plant ? readPlantSummary(plant, parsed) : null,
    relatedPlants: relatedPlants.map((item) => readPlantSummary(item, parsed)),
    factSheet: plant ? buildFactSheet(plant, audience) : relatedPlants.flatMap((item) => buildFactSheet(item, audience)),
    keyHolder: trace.keyHolder ?? ordered[0] ?? null,
    activatedStrands: ordered,
    suggestions,
    reused: false,
    cacheHit: false,
    latencyMs: elapsedMs(started)
  };
}

export async function answerWithStrandspace(question, plants, options = {}) {
  const started = performance.now();
  const parsed = parseQuestion(question);
  const audience = normalizeAudience(options.audience ?? parsed.audienceHint ?? "gardener");
  const threshold = normalizeMatchThreshold(options);
  const listParsed = shouldTreatAsTraitList(parsed, plants) ? broadTraitListParsed(parsed) : parsed;
  const localAnalysis = localMatchScore(plants, listParsed);
  const strongPlant = listParsed.intent === "list" ? null : (localAnalysis.best && localAnalysis.score >= threshold ? localAnalysis.best : null);
  const plant = listParsed.intent === "list" ? null : localAnalysis.best;
  const relatedPlants = listParsed.intent === "list" ? findPlantsForTrait(plants, listParsed) : [];
  const key = cacheKeyFor(listParsed, strongPlant, relatedPlants, audience);

  if (strandCache.has(key)) {
    const cached = strandCache.get(key);
    return {
      ...cached,
      cacheHit: true,
      reused: true,
      latencyMs: elapsedMs(started)
    };
  }

  const suggestions = buildFollowUpSuggestions(question, plants, parsed, audience);

  if ((listParsed.intent === "list" && relatedPlants.length === 0) || (listParsed.intent !== "list" && (!plant || localAnalysis.score < threshold))) {
    const payload = buildNoMatchPayload({
      mode: "strandspace",
      question,
      parsed: listParsed,
      audience,
      score: localAnalysis.score,
      threshold,
      suggestions,
      source: "local"
    });
    strandCache.set(key, payload);
    observeTrace({ audience, activatedStrands: payload.activatedStrands, question, mode: "strandspace" });
    return {
      ...payload,
      latencyMs: elapsedMs(started)
    };
  }

  await delay(simulatedStrandDelay({ cacheHit: false, parsed: listParsed, relatedPlants }));
  const trace = buildLocalTrace(plant, listParsed, relatedPlants, audience);
  const ordered = rankStrandsWithLearning(trace.activated, audience);
  const result = buildStrandspaceAnswer(question, plant, listParsed, relatedPlants, audience, {
    ...trace,
    activated: ordered
  });
  observeTrace({ audience, activatedStrands: ordered, question, mode: "strandspace" });
  const payload = {
    mode: "strandspace",
    audience,
    question,
    parsed: listParsed,
    answer: result.answer,
    matchedPlant: plant ? readPlantSummary(plant, parsed) : null,
    relatedPlants: relatedPlants.map((item) => readPlantSummary(item, parsed)),
    factSheet: plant ? buildFactSheet(plant, audience) : relatedPlants.flatMap((item) => buildFactSheet(item, audience)),
    keyHolder: result.keyHolder ?? trace.keyHolder ?? ordered[0] ?? null,
    activatedStrands: result.activatedStrands,
    suggestions,
    reused: false,
    cacheHit: false,
    latencyMs: elapsedMs(started)
  };

  strandCache.set(key, payload);
  return payload;
}

export async function answerWithHybrid(question, plants, options = {}) {
  const started = performance.now();
  const parsed = parseQuestion(question);
  const audience = normalizeAudience(options.audience ?? parsed.audienceHint ?? "gardener");
  const learningState = loadLearningState();
  const listParsed = shouldTreatAsTraitList(parsed, plants) ? broadTraitListParsed(parsed) : parsed;
  const local = await compareModes(question, plants, { audience });
  const localAnalysis = localMatchScore(plants, listParsed);
  const threshold = normalizeMatchThreshold(options);
  const externalThreshold = Number(options.externalThreshold ?? 20);
  const forceExternal = options.scope === "outside" || options.source === "outside";
  const useExternal =
    forceExternal ||
    !localAnalysis.best ||
    localAnalysis.score < threshold;

  if (!useExternal) {
    return buildHybridLocalPayload(
      {
        ...local,
        question,
        parsed,
        localConfidence: localAnalysis.score
      },
      audience,
      options.provider
    );
  }

  const external = await searchExternalKnowledge(question, {
    parsed,
    audience,
    learningState,
    fetchImpl: options.fetchImpl,
    provider: options.provider,
    limit: options.limit ?? 3
  });
  const bestExternal = external.results[0] ?? null;

  if (!bestExternal) {
    const suggestions = buildFollowUpSuggestions(question, plants, parsed, audience);
    const payload = buildNoMatchPayload({
      mode: "hybrid",
      question,
      parsed,
      audience,
      score: localAnalysis.score,
      threshold,
      suggestions,
      source: forceExternal ? "outside" : "local",
      keyHolderLabel: parsed.plantPhrase || parsed.trait || parsed.normalized
    });
    return {
      ...payload,
      source: forceExternal ? "outside" : "local",
      provider: options.provider ?? "wikipedia",
      localConfidence: localAnalysis.score,
      external: null,
      externalResults: [],
      local,
      llm: local.llm,
      strandspace: local.strandspace,
      comparison: local.comparison
    };
  }

  if (Number(bestExternal.searchScore ?? 0) < externalThreshold) {
    const suggestions = buildFollowUpSuggestions(question, plants, parsed, audience);
    const payload = buildNoMatchPayload({
      mode: "hybrid",
      question,
      parsed,
      audience,
      score: Number(bestExternal.searchScore ?? 0),
      threshold: externalThreshold,
      suggestions,
      source: "outside",
      keyHolderLabel: bestExternal.title
    });
    observeTrace({ audience, activatedStrands: payload.activatedStrands, question, mode: "hybrid-outside" }, learningState);
    return {
      ...payload,
      provider: bestExternal.provider ?? options.provider ?? "wikipedia",
      localConfidence: localAnalysis.score,
      external: bestExternal,
      externalResults: external.results,
      llm: local.llm,
      strandspace: local.strandspace,
      comparison: local.comparison,
      local
    };
  }

  const externalTrace = buildExternalTrace(parsed, bestExternal, audience, learningState);
  const ordered = rankStrandsWithLearning(externalTrace.activated, audience, learningState);
  const suggestions = buildFollowUpSuggestions(question, plants, parsed, audience);
  observeTrace({ audience, activatedStrands: ordered, question, mode: "hybrid-outside" }, learningState);

  return {
    mode: "hybrid",
    source: "outside",
    provider: bestExternal.provider ?? options.provider ?? "wikipedia",
    audience,
    question,
    parsed,
    answer: buildExternalAnswer(question, parsed, bestExternal, audience, learningState),
    matchedPlant: null,
    relatedPlants: [],
    factSheet: [],
    keyHolder: externalTrace.keyHolder ?? ordered[0] ?? null,
    activatedStrands: ordered,
    suggestions,
    reused: false,
    cacheHit: false,
    latencyMs: elapsedMs(started),
    localConfidence: localAnalysis.score,
    external: bestExternal,
    externalResults: external.results,
    llm: local.llm,
    strandspace: local.strandspace,
    comparison: local.comparison,
    local
  };
}

export async function compareModes(question, plants, options = {}) {
  const llm = await answerWithLLM(question, plants, options);
  const strandspace = await answerWithStrandspace(question, plants, options);
  const suggestions = buildFollowUpSuggestions(question, plants, parseQuestion(question), options.audience ?? llm.audience ?? "gardener");

  return {
    question,
    parsed: llm.parsed,
    audience: llm.audience,
    llm,
    strandspace,
    comparison: buildComparison(llm, strandspace),
    suggestions
  };
}

export async function benchmarkModes(question, plants, runs = 20, options = {}) {
  const llmTimes = [];
  const strandTimes = [];
  const llmWallTimes = [];
  const strandWallTimes = [];
  let strandCacheHits = 0;
  const audience = normalizeAudience(options.audience ?? "gardener");

  for (let index = 0; index < runs; index += 1) {
    const llmStarted = performance.now();
    const llm = await answerWithLLM(question, plants, { audience });
    llmWallTimes.push(elapsedMs(llmStarted));

    const strandStarted = performance.now();
    const strand = await answerWithStrandspace(question, plants, { audience });
    strandWallTimes.push(elapsedMs(strandStarted));

    llmTimes.push(llm.latencyMs);
    strandTimes.push(strand.latencyMs);
    if (strand.cacheHit) {
      strandCacheHits += 1;
    }
  }

  const average = (values) =>
    Number(
      Math.max(
        values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
        0.001
      ).toFixed(3)
    );

  return {
    question,
    audience,
    runs,
    llm: {
      averageMs: average(llmTimes),
      wallClockAverageMs: average(llmWallTimes),
      repeatedGeneration: true
    },
    strandspace: {
      averageMs: average(strandTimes),
      wallClockAverageMs: average(strandWallTimes),
      cacheHits: strandCacheHits,
      cacheHitRate: runs ? Math.round((strandCacheHits / runs) * 100) : 0
    }
  };
}

export function inspectStrands(question, plants, options = {}) {
  const parsed = parseQuestion(question);
  const audience = normalizeAudience(options.audience ?? parsed.audienceHint ?? "gardener");
  const listParsed = shouldTreatAsTraitList(parsed, plants) ? broadTraitListParsed(parsed) : parsed;
  const plant = listParsed.intent === "list" ? null : findBestPlant(plants, listParsed);
  const relatedPlants = listParsed.intent === "list" ? findPlantsForTrait(plants, listParsed) : [];
  const activated = buildLocalTrace(plant, listParsed, relatedPlants, audience);

  return {
    parsed: listParsed,
    audience,
    matchedPlant: plant ? readPlantSummary(plant, listParsed) : null,
    relatedPlants: relatedPlants.map((item) => readPlantSummary(item, listParsed)),
    keyHolder: activated.keyHolder ?? null,
    activatedStrands: rankStrandsWithLearning(activated.activated ?? [], audience),
    anchors: activated.anchors ?? [],
    composites: activated.composites ?? []
  };
}

export { defaultPlantsPath, defaultFlowersPath, loadLearningState, recordFeedback, summarizeCatalogEntry, defaultLearningPath };
