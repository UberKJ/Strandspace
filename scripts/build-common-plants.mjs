import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "../strandspace/parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "..", "data");
const plantsPath = join(dataDir, "plants.json");
const plantMediaPath = join(dataDir, "plant-media.json");
const plantSourcesPath = join(dataDir, "plant-sources.json");
const legacyPlantsPath = join(dataDir, "plants.json");
const legacyRegionPlantsPath = join(dataDir, "region-plants.json");

const TARGET_COUNT = 220;
const MINIMUM_COUNT = 140;
const CONCURRENCY = 6;

const CATEGORY_SPECS = [
  { name: "House plants", plantType: "houseplant" },
  { name: "Herbs", plantType: "herb" },
  { name: "Vegetables", plantType: "vegetable" },
  { name: "Trees", plantType: "tree" },
  { name: "Shrubs", plantType: "shrub" },
  { name: "Flowering plants", plantType: "flower" },
  { name: "Perennials", plantType: "perennial" },
  { name: "Succulents", plantType: "succulent" },
  { name: "Ferns", plantType: "fern" },
  { name: "Bulbs", plantType: "bulb" },
  { name: "Annual plants", plantType: "annual" },
  { name: "Aquatic plants", plantType: "aquatic plant" },
  { name: "Ornamental grasses", plantType: "ornamental grass" },
  { name: "Fruit trees", plantType: "fruit tree" },
  { name: "Vines", plantType: "vine" },
  { name: "Cacti", plantType: "cactus" },
  { name: "Orchids", plantType: "orchid" },
  { name: "Groundcovers", plantType: "groundcover" }
];

const SEED_TITLES = [
  { title: "Basil", category: "Herbs" },
  { title: "Rosemary", category: "Herbs" },
  { title: "Lavandula", category: "Shrubs" },
  { title: "Common sunflower", category: "Flowering plants" },
  { title: "Hosta", category: "Perennials" },
  { title: "Echinacea", category: "Perennials" },
  { title: "Agave", category: "Succulents" },
  { title: "Salvia", category: "Herbs" },
  { title: "Monstera deliciosa", category: "House plants" },
  { title: "Ficus elastica", category: "House plants" },
  { title: "Nepenthes", category: "House plants" },
  { title: "Aloe vera", category: "Succulents" },
  { title: "Lavender", category: "Shrubs" },
  { title: "Tomato", category: "Vegetables" },
  { title: "Ocimum tenuiflorum", category: "Herbs" },
  { title: "Strelitzia", category: "House plants" },
  { title: "Tulip", category: "Bulbs" },
  { title: "Dahlia", category: "Flowering plants" },
  { title: "Camellia", category: "Shrubs" },
  { title: "Rosa", category: "Shrubs" }
];

const PLANT_KEYWORDS = [
  "plant",
  "flower",
  "flowering",
  "tree",
  "shrub",
  "herb",
  "vegetable",
  "fruit",
  "succulent",
  "fern",
  "grass",
  "vine",
  "bulb",
  "orchid",
  "houseplant",
  "cactus",
  "annual",
  "perennial",
  "aquatic",
  "taxon",
  "genus",
  "species",
  "cultivar"
];

const STRONG_PLANT_PATTERNS = [
  "species of plant",
  "species of flowering plant",
  "genus of plants",
  "genus of flowering plants",
  "plant in the family",
  "flowering plant",
  "cultivar",
  "houseplant",
  "tree",
  "shrub",
  "herb",
  "succulent",
  "fern",
  "orchid",
  "cactus",
  "bulb",
  "aquatic plant",
  "perennial plant",
  "annual plant"
];

const HABIT_TERMS = [
  "tree",
  "shrub",
  "subshrub",
  "vine",
  "climber",
  "herb",
  "fern",
  "succulent",
  "cactus",
  "grass",
  "bulb",
  "aquatic plant",
  "houseplant",
  "perennial",
  "annual",
  "biennial",
  "evergreen",
  "deciduous",
  "woody",
  "rosette"
];

const COLOR_TERMS = [
  "red",
  "pink",
  "white",
  "yellow",
  "blue",
  "purple",
  "orange",
  "green",
  "gold",
  "silver",
  "violet",
  "crimson",
  "scarlet",
  "cream"
];

const REGION_PATTERNS = [
  ["mediterranean", "mediterranean"],
  ["arid", "arid"],
  ["desert", "arid"],
  ["xerophytic", "arid"],
  ["coastal", "coastal"],
  ["woodland", "woodland"],
  ["forest", "woodland"],
  ["tropical", "tropical"],
  ["subtropical", "tropical"],
  ["alpine", "alpine"],
  ["mountain", "alpine"],
  ["prairie", "prairie"],
  ["grassland", "prairie"],
  ["indoor", "containers"],
  ["houseplant", "containers"],
  ["container", "containers"],
  ["temperate", "temperate"]
];

