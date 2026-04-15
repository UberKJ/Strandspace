import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "..", "data");
const picturesDir = join(__dirname, "..", "public", "pictures", "plant-media");
const mediaPath = join(dataDir, "plant-media.json");

function normalize(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function extensionFromContentType(contentType = "") {
  const normalized = String(contentType).toLowerCase();
  if (normalized.includes("image/png")) {
    return ".png";
  }
  if (normalized.includes("image/webp")) {
    return ".webp";
  }
  if (normalized.includes("image/gif")) {
    return ".gif";
  }
  return ".jpg";
}

function extensionFromUrl(url = "") {
  const path = String(url).split("?")[0].split("#")[0];
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  if (ext === ".jpeg") {
    return ".jpg";
  }
  if (ext === ".jpg" || ext === ".png" || ext === ".webp" || ext === ".gif") {
    return ext;
  }
  return ".jpg";
}

async function ensurePicturesDir() {
  await mkdir(picturesDir, { recursive: true });
}

async function loadMedia() {
  const raw = await readFile(mediaPath, "utf8");
  const payload = JSON.parse(raw);
  return Array.isArray(payload) ? payload : [];
}

async function writeMedia(entries) {
  await writeFile(mediaPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function downloadImage(url, strand) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/*",
      "User-Agent": "RootlineAtlas/1.0 (Codex; local media sync)"
    }
  });
  if (!response.ok) {
    return null;
  }

  const ext = extensionFromContentType(response.headers.get("content-type") ?? "") || extensionFromUrl(url);
  const fileName = `${normalize(strand)}${ext}`;
  const filePath = join(picturesDir, fileName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, bytes);
  return `/pictures/plant-media/${fileName}`;
}

async function localizeEntry(entry) {
  const current = String(entry.imageUrl ?? "");
  if (current.startsWith("/pictures/plant-media/")) {
    return entry;
  }

  if (!current.startsWith("http")) {
    return entry;
  }

  const strand = entry.strand ?? entry.id ?? entry.name ?? "plant";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const localUrl = await downloadImage(current, strand);
      if (localUrl) {
        return {
          ...entry,
          imageUrl: localUrl,
          imageStatus: "resolved"
        };
      }
    } catch {
      // retry with a short pause
    }

    await sleep(250 * (attempt + 1));
  }

  return entry;
}

await ensurePicturesDir();
const media = await loadMedia();
const localized = [];

for (let index = 0; index < media.length; index += 4) {
  const batch = media.slice(index, index + 1);
  const resolved = await Promise.all(batch.map((entry) => localizeEntry(entry)));
  localized.push(...resolved);
  await sleep(120);
}

await writeMedia(localized);
console.log(`Localized ${localized.length} plant media records to ${picturesDir}`);
