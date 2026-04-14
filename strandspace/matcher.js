import { normalizeText } from "./parser.js";
import { buildQuickRecallStrands } from "./strand-taxonomy.js";

const COMPOSITE_BUILDERS = {
  rose_soil_profile: (plant) =>
    `${plant.name} likes rich, well-drained loam with steady moisture and slightly acidic pH.`,
  pink_yellow_flower_profile: (plant) =>
    `${plant.name} carries a pink-and-yellow bloom pattern that the Strandspace model reuses as a composite flower profile.`,
  rose_signature_profile: (plant) =>
    `${plant.name} combines repeat bloom, rose fragrance, and ornamental shrub form into a reusable rose signature strand.`,
  pollinator_path: (plant) =>
    `${plant.name} supports pollinators through nectar-rich blooms and a long flowering season.`,
  dry_soil_profile: (plant) =>
    `${plant.name} prefers drier, fast-draining soil and lower watering pressure.`,
  aromatic_evergreen_profile: (plant) =>
    `${plant.name} stays aromatic through the season and keeps structure as an evergreen or semi-evergreen plant.`,
  culinary_herb_profile: (plant) =>
    `${plant.name} is a culinary herb used for fresh kitchen harvests and companion planting.`,
  shade_plant_profile: (plant) =>
    `${plant.name} is a shade-tolerant plant that keeps strong foliage under partial shade or deeper shade.`,
  foliage_texture_profile: (plant) =>
    `${plant.name} contributes a foliage texture profile built around broad leaves and dense clumps.`,
  warm_kitchen_herb_profile: (plant) =>
    `${plant.name} is a warm-season kitchen herb that wants sun, moisture balance, and frequent harvesting.`,
  sun_loving_tall_profile: (plant) =>
    `${plant.name} is a tall sun lover that uses a full-sun growth strand to drive height and bloom energy.`,
  pollinator_perennial_profile: (plant) =>
    `${plant.name} is a perennial pollinator plant that pairs summer bloom with repeat garden support.`,
  native_meadow_profile: (plant) =>
    `${plant.name} fits a meadow-style planting with strong summer bloom and wildlife support.`,
  tree_canopy_profile: (plant) =>
    `${plant.name} contributes a woody canopy profile with branching structure, seasonal foliage, and long-lived form.`,
  shrub_frame_profile: (plant) =>
    `${plant.name} builds a shrub frame profile with repeated stems, structure, and garden boundary presence.`,
  vegetable_crop_profile: (plant) =>
    `${plant.name} contributes an edible crop profile centered on harvest, soil fertility, and seasonal production.`,
  succulent_storage_profile: (plant) =>
    `${plant.name} uses water-storage tissue and a dry-adapted strand to survive in lean conditions.`,
  aquatic_edge_profile: (plant) =>
    `${plant.name} forms an aquatic edge profile tied to wet soil, saturated roots, and pond-side growth.`,
  grass_sward_profile: (plant) =>
    `${plant.name} contributes a grass sward profile with narrow leaves, flowing texture, and clump movement.`,
  houseplant_buffer_profile: (plant) =>
    `${plant.name} behaves as an indoor buffer plant, growing in filtered light and container media.`,
  woodland_edge_profile: (plant) =>
    `${plant.name} fits a woodland edge profile with shade tolerance, layered foliage, and humus-rich soil.`,
  trellis_vine_profile: (plant) =>
    `${plant.name} climbs through a trellis vine profile with vertical reach and support-seeking growth.`
};

const PLANT_FORM_TOKENS = [
  "tree",
  "shrub",
  "subshrub",
  "vine",
  "herb",
  "grass",
  "fern",
  "bulb",
  "succulent",
  "cactus",
  "groundcover",
  "aquatic",
  "annual",
  "biennial",
  "perennial",
  "weed"
];

