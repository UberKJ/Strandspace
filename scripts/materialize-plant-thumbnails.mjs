import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "..", "data");
const mediaPath = join(dataDir, "plant-media.json");

function normalize(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value = "") {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function scoreSeed(plant, seed) {
  const anchors = plant.anchors ?? {};
  const haystack = normalize([
    plant.name,
    plant.strand,
    plant.pictureKind,
    anchors.plant_type,
    anchors.primary_color,
    anchors.secondary_color,
    anchors.growth_habit
  ].filter(Boolean).join(" "));

  const seedHaystack = normalize([
    seed.name,
    seed.pictureKind,
    seed.title,
    seed.strand
  ].filter(Boolean).join(" "));

  let score = 0;
  for (const token of tokenize(haystack)) {
    if (seedHaystack.includes(token)) score += 3;
  }

  if (seedHaystack.includes(normalize(anchors.plant_type ?? ""))) score += 6;
  if (seedHaystack.includes(normalize(anchors.primary_color ?? ""))) score += 4;
  if (seedHaystack.includes(normalize(anchors.secondary_color ?? ""))) score += 2;

  return score;
}

async function loadMedia() {
  const raw = await readFile(mediaPath, "utf8");
  const payload = JSON.parse(raw);
  return Array.isArray(payload) ? payload : [];
}

function buildSeedLibrary(media) {
  return media
    .filter((item) => String(item.imageUrl ?? "").startsWith("/pictures/plant-thumbs/"))
    .map((item) => ({
      id: item.id,
      name: item.name,
      strand: item.strand,
      pictureKind: item.pictureKind ?? item.name ?? "",
      title: item.title ?? item.name ?? "",
      imageUrl: item.imageUrl,
      pageUrl: item.pageUrl ?? item.fullImageUrl ?? null,
      fullImageUrl: item.fullImageUrl ?? item.pageUrl ?? null,
      source: item.source ?? "wikipedia"
    }));
}

function pickSeed(plant, seeds) {
  let best = null;
  let bestScore = -1;
  for (const seed of seeds) {
    const score = scoreSeed(plant, seed);
    if (score > bestScore) {
      best = seed;
      bestScore = score;
    }
  }
  return best ?? seeds[0] ?? null;
}

const media = await loadMedia();
const seedLibrary = buildSeedLibrary(media);
const updated = media.map((entry) => {
  if (String(entry.imageUrl ?? "").startsWith("/pictures/plant-thumbs/")) {
    return entry;
  }

  const seed = pickSeed(entry, seedLibrary);
  if (!seed) {
    return entry;
  }

  return {
    ...entry,
    imageUrl: seed.imageUrl,
    fullImageUrl: entry.fullImageUrl ?? entry.pageUrl ?? seed.fullImageUrl ?? seed.pageUrl ?? null,
    pageUrl: entry.pageUrl ?? seed.pageUrl ?? seed.fullImageUrl ?? null,
    source: seed.source ?? entry.source ?? "wikipedia",
    imageStatus: "resolved",
    pictureKind: seed.pictureKind ?? entry.pictureKind ?? null
  };
});

await writeFile(mediaPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
console.log(`Mapped ${updated.length} plant entries to local picture strands`);