const LIGHT_PATTERNS = [
  ["full sun", "full sun"],
  ["partial shade", "partial shade"],
  ["part shade", "part shade"],
  ["shade", "shade"],
  ["bright indirect light", "bright indirect light"],
  ["indirect light", "indirect light"]
];

const MOISTURE_PATTERNS = [
  ["aquatic", "aquatic"],
  ["wetland", "wet soils"],
  ["wet", "wet soils"],
  ["marsh", "marshy habitat"],
  ["bog", "boggy habitat"],
  ["drought", "drought-tolerant"],
  ["xerophytic", "dry habitat"],
  ["arid", "dry habitat"],
  ["moist", "moist habitat"],
  ["humid", "humid habitat"]
];

const EXCLUDED_TITLES = new Set([
  "Plant",
  "Houseplant",
  "Herb",
  "Tree",
  "Shrub",
  "Flowering plant",
  "Perennial plant",
  "Annual plant",
  "Succulent plant",
  "Bulb",
  "Fern",
  "Aquatic plant",
  "Ornamental grass",
  "Fruit tree",
  "Vegetable",
  "Rose"
]);

const REJECT_TITLES_EXACT = new Set([
  "ANSI A300",
  "Areole",
  "Cloud tree",
  "Flax in New Zealand",
  "Forest",
  "Groundcover",
  "Jail tree",
  "Olericulture",
  "Prothallus",
  "Seal of Manchester, Connecticut",
  "Trail trees",
  "Tree health",
  "Vine"
]);

const BROAD_GBIF_RANKS = new Set(["KINGDOM", "PHYLUM", "CLASS"]);

const DISPLAY_NAME_OVERRIDES = new Map([
  ["Rosa 'Peace'", "Peace rose"]
]);

const REJECT_TEXT_PATTERNS = [
  "occupation",
  "profession",
  "material",
  "measurement",
  "symbol",
  "building material",
  "forest ecosystem",
  "management technique",
  "wood as a material",
  "emblem"
];

function slugify(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function compactObject(entries) {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => {
      if (value == null) {
        return false;
      }
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return true;
    })
  );
}

