import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const regionsPath = join(__dirname, "..", "data", "regions.json");
const regionFactsPath = join(__dirname, "..", "data", "region-facts.json");

const REGION_DATA = JSON.parse(readFileSync(regionsPath, "utf8"));
const REGION_FACTS = JSON.parse(readFileSync(regionFactsPath, "utf8"));

const REGION_ALIASES = new Map(
  Object.entries(REGION_DATA).flatMap(([region, profile]) => [
    [region, region],
    ...((profile.aliases ?? []).map((alias) => [normalizeText(alias), region]))
  ])
);

function normalizeRegion(value = "temperate") {
  const normalized = normalizeText(value);
  return REGION_ALIASES.get(normalized) ?? (REGION_DATA[normalized] ? normalized : "temperate");
}

function parseElevationRange(value = "") {
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "any") {
    return {
      elevationStartFt: null,
      elevationEndFt: null
    };
  }

  const match = text.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)\s*ft/i);
  if (!match) {
    return {
      elevationStartFt: null,
      elevationEndFt: null
    };
  }

  return {
    elevationStartFt: Number(match[1].replaceAll(",", "")),
    elevationEndFt: Number(match[2].replaceAll(",", ""))
  };
}

function plantText(plant) {
  const anchors = plant.anchors ?? {};
  return normalizeText(
    [
      plant.name,
      plant.constructStrand,
      plant.id,
      plant.experiment_cluster,
      plant.regionHint,
      ...(plant.aliases ?? []),
      ...Object.values(anchors),
      ...(plant.composites ?? [])
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function scorePlantForRegion(plant, region) {
  const normalizedRegion = normalizeRegion(region);
  const profile = REGION_DATA[normalizedRegion] ?? REGION_DATA.temperate;
  const text = plantText(plant);
  const anchors = plant.anchors ?? {};
  let score = 0;
  const reasons = [];

  for (const keyword of profile.keywords ?? []) {
    if (text.includes(normalizeText(keyword))) {
      score += 2;
    }
  }

  if (normalizeText(plant.regionHint ?? "").includes(normalizedRegion)) {
    score += 8;
    reasons.push("region tagged");
  }

  if (profile.label === "Woodland" && String(anchors.sunlight ?? "").includes("shade")) {
    score += 6;
    reasons.push("shade-friendly");
  }

  if (profile.label !== "Woodland" && String(anchors.sunlight ?? "").includes("sun")) {
    score += 2;
    reasons.push("sun-loving");
  }

  if (String(anchors.moisture ?? "").includes("low") && ["Arid", "Mediterranean", "Alpine"].includes(profile.label)) {
    score += 4;
    reasons.push("handles lean moisture");
  }

  if ((String(anchors.moisture ?? "").includes("moderate") || String(anchors.moisture ?? "").includes("moist")) && ["Temperate", "Coastal", "Prairie", "Tropical", "Woodland"].includes(profile.label)) {
    score += 4;
    reasons.push("matches regional moisture");
  }

  if ((String(anchors.soil_type ?? "").includes("drained") || String(anchors.soil_type ?? "").includes("sandy") || String(anchors.soil_type ?? "").includes("gravel")) && ["Arid", "Mediterranean", "Coastal", "Alpine"].includes(profile.label)) {
    score += 4;
    reasons.push("likes drainage");
  }

  if (String(anchors.soil_type ?? "").includes("rich") && ["Temperate", "Woodland", "Tropical", "Prairie"].includes(profile.label)) {
    score += 4;
    reasons.push("likes richer soil");
  }

  if (String(anchors.plant_type ?? "").includes("herb") && ["Mediterranean", "Containers"].includes(profile.label)) {
    score += 3;
  }

  if (String(anchors.wildlife ?? "").includes("pollinator")) {
    score += 1;
  }

  if (String(anchors.maintenance ?? "").length > 0) {
    score += 1;
  }

  return {
    region: normalizedRegion,
    profile,
    score,
    reasons
  };
}

function buildRegionAdvice(plant, region) {
  const fit = scorePlantForRegion(plant, region);
  const anchors = plant.anchors ?? {};
  const facts = REGION_FACTS[fit.region] ?? {};
  const elevation = parseElevationRange(facts.elevationRange ?? "");
  return {
    region: fit.region,
    regionLabel: fit.profile.label,
    fitScore: fit.score,
    fitReasons: fit.reasons,
    elevationRange: facts.elevationRange ?? null,
    elevationStartFt: elevation.elevationStartFt,
    elevationEndFt: elevation.elevationEndFt,
    bestNaturalRegions: facts.bestNaturalRegions ?? [],
    regionSummary: `${plant.name} tends to fit ${fit.profile.label.toLowerCase()} conditions with ${fit.profile.light}, ${fit.profile.moisture}, and ${fit.profile.soil}.`,
    fertilizer: anchors.maintenance
      ? `${fit.profile.fertilizer}; for this plant, ${anchors.maintenance}.`
      : fit.profile.fertilizer,
    biology: {
      plantType: anchors.plant_type ?? null,
      growthHabit: anchors.growth_habit ?? null,
      bloomType: anchors.bloom_type ?? null,
      height: anchors.height ?? null,
      fragrance: anchors.fragrance ?? null,
      wildlife: anchors.wildlife ?? null
    },
    care: {
      sunlight: anchors.sunlight ?? fit.profile.light,
      soil: anchors.soil_type ?? fit.profile.soil,
      moisture: anchors.moisture ?? fit.profile.moisture,
      pH: anchors.pH ?? null,
      fertilizer: fit.profile.fertilizer,
      mulch: fit.profile.mulch,
      warnings: fit.profile.warnings
    }
  };
}

function buildPlantRegionFits(plant) {
  return Object.keys(REGION_DATA).map((region) => {
    const fit = scorePlantForRegion(plant, region);
    const facts = REGION_FACTS[fit.region] ?? {};
    const elevation = parseElevationRange(facts.elevationRange ?? "");
    return {
      region: fit.region,
      label: fit.profile.label,
      description: fit.profile.description,
      fitScore: fit.score,
      canGrow: fit.score >= 8 || Boolean(plant.regionHint && normalizeRegion(plant.regionHint) === fit.region),
      reasons: fit.reasons,
      elevationRange: facts.elevationRange ?? null,
      elevationStartFt: elevation.elevationStartFt,
      elevationEndFt: elevation.elevationEndFt,
      bestNaturalRegions: facts.bestNaturalRegions ?? []
    };
  }).sort((a, b) => b.fitScore - a.fitScore || a.label.localeCompare(b.label));
}

function filterPlantsByRegion(plants, region) {
  const normalizedRegion = normalizeRegion(region);
  return plants
    .map((plant) => {
      const fit = scorePlantForRegion(plant, normalizedRegion);
      return {
        plant,
        fit
      };
    })
    .sort((a, b) => b.fit.score - a.fit.score || a.plant.name.localeCompare(b.plant.name));
}

function getRegionProfile(region) {
  const normalized = normalizeRegion(region);
  const facts = REGION_FACTS[normalized] ?? {};
  const elevation = parseElevationRange(facts.elevationRange ?? "");
  return {
    region: normalized,
    ...(REGION_DATA[normalized] ?? REGION_DATA.temperate),
    ...facts,
    ...elevation
  };
}

function getRegionOptions() {
  return Object.entries(REGION_DATA).map(([value, profile]) => ({
    value,
    label: profile.label,
    description: profile.description,
    elevationRange: REGION_FACTS[value]?.elevationRange ?? null,
    ...parseElevationRange(REGION_FACTS[value]?.elevationRange ?? ""),
    bestNaturalRegions: REGION_FACTS[value]?.bestNaturalRegions ?? []
  }));
}

export {
  getRegionOptions,
  getRegionProfile,
  buildRegionAdvice,
  buildPlantRegionFits,
  filterPlantsByRegion,
  normalizeRegion,
  scorePlantForRegion
};
