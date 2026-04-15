import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const careTemplatesPath = join(__dirname, "..", "data", "care-templates.json");

const CARE_DATA = JSON.parse(readFileSync(careTemplatesPath, "utf8"));

const CARE_KEYS = new Map(
  Object.entries(CARE_DATA).flatMap(([key, template]) => [
    [key, key],
    ...((template.aliases ?? []).map((alias) => [normalizeText(alias), key]))
  ])
);

function resolveCareKey(plant) {
  const anchors = plant?.anchors ?? {};
  const rawValues = [
    anchors.plant_type,
    anchors.growth_habit,
    anchors.edible,
    anchors.sunlight,
    anchors.moisture,
    anchors.maintenance,
    plant?.name
  ];

  for (const value of rawValues) {
    const normalized = normalizeText(value ?? "");
    if (CARE_KEYS.has(normalized)) {
      return CARE_KEYS.get(normalized);
    }
  }

  const typeText = normalizeText(`${anchors.plant_type ?? ""} ${anchors.growth_habit ?? ""} ${plant?.name ?? ""}`);
  for (const [needle, key] of CARE_KEYS.entries()) {
    if (typeText.includes(needle)) {
      return key;
    }
  }

  return "perennial";
}

export function getCareTemplate(plant, regionProfile = null) {
  const key = resolveCareKey(plant);
  const template = CARE_DATA[key] ?? CARE_DATA.perennial;

  return {
    key,
    ...template,
    regionHint: regionProfile?.label ?? null,
    regionalFertilizer: regionProfile?.fertilizer ?? null,
    regionalMulch: regionProfile?.mulch ?? null
  };
}

export function getCareTemplateByKey(key = "perennial") {
  return CARE_DATA[key] ?? CARE_DATA.perennial;
}
