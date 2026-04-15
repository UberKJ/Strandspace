import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeText } from "./parser.js";
import { getPlantSources } from "./plant-sources.js";
import { getCareTemplate } from "./care-templates.js";
import { buildQuickRecallStrands } from "./strand-taxonomy.js";
import { buildPlantRegionFits } from "./atlas.js";
import { getPlantMedia } from "./plant-media.js";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const defaultLearningPath = join(__dirname, "..", "data", "strand-learning.json");

const AUIDENCE_ORDER = {
  child: { anchor: 0, composite: 1, taxonomy: 2 },
  gardener: { anchor: 0, composite: 1, taxonomy: 2 },
  scientist: { composite: 0, anchor: 1, taxonomy: 2 }
};

const AUDIENCE_ALIASES = new Map([
  ["kid", "child"],
  ["kids", "child"],
  ["child", "child"],
  ["children", "child"],
  ["student", "child"],
  ["student-friendly", "child"],
  ["gardener", "gardener"],
  ["garden", "gardener"],
  ["gardening", "gardener"],
  ["grower", "gardener"],
  ["scientist", "scientist"],
  ["science", "scientist"],
  ["scientific", "scientist"],
  ["botanist", "scientist"],
  ["researcher", "scientist"]
]);

export const AUDIENCE_PROFILES = {
  child: {
    label: "Child",
    subtitle: "simple and friendly",
    maxFactSheetEntries: 5,
    opening: "Think of it like this:",
    detailBias: 1
  },
  gardener: {
    label: "Gardener",
    subtitle: "practical and care-focused",
    maxFactSheetEntries: 16,
    opening: "Gardeners usually want to know:",
    detailBias: 2
  },
  scientist: {
    label: "Scientist",
    subtitle: "structured and evidence-oriented",
    maxFactSheetEntries: 999,
    opening: "Scientific summary:",
    detailBias: 3
  }
};

function strandKey(strand) {
  return `${strand.kind}:${strand.name}`;
}

function edgeKey(source, target, audience = "any") {
  return `${source}|${target}|${audience}`;
}

function defaultLearningState() {
  return {
    version: 2,
    updatedAt: null,
    strandUsage: {},
    edgeWeights: {},
    audienceBias: {
      child: { anchor: 0, composite: 0 },
      gardener: { anchor: 0, composite: 0 },
      scientist: { anchor: 0, composite: 0 }
    },
    feedback: []
  };
}

function mergeState(raw) {
  const base = defaultLearningState();
  if (!raw || typeof raw !== "object") {
    return base;
  }

  return {
    ...base,
    ...raw,
    strandUsage: { ...base.strandUsage, ...(raw.strandUsage ?? {}) },
    edgeWeights: { ...base.edgeWeights, ...(raw.edgeWeights ?? {}) },
    audienceBias: {
      child: { ...base.audienceBias.child, ...(raw.audienceBias?.child ?? {}) },
      gardener: { ...base.audienceBias.gardener, ...(raw.audienceBias?.gardener ?? {}) },
      scientist: { ...base.audienceBias.scientist, ...(raw.audienceBias?.scientist ?? {}) }
    },
    feedback: Array.isArray(raw.feedback) ? raw.feedback : []
  };
}

let cachedLearningState = null;

export function loadLearningState(filePath = defaultLearningPath) {
  if (cachedLearningState) {
    return cachedLearningState;
  }

  try {
    if (!existsSync(filePath)) {
      cachedLearningState = defaultLearningState();
      return cachedLearningState;
    }

    const contents = readFileSync(filePath, "utf8");
    cachedLearningState = mergeState(JSON.parse(contents));
    return cachedLearningState;
  } catch {
    cachedLearningState = defaultLearningState();
    return cachedLearningState;
  }
}

export function saveLearningState(state = loadLearningState(), filePath = defaultLearningPath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const payload = {
    ...state,
    updatedAt: new Date().toISOString()
  };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  cachedLearningState = payload;
  return payload;
}

export function normalizeAudience(value = "gardener") {
  const normalized = String(value).toLowerCase().trim();
  return AUDIENCE_ALIASES.get(normalized) ?? (normalized in AUDIENCE_PROFILES ? normalized : "gardener");
}

export function detectAudienceHint(text = "") {
  const normalized = String(text).toLowerCase();

  for (const [needle, audience] of AUDIENCE_ALIASES.entries()) {
    if (normalized.includes(needle)) {
      return audience;
    }
  }

  return null;
}

