import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const taxonomyPath = join(__dirname, "..", "data", "strand-taxonomy.json");

const TAXONOMY = JSON.parse(readFileSync(taxonomyPath, "utf8"));

function indexTaxonomy(groups) {
  return Object.entries(groups).flatMap(([group, strands]) =>
    strands.map((strand) => ({
      ...strand,
      group,
      searchable: normalizeText([strand.label, ...(strand.aliases ?? []), strand.description].filter(Boolean).join(" "))
    }))
  );
}

const STRANDS = indexTaxonomy(TAXONOMY);

function matchesAny(text, entries) {
  return entries.some((entry) => text.includes(normalizeText(entry)));
}

function findFirst(group, candidates) {
  return STRANDS.find((strand) => strand.group === group && matchesAny(strand.searchable, candidates));
}

function formCandidates(plant) {
  const anchors = plant?.anchors ?? {};
  return [
    anchors.plant_type,
    anchors.growth_habit,
    plant?.name,
    plant?.constructStrand
  ].filter(Boolean);
}

function formStrand(plant) {
  const candidates = normalizeText(formCandidates(plant).join(" "));
  const entries = [
    ["tree_form", ["tree", "arboreal", "canopy"]],
    ["shrub_form", ["shrub", "bush"]],
    ["subshrub_form", ["subshrub", "semiwoody"]],
    ["vine_form", ["vine", "climber", "climbing"]],
    ["herb_form", ["herb", "herbaceous"]],
    ["grass_form", ["grass", "turf"]],
    ["fern_form", ["fern", "frond"]],
    ["bulb_form", ["bulb", "bulbous"]],
    ["succulent_form", ["succulent", "fleshy"]],
    ["cactus_form", ["cactus", "cacti"]],
    ["groundcover_form", ["groundcover", "mat", "carpet"]],
    ["aquatic_form", ["aquatic", "pond", "water plant"]],
    ["annual_form", ["annual"]],
    ["biennial_form", ["biennial"]],
    ["perennial_form", ["perennial"]],
    ["weed_form", ["weed", "volunteer", "invasive"]]
  ];

  for (const [id, needles] of entries) {
    if (matchesAny(candidates, needles)) {
      return STRANDS.find((strand) => strand.id === id) ?? null;
    }
  }

  return STRANDS.find((strand) => strand.id === "perennial_form") ?? null;
}

function lifecycleStrand(plant) {
  const anchors = plant?.anchors ?? {};
  const text = normalizeText(`${anchors.season ?? ""} ${anchors.growth_habit ?? ""} ${plant?.name ?? ""}`);
  if (text.includes("annual")) {
    return STRANDS.find((strand) => strand.id === "annual_form") ?? null;
  }
  if (text.includes("biennial")) {
    return STRANDS.find((strand) => strand.id === "biennial_form") ?? null;
  }
  if (text.includes("perennial")) {
    return STRANDS.find((strand) => strand.id === "perennial_form") ?? null;
  }
  if (text.includes("evergreen")) {
    return STRANDS.find((strand) => strand.id === "perennial_form") ?? null;
  }
  if (text.includes("deciduous")) {
    return STRANDS.find((strand) => strand.id === "perennial_form") ?? null;
  }
  return null;
}

function careStrands(plant, parsed = null) {
  const anchors = plant?.anchors ?? {};
  const parsedText = normalizeText(
    [
      parsed?.normalized,
      parsed?.trait,
      parsed?.attribute,
      parsed?.plantPhrase
    ]
      .filter(Boolean)
      .join(" ")
  );
  const plantText = normalizeText(Object.values(anchors).filter(Boolean).join(" "));
  const strands = [];

  const add = (id) => {
    const strand = STRANDS.find((entry) => entry.id === id);
    if (strand && !strands.some((item) => item.id === strand.id)) {
      strands.push(strand);
    }
  };

  if (parsedText.includes("sun") || plantText.includes("sun")) add("sunlight");
  if (parsedText.includes("shade") || plantText.includes("shade")) add("sunlight");
  if (parsedText.includes("soil") || plantText.includes("soil")) add("soil");
  if (parsedText.includes("moist") || parsedText.includes("dry") || plantText.includes("moist")) add("moisture");
  if (parsedText.includes("fertil") || parsedText.includes("feed") || plantText.includes("maintenance")) add("fertilizer");
  if (parsedText.includes("mulch") || plantText.includes("mulch")) add("mulch");
  if (parsedText.includes("companion") || plantText.includes("companions")) add("companion");
  if (parsedText.includes("space") || plantText.includes("height")) add("spacing");
  if (parsedText.includes("prune") || plantText.includes("trim") || plantText.includes("maintenance")) add("pruning");
  if (parsedText.includes("deadhead") || plantText.includes("bloom")) add("deadheading");
  if (parsedText.includes("stake") || plantText.includes("tall")) add("staking");
  if (parsedText.includes("divide") || plantText.includes("clump")) add("division");
  if (parsedText.includes("propagat") || plantText.includes("cutting")) add("propagation");
  if (parsedText.includes("pest") || plantText.includes("aphid")) add("pest_pressure");
  if (parsedText.includes("disease") || plantText.includes("fungus")) add("disease_pressure");
  if (parsedText.includes("ph")) add("pH_balance");
  if (parsedText.includes("water") || plantText.includes("drought")) add("water_balance");

  return strands;
}

function biologyStrands(plant) {
  const anchors = plant?.anchors ?? {};
  const strands = [];
  const add = (id) => {
    const strand = STRANDS.find((entry) => entry.id === id);
    if (strand && !strands.some((item) => item.id === strand.id)) {
      strands.push(strand);
    }
  };

  add("root_system");
  add("stem_structure");
  add("leaf_structure");
  if (anchors.bloom_type || anchors.flower || anchors.primary_color) {
    add("flowering");
    add("pollination");
  }
  if (anchors.edible) add("fruiting");
  if (anchors.season) add("dormancy");
  add("hardiness");
  return strands;
}

export function buildQuickRecallStrands(plant, parsed = null) {
  const strands = [];
  const push = (strand, valueOverride = null) => {
    if (!strand || strands.some((entry) => entry.id === strand.id)) {
      return;
    }

    strands.push({
      kind: "taxonomy",
      group: strand.group,
      id: strand.id,
      name: strand.label,
      value: valueOverride ?? strand.description,
      plant: plant?.name ?? null
    });
  };

  push(formStrand(plant));
  push(lifecycleStrand(plant));

  for (const strand of careStrands(plant, parsed)) {
    push(strand);
  }

  for (const strand of biologyStrands(plant)) {
    push(strand);
  }

  return strands.slice(0, 10);
}

export function getTaxonomyGroups() {
  return Object.entries(TAXONOMY).map(([group, strands]) => ({
    group,
    strands: strands.map((strand) => ({
      id: strand.id,
      label: strand.label,
      description: strand.description,
      aliases: strand.aliases ?? []
    }))
  }));
}
