import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sourcesPath = join(__dirname, "..", "data", "plant-sources.json");

const SOURCE_DATA = JSON.parse(readFileSync(sourcesPath, "utf8"));

function normalizeKey(value = "") {
  return normalizeText(String(value ?? ""));
}

function buildSourceIndex(payload) {
  if (Array.isArray(payload)) {
    const index = {};
    for (const entry of payload) {
      const keys = [
        entry.id,
        entry.constructStrand,
        entry.name,
        normalizeText(entry.name ?? "")
      ].filter(Boolean);

      for (const key of keys) {
        const normalizedKey = normalizeKey(key);
        index[normalizedKey] = index[normalizedKey] ?? [];
        index[normalizedKey].push(entry);
      }
    }

    return Object.fromEntries(
      Object.entries(index).map(([key, entries]) => [
        key,
        [...new Map(entries.map((entry) => [entry.url, entry])).values()]
      ])
    );
  }

  return Object.fromEntries(
    Object.entries(payload ?? {}).map(([key, entries]) => [
      normalizeKey(key),
      Array.isArray(entries)
        ? [...new Map(entries.map((entry) => [entry.url, entry])).values()]
        : []
    ])
  );
}

const SOURCE_INDEX = buildSourceIndex(SOURCE_DATA);

function sourceKeys(plant) {
  return [
    plant.id,
    plant.constructStrand,
    normalizeKey(plant.name ?? ""),
    normalizeKey(plant.id ?? "")
  ].filter(Boolean);
}

export function getPlantSources(plant) {
  if (!plant) {
    return [];
  }

  if (Array.isArray(plant.sources) && plant.sources.length > 0) {
    return [...new Map(plant.sources.map((entry) => [entry.url, entry])).values()];
  }

  const keys = sourceKeys(plant);
  const entries = [];

  for (const key of keys) {
    const matches = SOURCE_INDEX[normalizeKey(key)] ?? null;
    if (Array.isArray(matches)) {
      entries.push(...matches);
    }
  }

  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}

export function hasPlantSources(plant) {
  return getPlantSources(plant).length > 0;
}