function hasMeaningfulCareAnchors(plant) {
  const anchors = plant?.anchors ?? {};
  return [
    anchors.soil_type,
    anchors.pH,
    anchors.moisture,
    anchors.sunlight,
    anchors.height,
    anchors.maintenance,
    anchors.companions,
    anchors.wildlife
  ].some(Boolean);
}

function chooseSentence(text = "") {
  const sentence = String(text)
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]/);
  return sentence ? sentence[0].trim() : String(text).trim();
}

export function buildAudienceFactSheet(plant, audience = "gardener") {
  const anchors = plant.anchors ?? {};
  const entries = [
    { label: "Plant type", value: anchors.plant_type },
    { label: "Scientific name", value: anchors.scientific_name ?? plant.taxonomy?.scientificName },
    { label: "Taxon rank", value: anchors.taxon_rank ?? plant.taxonomy?.rank },
    { label: "Family", value: anchors.family ?? plant.taxonomy?.family },
    { label: "Genus", value: anchors.genus ?? plant.taxonomy?.genus },
    { label: "Native range", value: anchors.native_range },
    { label: "Habitat", value: anchors.habitat },
    { label: "Source summary", value: anchors.source_summary ?? chooseSentence(plant.extract ?? plant.description ?? "") },
    { label: "Primary color", value: anchors.primary_color },
    { label: "Secondary color", value: anchors.secondary_color },
    { label: "Soil", value: anchors.soil_type },
    { label: "pH", value: anchors.pH },
    { label: "Moisture", value: anchors.moisture },
    { label: "Sunlight", value: anchors.sunlight },
    { label: "Height", value: anchors.height },
    { label: "Growth habit", value: anchors.growth_habit },
    { label: "Bloom", value: anchors.bloom_type },
    { label: "Fragrance", value: anchors.fragrance },
    { label: "Season", value: anchors.season },
    { label: "Wildlife", value: anchors.wildlife },
    { label: "Companions", value: anchors.companions },
    { label: "Maintenance", value: anchors.maintenance },
    { label: "Edible", value: anchors.edible }
  ]
    .filter((entry) => entry.value)
    .filter((entry, index, items) => items.findIndex((candidate) => candidate.label === entry.label) === index);

  const profile = AUDIENCE_PROFILES[normalizeAudience(audience)];
  return entries.slice(0, profile.maxFactSheetEntries);
}

function simplifyAnswerText(text, plant, parsed) {
  const anchors = plant.anchors ?? {};
  if (parsed.attribute === "sunlight") {
    return `${plant.name} likes ${anchors.sunlight}.`;
  }

  if (parsed.attribute === "height") {
    return `${plant.name} grows to about ${anchors.height}.`;
  }

  if (parsed.attribute === "fragrance") {
    return `${plant.name} has ${anchors.fragrance}.`;
  }

  if (parsed.attribute === "soil_type") {
    return `${plant.name} prefers ${anchors.soil_type}.`;
  }

  return String(text);
}

export function composeAudienceAnswer({ audience = "gardener", plant, parsed, baseAnswer, activatedStrands = [], relatedPlants = [] }) {
  const normalized = normalizeAudience(audience);
  const profile = AUDIENCE_PROFILES[normalized];
  const anchors = plant?.anchors ?? {};
  const visibleStrands = activatedStrands.filter((strand) => strand.kind !== "key_holder");
  const topStrands = visibleStrands.slice(0, normalized === "scientist" ? 4 : 2);

  if (normalized === "child") {
    const summary = plant
      ? plant.sourceMode === "internet-sourced"
        ? chooseSentence(anchors.source_summary ?? plant.extract ?? plant.description ?? `${plant.name} is a ${anchors.plant_type ?? "plant"}.`)
        : `${plant.name} is a ${anchors.plant_type ?? "plant"} that likes ${anchors.sunlight ?? "the right light"} and ${anchors.moisture ?? "the right moisture"}.`
      : simplifyAnswerText(baseAnswer, plant ?? { anchors: {} }, parsed);
    const extras = topStrands.length
      ? ` Important strands: ${topStrands.map((strand) => strand.name.replaceAll("_", " ")).join(", ")}.`
      : "";
    return `${profile.opening} ${summary}${extras}`.trim();
  }

  if (normalized === "scientist") {
    const strandSummary = topStrands.length
      ? topStrands
          .map((strand) => `${strand.kind}:${strand.name}${strand.value ? `=${strand.value}` : ""}`)
          .join("; ")
      : "no activated strands";
    const relatedSummary = relatedPlants.length
      ? ` Related plants: ${relatedPlants.map((item) => item.name).join(", ")}.`
      : "";
    const taxonomySummary = plant?.taxonomy
      ? ` Taxonomy: ${[plant.taxonomy.rank, plant.taxonomy.family, plant.taxonomy.genus].filter(Boolean).join("; ")}.`
      : "";
    return `${profile.opening} ${baseAnswer}${taxonomySummary} Evidence strands: ${strandSummary}.${relatedSummary}`.trim();
  }

  return baseAnswer;
}