function readLegacyTitles(filePath) {
  try {
    const payload = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((entry) => String(entry?.name ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function chooseSentence(text = "") {
  const sentence = String(text)
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]/);
  return sentence ? sentence[0].trim() : String(text).trim();
}

function extractSentence(text = "", matcher) {
  const sentences = String(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    if (matcher(normalizeText(sentence))) {
      return sentence;
    }
  }

  return null;
}

function extractLeadingScientificName(text = "") {
  const source = String(text).trim();
  if (/^(The|A|An)\b/.test(source)) {
    return null;
  }
  const match = source.match(/^([A-Z][a-z-]+(?: [a-zx.-]+){0,2})[, ]/);
  return match?.[1] ?? null;
}

function hasTaxonomicDescription(text = "") {
  return /\b(species|genus|family|cultivar|variety|taxon)\b/i.test(String(text));
}

function extractFirstTerm(text = "", terms = []) {
  const normalized = normalizeText(text);
  for (const term of terms) {
    const needle = normalizeText(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|\\b)${needle}(?:\\b|$)`).test(normalized)) {
      return term;
    }
  }
  return null;
}

function extractPatternValue(text = "", patterns = []) {
  const normalized = normalizeText(text);
  for (const [needle, value] of patterns) {
    if (normalized.includes(needle)) {
      return value;
    }
  }
  return null;
}

function extractNativeRange(text = "") {
  const source = String(text).replace(/\s+/g, " ").trim();
  const patterns = [
    /native to ([^.]+)/i,
    /endemic to ([^.]+)/i,
    /distributed across ([^.]+)/i,
    /found in ([^.]+)/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim().replace(/[;,]$/, "");
    }
  }

  return null;
}

function extractFamily(text = "") {
  const match = String(text).match(/\bfamily(?: of)? ([A-Z][A-Za-z-]+)/);
  return match?.[1] ?? null;
}

function extractFragrance(text = "") {
  const normalized = normalizeText(text);
  if (normalized.includes("aromatic")) {
    return "aromatic";
  }
  if (normalized.includes("fragrant")) {
    return "fragrant";
  }
  if (normalized.includes("scented")) {
    return "scented";
  }
  return null;
}

function extractEdibleSummary(text = "") {
  const sentence = extractSentence(text, (normalized) =>
    /edible|culinary|food|eaten|used in cuisine|used as a herb/.test(normalized)
  );
  return sentence ? chooseSentence(sentence) : null;
}

function extractHabitat(text = "") {
  const sentence = extractSentence(text, (normalized) =>
    /aquatic|wetland|bog|marsh|woodland|forest|desert|arid|tropical|grassland|prairie|coastal/.test(normalized)
  );
  return sentence ? chooseSentence(sentence) : null;
}

function shouldAcceptGbif(match) {
  return Boolean(
    match &&
    match.kingdom === "Plantae" &&
    !BROAD_GBIF_RANKS.has(String(match.rank ?? "").toUpperCase()) &&
    (match.usageKey || match.key || match.canonicalName)
  );
}

function categorySpecByName(name = "") {
  return CATEGORY_SPECS.find((entry) => entry.name === name) ?? CATEGORY_SPECS[0];
}

function buildQuestionIdeas(plant) {
  const anchors = plant.anchors ?? {};
  const taxonomy = plant.taxonomy ?? {};
  const questions = [`What kind of plant is ${plant.name}?`];

  if (taxonomy.family) {
    questions.push(`What family is ${plant.name} in?`);
  }

  if (anchors.native_range) {
    questions.push(`Where is ${plant.name} native to?`);
  } else if (taxonomy.scientificName) {
    questions.push(`What is the scientific name for ${plant.name}?`);
  }

  if (anchors.edible) {
    questions.push(`Is ${plant.name} edible?`);
  }

  return uniqueValues(questions).slice(0, 4);
}

function buildSourceFacts(summary, gbif, anchors) {
  return [
    { label: "Source summary", value: chooseSentence(summary.extract ?? summary.description ?? "") || null },
    { label: "Scientific name", value: gbif?.scientificName ?? anchors.scientific_name ?? null },
    { label: "Taxon rank", value: gbif?.rank ?? anchors.taxon_rank ?? null },
    { label: "Family", value: gbif?.family ?? anchors.family ?? null },
    { label: "Genus", value: gbif?.genus ?? anchors.genus ?? null },
    { label: "Native range", value: anchors.native_range ?? null },
    { label: "Habitat", value: anchors.habitat ?? null },
    { label: "Edible or use note", value: anchors.edible ?? null }
  ].filter((entry) => entry.value);
}

function buildSources(summary, gbif, category) {
  const entries = [];
  const pageUrl = summary?.content_urls?.desktop?.page ?? null;
  if (pageUrl) {
    entries.push({
      title: summary.title,
      url: pageUrl,
      description: summary.description ?? "Wikipedia summary",
      excerpt: chooseSentence(summary.extract ?? ""),
      source: "wikipedia",
      category
    });
  }

  const usageKey = gbif?.usageKey ?? gbif?.key ?? null;
  if (usageKey) {
    entries.push({
      title: gbif?.canonicalName ?? summary.title,
      url: `https://www.gbif.org/species/${usageKey}`,
      description: gbif?.scientificName ?? "GBIF taxon record",
      excerpt: [gbif?.rank, gbif?.family, gbif?.genus].filter(Boolean).join(" - "),
      source: "gbif",
      category
    });
  }

  return entries;
}

function buildMediaEntry(summary, plant) {
  const imageUrl = summary?.thumbnail?.source ?? null;
  const pageUrl = summary?.content_urls?.desktop?.page ?? null;
  return {
    id: plant.id,
    strand: plant.constructStrand,
    title: plant.name,
    imageUrl,
    fullImageUrl: pageUrl,
    pageUrl,
    source: "wikipedia",
    imageStatus: imageUrl ? "resolved" : "missing"
  };
}

