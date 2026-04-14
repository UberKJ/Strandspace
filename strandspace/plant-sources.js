import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sourcesPath = join(__dirname, "..", "data", "plant-sources.json");

const SOURCE_DATA = JSON.parse(readFileSync(sourcesPath, "utf8"));

function sourceKeys(plant) {
  return [
    plant.id,
    plant.constructStrand,
    normalizeText(plant.name ?? ""),
    normalizeText(plant.id ?? "")
  ].filter(Boolean);
}

export function getPlantSources(plant) {
  if (!plant) {
    return [];
  }

  const keys = sourceKeys(plant);
  const entries = [];

  for (const key of keys) {
    const matches = SOURCE_DATA[key] ?? SOURCE_DATA[normalizeText(key)] ?? null;
    if (Array.isArray(matches)) {
      entries.push(...matches);
    }
  }

  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}

export function hasPlantSources(plant) {
  return getPlantSources(plant).length > 0;
}