function strandStrength(state, audience, strand) {
  const normalizedAudience = normalizeAudience(audience);
  if (strand.kind === "key_holder") {
    return 10_000;
  }

  const usage = state.strandUsage[`${normalizedAudience}:${strandKey(strand)}`] ?? 0;
  const bias = state.audienceBias[normalizedAudience] ?? { anchor: 0, composite: 0 };
  const kindBias = bias[strand.kind] ?? 0;
  let edgeScore = 0;

  for (const [key, value] of Object.entries(state.edgeWeights)) {
    const [source, target, edgeAudience] = key.split("|");
    if (edgeAudience !== "any" && edgeAudience !== normalizedAudience) {
      continue;
    }

    if (source === strandKey(strand) || target === strandKey(strand)) {
      edgeScore += value.weight ?? 0;
    }
  }

  return usage * 2 + edgeScore + kindBias;
}

export function rankStrandsWithLearning(strands, audience, state = loadLearningState()) {
  const normalizedAudience = normalizeAudience(audience);
  return [...strands].sort((a, b) => {
    if (a.kind === "key_holder" && b.kind !== "key_holder") {
      return -1;
    }

    if (b.kind === "key_holder" && a.kind !== "key_holder") {
      return 1;
    }

    const scoreA = strandStrength(state, normalizedAudience, a);
    const scoreB = strandStrength(state, normalizedAudience, b);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    const kindOrder = AUIDENCE_ORDER[normalizedAudience] ?? AUIDENCE_ORDER.gardener;
    const kindDelta = (kindOrder[a.kind] ?? 0) - (kindOrder[b.kind] ?? 0);
    if (kindDelta !== 0) {
      return kindDelta;
    }

    return a.name.localeCompare(b.name);
  });
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

export function observeTrace({ audience = "gardener", activatedStrands = [], question = "", mode = "compare" }, state = loadLearningState()) {
  const normalizedAudience = normalizeAudience(audience);
  const ordered = activatedStrands.map((strand) => strandKey(strand));

  ordered.forEach((key) => {
    increment(state.strandUsage, `${normalizedAudience}:${key}`, 1);
  });

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const source = ordered[index];
    const target = ordered[index + 1];
    const key = edgeKey(source, target, normalizedAudience);
    const current = state.edgeWeights[key] ?? { weight: 0, success: 0, failure: 0 };
    current.weight += 1;
    current.success += 1;
    state.edgeWeights[key] = current;
  }

  state.feedback.push({
    kind: "observation",
    question,
    audience: normalizedAudience,
    mode,
    strandCount: ordered.length,
    timestamp: new Date().toISOString()
  });

  state.updatedAt = new Date().toISOString();
  return state;
}

export function recordFeedback(payload = {}, state = loadLearningState()) {
  const normalizedAudience = normalizeAudience(payload.audience);
  const rating = String(payload.rating ?? "helpful");
  const activatedStrands = Array.isArray(payload.activatedStrands) ? payload.activatedStrands : [];
  observeTrace(
    {
      audience: normalizedAudience,
      activatedStrands,
      question: payload.question ?? "",
      mode: payload.mode ?? "compare"
    },
    state
  );

  const bias = state.audienceBias[normalizedAudience] ?? { anchor: 0, composite: 0 };
  if (rating === "too_simple") {
    bias.composite += 1;
  } else if (rating === "too_technical") {
    bias.anchor += 1;
  } else if (rating === "helpful") {
    bias.anchor += 0.5;
    bias.composite += 0.5;
  }
  state.audienceBias[normalizedAudience] = bias;
  state.feedback.push({
    kind: "feedback",
    rating,
    question: payload.question ?? "",
    mode: payload.mode ?? "compare",
    audience: normalizedAudience,
    timestamp: new Date().toISOString()
  });
  state.updatedAt = new Date().toISOString();
  saveLearningState(state);
  return state;
}