function buildPlantRecord(summary, spec, gbif) {
  const extractedScientificName = extractLeadingScientificName(summary.extract ?? "");
  const scientificName =
    gbif?.scientificName ??
    (extractedScientificName && (extractedScientificName.includes(" ") || hasTaxonomicDescription(summary.description ?? "")) ? extractedScientificName : null);
  const sourceText = [summary.description, summary.extract, gbif?.scientificName, gbif?.canonicalName].filter(Boolean).join(" ");
  const detectedPlantType = extractFirstTerm(sourceText, [
    "houseplant",
    "aquatic plant",
    "ornamental grass",
    "fruit tree",
    "tree",
    "shrub",
    "vine",
    "herb",
    "fern",
    "succulent",
    "cactus",
    "orchid",
    "bulb",
    "groundcover",
    "perennial",
    "annual"
  ]);
  const anchors = compactObject({
    plant_type: detectedPlantType ?? spec.plantType,
    scientific_name: scientificName,
    taxon_rank: gbif?.rank?.toLowerCase() ?? null,
    family: gbif?.family ?? extractFamily(summary.extract ?? summary.description ?? ""),
    genus: gbif?.genus ?? null,
    order: gbif?.order ?? null,
    class_name: gbif?.class ?? null,
    primary_color: extractFirstTerm(sourceText, COLOR_TERMS),
    fragrance: extractFragrance(sourceText),
    growth_habit: extractFirstTerm(sourceText, HABIT_TERMS) ?? spec.plantType,
    sunlight: extractPatternValue(sourceText, LIGHT_PATTERNS),
    moisture: extractPatternValue(sourceText, MOISTURE_PATTERNS),
    native_range: extractNativeRange(summary.extract ?? summary.description ?? ""),
    habitat: extractHabitat(summary.extract ?? summary.description ?? ""),
    edible: extractEdibleSummary(summary.extract ?? summary.description ?? ""),
    source_description: summary.description ?? null,
    source_summary: chooseSentence(summary.extract ?? summary.description ?? "")
  });

  const taxonomy = compactObject({
    scientificName: gbif?.scientificName ?? scientificName,
    canonicalName: gbif?.canonicalName ?? null,
    rank: gbif?.rank ?? null,
    family: gbif?.family ?? null,
    genus: gbif?.genus ?? null,
    order: gbif?.order ?? null,
    class: gbif?.class ?? null,
    kingdom: gbif?.kingdom ?? "Plantae",
    taxonomicStatus: gbif?.taxonomicStatus ?? gbif?.status ?? null,
    usageKey: gbif?.usageKey ?? gbif?.key ?? null
  });

  const name = DISPLAY_NAME_OVERRIDES.get(summary.title) ?? summary.title;
  const id = slugify(DISPLAY_NAME_OVERRIDES.has(summary.title) ? name : (scientificName ?? name));
  const aliases = uniqueValues([
    name,
    summary.title,
    scientificName,
    gbif?.canonicalName
  ]);
  const sources = buildSources(summary, gbif, spec.name);

  const plant = {
    id,
    name,
    aliases,
    constructStrand: id,
    regionHint: extractPatternValue(sourceText, REGION_PATTERNS),
    anchors,
    composites: [],
    description: summary.description ?? null,
    extract: summary.extract ?? null,
    taxonomy,
    sourceFacts: buildSourceFacts(summary, gbif, anchors),
    sourceMode: "internet-sourced",
    sources,
    questionIdeas: [],
    careNotes: compactObject({
      wikipedia: summary.description ?? null,
      gbif: gbif?.scientificName ?? null
    })
  };

  plant.questionIdeas = buildQuestionIdeas(plant);
  return plant;
}

function isLikelyPlantSummary(summary, spec) {
  if (!summary || summary.type !== "standard") {
    return false;
  }

  const title = String(summary.title ?? "");
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle || normalizedTitle.startsWith("list of") || EXCLUDED_TITLES.has(title) || REJECT_TITLES_EXACT.has(title)) {
    return false;
  }

  if (!summary?.content_urls?.desktop?.page) {
    return false;
  }

  const description = normalizeText(summary.description ?? "");
  const extract = normalizeText(summary.extract ?? "");
  const text = normalizeText([summary.title, summary.description, summary.extract, spec.name, spec.plantType].join(" "));

  if (REJECT_TEXT_PATTERNS.some((pattern) => description.includes(pattern) || extract.includes(pattern))) {
    return false;
  }

  const strongSignal = STRONG_PLANT_PATTERNS.some((pattern) => description.includes(pattern) || extract.includes(pattern));
  if (strongSignal) {
    return true;
  }

  const keywordHits = PLANT_KEYWORDS.filter((keyword) => text.includes(keyword)).length;
  return keywordHits >= 2;
}

function hasStrongPlantSignal(summary, spec) {
  const description = normalizeText(summary?.description ?? "");
  const extract = normalizeText(summary?.extract ?? "");
  return STRONG_PLANT_PATTERNS.some((pattern) => description.includes(pattern) || extract.includes(pattern));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "RootlineAtlas/1.0 (actual plant catalog rebuild)"
    }
  });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json();
}

async function fetchCategoryTitles(spec) {
  const titles = [];
  let cmcontinue = null;

  while (titles.length < 120) {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "categorymembers");
    url.searchParams.set("cmtitle", `Category:${spec.name}`);
    url.searchParams.set("cmnamespace", "0");
    url.searchParams.set("cmlimit", "50");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    if (cmcontinue) {
      url.searchParams.set("cmcontinue", cmcontinue);
    }

    const data = await fetchJson(url);
    const members = data?.query?.categorymembers ?? [];
    titles.push(...members.map((entry) => entry.title));
    cmcontinue = data?.continue?.cmcontinue ?? null;
    if (!cmcontinue || members.length === 0) {
      break;
    }
  }

  return uniqueValues(titles);
}