const COLOR_TOKENS = new Set([
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

const MOISTURE_TOKENS = new Set([
  "moist",
  "wet",
  "dry",
  "humid",
  "damp",
  "arid",
  "low",
  "moderate",
  "high",
  "even"
]);

const plantIndexCache = new WeakMap();

function getPlantIndex(plant) {
  if (!plant || typeof plant !== "object") {
    return {
      name: "",
      aliases: [],
      nameTokens: new Set(),
      haystackTokens: new Set(),
      haystackText: "",
      sunlightText: ""
    };
  }

  const cached = plantIndexCache.get(plant);
  if (cached) {
    return cached;
  }

  const name = normalizeText(plant.name);
  const aliases = (plant.aliases ?? []).map((value) => normalizeText(value)).filter(Boolean);
  const haystackText = normalizeText(
    [plant.name, ...(plant.aliases ?? []), ...Object.values(plant.anchors ?? {}), ...(plant.composites ?? [])]
      .filter(Boolean)
      .join(" ")
  );
  const index = {
    name,
    aliases,
    nameTokens: new Set(name.split(" ").filter(Boolean)),
    haystackTokens: new Set(haystackText.split(" ").filter(Boolean)),
    haystackText,
    sunlightText: normalizeText(plant.anchors?.sunlight ?? "")
  };

  plantIndexCache.set(plant, index);
  return index;
}

function relationPhrase(canRelate, reason) {
  if (reason) {
    return reason;
  }

  return canRelate
    ? "identity and question shape fit together"
    : "round peg in a square hole: the identity does not fit the question shape";
}

export function buildKeyHolderStrand(plant, parsed, options = {}) {
  const identifier = options.identifier ?? plant?.constructStrand ?? plant?.name ?? parsed?.plantPhrase ?? parsed?.normalized ?? "unknown";
  const matchedLabel = plant?.name ?? options.label ?? identifier;
  const canRelate =
    typeof options.canRelate === "boolean"
      ? options.canRelate
      : Boolean(plant) || Boolean(options.relatedPlants?.length) || Boolean(options.externalTitle);
  const reason = relationPhrase(canRelate, options.reason);

  return {
    kind: "key_holder",
    name: "key_holder",
    value: `${matchedLabel} | can relate: ${canRelate ? "yes" : "no"}`,
    identifier,
    canRelate,
    relationReason: reason,
    source: options.source ?? "local",
    plant: matchedLabel
  };
}

function tokenizeText(value = "") {
  return normalizeText(value).split(" ").filter(Boolean);
}

function tokenSet(value = "") {
  return new Set(tokenizeText(value));
}

function hasWholeToken(haystackSet, token) {
  return haystackSet.has(token);
}

function scoreNameMatch(question, questionTokens, plant) {
  let score = 0;
  const index = getPlantIndex(plant);

  if (index.name && question.includes(index.name)) {
    score += 120;
  }

  for (const alias of index.aliases) {
    if (alias && question.includes(alias)) {
      score += 120;
    }
  }

  for (const token of index.nameTokens) {
    if (token && hasWholeToken(questionTokens, token)) {
      score += 20;
    }
  }

  return score;
}

function scoreTraitMatch(question, questionTokens, plant) {
  const index = getPlantIndex(plant);
  const haystackTokens = index.haystackTokens;
  let score = 0;

  for (const token of questionTokens) {
    if (token.length < 3) continue;
    if (hasWholeToken(haystackTokens, token)) {
      score += 8;
    }
  }

  if (hasWholeToken(haystackTokens, "shade") && hasWholeToken(questionTokens, "shade")) {
    score += 35;
  }
  if (hasWholeToken(haystackTokens, "sun") && hasWholeToken(questionTokens, "sun")) {
    score += 25;
  }
  if (hasWholeToken(haystackTokens, "soil") && hasWholeToken(questionTokens, "soil")) {
    score += 20;
  }
  if (hasWholeToken(haystackTokens, "fragrance") && (hasWholeToken(questionTokens, "smell") || hasWholeToken(questionTokens, "fragrance") || hasWholeToken(questionTokens, "scent"))) {
    score += 24;
  }
  if (hasWholeToken(haystackTokens, "pollinator") && (hasWholeToken(questionTokens, "pollinator") || hasWholeToken(questionTokens, "bee") || hasWholeToken(questionTokens, "butterfly") || hasWholeToken(questionTokens, "bird"))) {
    score += 24;
  }
  if (hasWholeToken(haystackTokens, "edible") && (hasWholeToken(questionTokens, "edible") || hasWholeToken(questionTokens, "eat") || hasWholeToken(questionTokens, "culinary"))) {
    score += 20;
  }
  if (hasWholeToken(haystackTokens, "companion") && (question.includes("grow with") || question.includes("plant with") || hasWholeToken(questionTokens, "companions") || hasWholeToken(questionTokens, "companion"))) {
    score += 22;
  }
  if (hasWholeToken(haystackTokens, "maintenance") && (hasWholeToken(questionTokens, "maintenance") || hasWholeToken(questionTokens, "care") || hasWholeToken(questionTokens, "prune") || hasWholeToken(questionTokens, "trim"))) {
    score += 18;
  }
  if (hasWholeToken(haystackTokens, "height") || hasWholeToken(questionTokens, "tall")) {
    score += 15;
  }

  for (const token of PLANT_FORM_TOKENS) {
    if (hasWholeToken(questionTokens, token) && hasWholeToken(haystackTokens, token)) {
      score += 28;
    }
  }

  return score;
}

export function rankPlants(plants, parsed) {
  const question = parsed.normalized;
  const questionTokens = tokenSet(question);

  return plants
    .map((plant) => {
      const nameScore = scoreNameMatch(question, questionTokens, plant);
      const traitScore = scoreTraitMatch(question, questionTokens, plant);
      const answerFit =
        parsed.intent === "list"
          ? traitScore + (question.includes(getPlantIndex(plant).sunlightText) ? 30 : 0)
          : traitScore;

      return {
        ...plant,
        score: nameScore + answerFit,
        matchedBy: {
          nameScore,
          traitScore
        }
      };
    })
    .filter((plant) => plant.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function activateAnchorStrands(plant) {
  return Object.entries(plant.anchors ?? {}).map(([name, value]) => ({
    kind: "anchor",
    name,
    value,
    plant: plant.name
  }));
}

export function activateCompositeStrands(plant) {
  return (plant.composites ?? []).map((name) => ({
    kind: "composite",
    name,
    value: COMPOSITE_BUILDERS[name]?.(plant) ?? `${plant.name} uses the ${name} composite strand.`,
    plant: plant.name
  }));
}

export function buildStrandTrace(plant, parsed, options = {}) {
  const anchors = activateAnchorStrands(plant);
  const composites = activateCompositeStrands(plant);
  const taxonomy = buildQuickRecallStrands(plant, parsed);
  const keyHolder = buildKeyHolderStrand(plant, parsed, {
    source: options.source ?? "local",
    relatedPlants: options.relatedPlants,
    identifier: options.identifier,
    label: options.label,
    externalTitle: options.externalTitle,
    canRelate: options.canRelate,
    reason: options.reason
  });
  const activated = [];

  if (parsed.attribute === "primary_color") {
    activated.push(...anchors.filter((strand) => ["primary_color", "secondary_color"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name === "pink_yellow_flower_profile"));
  } else if (parsed.attribute === "soil_type") {
    activated.push(...anchors.filter((strand) => ["soil_type", "pH", "moisture"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name.includes("soil")));
  } else if (parsed.attribute === "sunlight") {
    activated.push(...anchors.filter((strand) => ["sunlight", "moisture", "growth_habit"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name.includes("shade") || strand.name.includes("sun")));
  } else if (parsed.attribute === "height") {
    activated.push(...anchors.filter((strand) => strand.name === "height"));
    activated.push(...composites.filter((strand) => strand.name.includes("tall")));
  } else if (parsed.attribute === "fragrance") {
    activated.push(...anchors.filter((strand) => ["fragrance", "bloom_type", "season"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name.includes("aromatic") || strand.name.includes("signature")));
  } else if (parsed.attribute === "season") {
    activated.push(...anchors.filter((strand) => ["season", "bloom_type", "sunlight"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name.includes("pollinator") || strand.name.includes("season")));
  } else if (parsed.attribute === "wildlife") {
    activated.push(...anchors.filter((strand) => ["wildlife", "bloom_type", "season"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name.includes("pollinator") || strand.name.includes("native")));
  } else if (parsed.attribute === "companions") {
    activated.push(...anchors.filter((strand) => ["companions", "growth_habit", "moisture"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name.includes("herb") || strand.name.includes("rose") || strand.name.includes("pollinator")));
  } else if (parsed.attribute === "maintenance") {
    activated.push(...anchors.filter((strand) => ["maintenance", "growth_habit", "season"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name.includes("profile")));
  } else if (parsed.attribute === "edible") {
    activated.push(...anchors.filter((strand) => ["plant_type", "companions", "maintenance", "edible"].includes(strand.name)));
    activated.push(...composites.filter((strand) => strand.name.includes("culinary")));
  } else if (parsed.intent === "list") {
    if (parsed.attribute === "fragrance") {
      activated.push(...anchors.filter((strand) => ["fragrance", "bloom_type", "season"].includes(strand.name)));
      activated.push(...composites.filter((strand) => strand.name.includes("aromatic") || strand.name.includes("signature")));
    } else if (parsed.attribute === "wildlife") {
      activated.push(...anchors.filter((strand) => ["wildlife", "season", "bloom_type"].includes(strand.name)));
      activated.push(...composites.filter((strand) => strand.name.includes("pollinator") || strand.name.includes("native")));
    } else if (parsed.attribute === "companions") {
      activated.push(...anchors.filter((strand) => ["companions", "growth_habit", "maintenance"].includes(strand.name)));
      activated.push(...composites.filter((strand) => strand.name.includes("herb") || strand.name.includes("rose") || strand.name.includes("pollinator")));
    } else if (parsed.attribute === "edible") {
      activated.push(...anchors.filter((strand) => ["edible", "companions", "maintenance"].includes(strand.name)));
      activated.push(...composites.filter((strand) => strand.name.includes("culinary")));
    } else {
      activated.push(...anchors.filter((strand) => strand.name === "sunlight"));
      activated.push(...composites.filter((strand) => strand.name.includes("shade") || strand.name.includes("sun")));
    }
  } else {
    activated.push(...anchors.filter((strand) => ["plant_type", "primary_color", "secondary_color", "sunlight", "fragrance", "season"].includes(strand.name)));
    activated.push(...composites);
  }

  activated.push(...taxonomy);

  return {
    keyHolder,
    anchors,
    composites,
    activated: [keyHolder, ...activated]
  };
}

export function findBestPlant(plants, parsed) {
  const ranked = rankPlants(plants, parsed);
  return ranked[0] ?? null;
}

export function findPlantsForTrait(plants, parsed) {
  const trait = normalizeText(parsed.trait || parsed.plantPhrase || parsed.normalized);
  const traitTokens = new Set(trait.split(/\s+/).filter(Boolean));

  return plants.filter((plant) => {
    const haystack = getPlantIndex(plant).haystackText;
    if (trait && haystack.includes(trait)) {
      return true;
    }

    if (trait.includes("shade") && normalizeText(plant.anchors.sunlight ?? "").includes("shade")) {
      return true;
    }

    if (trait.includes("sun") && normalizeText(plant.anchors.sunlight ?? "").includes("sun")) {
      return true;
    }

    if (trait.includes("soil") && normalizeText(plant.anchors.soil_type ?? "").includes("soil")) {
      return true;
    }

    const colorText = normalizeText([plant.anchors.primary_color, plant.anchors.secondary_color].filter(Boolean).join(" "));
    const moistureText = normalizeText(plant.anchors.moisture ?? "");
    for (const token of traitTokens) {
      if (COLOR_TOKENS.has(token) && colorText.includes(token)) {
        return true;
      }

      if (MOISTURE_TOKENS.has(token) && moistureText.includes(token)) {
        return true;
      }
    }

    if (trait.includes("tall") && normalizeText(plant.anchors.height ?? "").includes("ft")) {
      return true;
    }

    const plantType = normalizeText(plant.anchors.plant_type ?? "");
    for (const token of PLANT_FORM_TOKENS) {
      if (trait.includes(token) && plantType.includes(token)) {
        return true;
      }
    }

    return false;
  });
}