export function summarizeCatalogEntry(plant, options = {}) {
  const anchors = plant.anchors ?? {};
  const quickStrands = buildQuickRecallStrands(plant);
  const sources = getPlantSources(plant);
  const careTemplate = hasMeaningfulCareAnchors(plant) ? getCareTemplate(plant, options.regionProfile ?? null) : null;
  const regionFits = buildPlantRegionFits(plant);
  const media = getPlantMedia(plant);
  const summarySentence = chooseSentence(plant.extract ?? plant.description ?? "");
  const audienceNotes = plant.sourceMode === "internet-sourced"
    ? {
        child: `${plant.name} is a ${anchors.plant_type ?? "plant"}. ${summarySentence || "This record uses sourced plant facts."}`.trim(),
        gardener: `${plant.name} is a sourced ${anchors.plant_type ?? "plant"} record${anchors.native_range ? ` native to ${anchors.native_range}` : ""}.`.trim(),
        scientist: `${plant.name} is summarized from linked source records${anchors.family ? ` in ${anchors.family}` : ""}${plant.taxonomy?.rank ? ` at ${plant.taxonomy.rank.toLowerCase()} rank` : ""}.`.trim()
      }
    : {
        child: `${plant.name} likes ${anchors.sunlight ?? "balanced light"} and ${anchors.moisture ?? "the right moisture"}.`,
        gardener: `${plant.name} is a ${anchors.plant_type ?? "plant"} for ${anchors.sunlight ?? "mixed light"} with ${anchors.soil_type ?? "usable soil"}.`,
        scientist: `${plant.name} can be read through its anchor strands for color, growth habit, bloom type, and climate preference.`
      };

  const questionIdeas = [];
  if (anchors.sunlight?.includes("shade")) {
    questionIdeas.push(`Does ${plant.name} like shade?`);
  } else if (anchors.sunlight?.includes("sun")) {
    questionIdeas.push(`Does ${plant.name} like full sun?`);
  }
  if (anchors.primary_color) {
    questionIdeas.push(`What color is ${plant.name}?`);
  }
  if (anchors.soil_type) {
    questionIdeas.push(`What soil does ${plant.name} like?`);
  }
  if (anchors.fragrance) {
    questionIdeas.push(`What does ${plant.name} smell like?`);
  }
  if (anchors.height) {
    questionIdeas.push(`How tall does ${plant.name} get?`);
  }
  if (anchors.family) {
    questionIdeas.push(`What family is ${plant.name} in?`);
  }
  if (anchors.native_range) {
    questionIdeas.push(`Where is ${plant.name} native to?`);
  }

  return {
    id: plant.id,
    name: plant.name,
    constructStrand: plant.constructStrand,
    experiment_cluster: plant.experiment_cluster ?? plant.anchors?.experiment_cluster ?? null,
    anchors: {
      plant_type: anchors.plant_type,
      scientific_name: anchors.scientific_name,
      taxon_rank: anchors.taxon_rank,
      family: anchors.family,
      genus: anchors.genus,
      native_range: anchors.native_range,
      habitat: anchors.habitat,
      source_summary: anchors.source_summary,
      primary_color: anchors.primary_color,
      sunlight: anchors.sunlight,
      soil_type: anchors.soil_type,
      fragrance: anchors.fragrance,
      maintenance: anchors.maintenance,
      height: anchors.height,
      edible: anchors.edible,
      light_bias: anchors.light_bias,
      color_cluster: anchors.color_cluster,
      experiment_cluster: anchors.experiment_cluster,
      palette_group: anchors.palette_group
    },
    questionIdeas,
    audienceNotes,
    composites: plant.composites ?? [],
    quickStrands,
    regionFits,
    sources,
    careTemplate,
    taxonomy: plant.taxonomy ?? null,
    sourceFacts: Array.isArray(plant.sourceFacts) ? plant.sourceFacts : [],
    description: plant.description ?? null,
    extract: plant.extract ?? null,
    sourceMode: plant.sourceMode ?? null,
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
    imagePath: options.includeImage
      ? media?.imageUrl ?? (normalizeText(anchors.plant_type ?? "") === "flower" ? `/pictures/${plant.constructStrand}.jpg` : null)
      : null,
    imageLink: media?.pageUrl ?? media?.searchUrl ?? (normalizeText(anchors.plant_type ?? "") === "flower" ? `/pictures/${plant.constructStrand}.jpg` : null)
  };
}