async function fetchSummary(title) {
  const url = new URL(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "RootlineAtlas/1.0 (actual plant catalog rebuild)"
    }
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

async function fetchGbifMatch(summary) {
  const candidates = uniqueValues([
    extractLeadingScientificName(summary?.extract ?? ""),
    summary?.title
  ]);

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const url = new URL("https://api.gbif.org/v1/species/match");
    url.searchParams.set("verbose", "true");
    url.searchParams.set("kingdom", "Plantae");
    url.searchParams.set("name", candidate);

    try {
      const payload = await fetchJson(url);
      if (shouldAcceptGbif(payload)) {
        return payload;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function buildSourceIndex(plants) {
  const index = {};

  for (const plant of plants) {
    const keys = uniqueValues([
      plant.id,
      plant.constructStrand,
      normalizeText(plant.name ?? "")
    ]);

    for (const key of keys) {
      index[key] = index[key] ?? [];
      index[key].push(...(plant.sources ?? []));
    }
  }

  return Object.fromEntries(
    Object.entries(index).map(([key, entries]) => [
      key,
      [...new Map(entries.map((entry) => [entry.url, entry])).values()]
    ])
  );
}

async function collectPlant(item) {
  const spec = categorySpecByName(item.category);
  const summary = await fetchSummary(item.title);
  if (!isLikelyPlantSummary(summary, spec)) {
    return null;
  }

  const gbif = await fetchGbifMatch(summary);
  if (!gbif && !hasStrongPlantSignal(summary, spec)) {
    return null;
  }
  const plant = buildPlantRecord(summary, spec, gbif);
  return {
    plant,
    media: buildMediaEntry(summary, plant)
  };
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  const categoryEntries = [];
  for (const spec of CATEGORY_SPECS) {
    try {
      const titles = await fetchCategoryTitles(spec);
      categoryEntries.push(...titles.map((title) => ({ title, category: spec.name })));
    } catch (error) {
      console.warn(`Skipping category ${spec.name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const legacyEntries = uniqueValues([
    ...readLegacyTitles(legacyPlantsPath),
    ...readLegacyTitles(legacyRegionPlantsPath)
  ]).map((title) => ({ title, category: "Flowering plants" }));

  const candidates = [...SEED_TITLES, ...legacyEntries, ...categoryEntries];
  const accepted = [];
  const media = [];
  const seenPlants = new Set();
  const seenTitles = new Set();
  const seenIds = new Set();
  let cursor = 0;

  const worker = async () => {
    while (accepted.length < TARGET_COUNT && cursor < candidates.length) {
      const item = candidates[cursor];
      cursor += 1;

      const titleKey = normalizeText(item.title);
      if (!titleKey || seenTitles.has(titleKey)) {
        continue;
      }
      seenTitles.add(titleKey);

      try {
        const result = await collectPlant(item);
        if (!result) {
          continue;
        }

        const plantKey = normalizeText(result.plant.name);
        if (seenPlants.has(plantKey)) {
          continue;
        }

        const baseId = result.plant.id;
        let nextId = baseId;
        let suffix = 2;
        while (seenIds.has(nextId)) {
          nextId = `${baseId}-${suffix}`;
          suffix += 1;
        }
        if (nextId !== result.plant.id) {
          result.plant.id = nextId;
          result.plant.constructStrand = nextId;
          result.media.id = nextId;
          result.media.strand = nextId;
        }

        seenPlants.add(plantKey);
        seenIds.add(result.plant.id);
        accepted.push(result.plant);
        media.push(result.media);
        console.log(`accepted ${accepted.length}/${TARGET_COUNT}: ${result.plant.name}`);
      } catch (error) {
        console.warn(`Skipping ${item.title}: ${error instanceof Error ? error.message : error}`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (accepted.length < MINIMUM_COUNT) {
    throw new Error(`Only collected ${accepted.length} sourced plant records`);
  }

  const sourceIndex = buildSourceIndex(accepted);

  await writeFile(plantsPath, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
  await writeFile(plantMediaPath, `${JSON.stringify(media, null, 2)}\n`, "utf8");
  await writeFile(plantSourcesPath, `${JSON.stringify(sourceIndex, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        plants: accepted.length,
        media: media.length,
        sourceKeys: Object.keys(sourceIndex).length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
