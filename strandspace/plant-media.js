import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultPlantMediaPath = join(__dirname, "..", "data", "plant-media.json");

let cachedMedia = null;
let cachedPath = null;
let cachedMtimeMs = null;
let cachedSize = null;

function normalizeKey(value = "") {
  return normalizeText(value).replace(/\s+/g, "_");
}

function loadPlantMedia(filePath = defaultPlantMediaPath) {
  if (cachedMedia && cachedPath === filePath && existsSync(filePath)) {
    try {
      const stats = statSync(filePath);
      if (stats.mtimeMs === cachedMtimeMs && stats.size === cachedSize) {
        return cachedMedia;
      }
    } catch {
      // Fall through to a reload.
    }
  }

  if (cachedMedia && cachedPath === filePath && !existsSync(filePath)) {
    return cachedMedia;
  }

  if (!existsSync(filePath)) {
    cachedMedia = new Map();
    return cachedMedia;
  }

  try {
    const contents = readFileSync(filePath, "utf8");
    const payload = JSON.parse(contents);
    const entries = Array.isArray(payload) ? payload : [];
    cachedMedia = new Map(entries.map((entry) => [normalizeKey(entry.id ?? entry.constructStrand ?? entry.name), entry]));
    cachedPath = filePath;
    try {
      const stats = statSync(filePath);
      cachedMtimeMs = stats.mtimeMs;
      cachedSize = stats.size;
    } catch {
      cachedMtimeMs = null;
      cachedSize = null;
    }
    return cachedMedia;
  } catch {
    cachedMedia = new Map();
    cachedPath = filePath;
    cachedMtimeMs = null;
    cachedSize = null;
    return cachedMedia;
  }
}

function getPlantMedia(plant, filePath = defaultPlantMediaPath) {
  if (!plant) {
    return null;
  }

  const media = loadPlantMedia(filePath);
  const keys = [
    plant.id,
    plant.constructStrand,
    plant.name,
    ...((plant.aliases ?? []).slice(0, 3))
  ]
    .filter(Boolean)
    .map(normalizeKey);

  for (const key of keys) {
    const entry = media.get(key);
    if (entry) {
      return entry;
    }
  }

  return null;
}

export { defaultPlantMediaPath, getPlantMedia, loadPlantMedia };
