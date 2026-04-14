import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { resolvePlantThumbnail } from "../strandspace/external.js";
import { normalizeText } from "../strandspace/parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "..", "data");
const picturesDir = join(__dirname, "..", "public", "pictures", "plant-media");
const plantsPaths = [
  join(dataDir, "plants.json"),
  join(dataDir, "region-plants.json"),
  join(dataDir, "generated-plants.json")
];
const outputPath = join(dataDir, "plant-media.json");

function slugify(value = "") {
  return normalizeText(value).replace(/\s+/g, "_").replace(/[^a-z0-9_]+/g, "");
}

function extensionFromUrl(value = "") {
  const path = String(value).split("?")[0].split("#")[0];
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp") {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return ".jpg";
}

function extensionFromContentType(contentType = "") {
  const normalized = String(contentType).toLowerCase();
  if (normalized.includes("image/png")) {
    return ".png";
  }
  if (normalized.includes("image/webp")) {
    return ".webp";
  }
  return ".jpg";
}

function localPicturePath(strand, ext = ".jpg") {
  return join(picturesDir, `${strand}${ext}`);
}

function localPictureUrl(strand, ext = ".jpg") {
  return `/pictures/plant-media/${strand}${ext}`;
}

async function ensurePicturesDir() {
  await mkdir(picturesDir, { recursive: true });
}

function loadSeeds(raw) {
  return raw.flatMap((item) => {
    try {
      const parsed = JSON.parse(item);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
}

function buildSearchUrl(name) {
  const query = encodeURIComponent(`${name} plant`);
  return `https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image&search=${query}`;
}

function normalizeMedia(media, name, strand, searchUrl, query) {
  const best = media?.bestResult ?? null;
  const imageUrl = best?.thumbnail ?? null;
  const pageUrl = best?.url ?? searchUrl;
  return {
    id: media?.id ?? strand,
    name,
    strand,
    source: best?.provider ?? media?.provider ?? "wikipedia",
    imageStatus: imageUrl ? "resolved" : "linked",
    imageUrl,
    pageUrl,
    searchUrl,
    title: best?.title ?? name,
    fullImageUrl: best?.url ?? null,
    pictureKind: query
  };
}

async function downloadToLocal(sourceUrl, strand, fallbackExt = ".jpg") {
  if (!sourceUrl) {
    return null;
  }

  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/*"
    }
  });
  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const ext = extensionFromContentType(contentType) || fallbackExt;
  const filePath = localPicturePath(strand, ext);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, bytes);
  return localPictureUrl(strand, ext);
}

function uniqueQueries(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function plantTypeKey(plant) {
  return normalizeText(plant?.anchors?.plant_type ?? "").trim() || "flower";
}

function plantColorKey(plant) {
  const anchors = plant?.anchors ?? {};
  return normalizeText(anchors.primary_color ?? anchors.secondary_color ?? "").trim();
}

function representativeQueriesForPlant(plant) {
  const type = plantTypeKey(plant);
  const color = plantColorKey(plant);
  return uniqueQueries([
    color && type ? `${color} ${type}` : null,
    color ? `${color} flower` : null,
    type,
    `${type} plant`,
    "flower"
  ]);
}

async function loadPlants() {
  const raw = await Promise.all(plantsPaths.map((path) => readFile(path, "utf8")));
  return loadSeeds(raw);
}

async function resolveRepresentativeLibrary() {
  const libraryQueries = uniqueQueries([
    "flower",
    "tree",
    "shrub",
    "herb",
    "vine",
    "grass",
    "fern",
    "succulent",
    "bulb flower",
    "wildflower",
    "red flower",
    "yellow flower",
    "pink flower",
    "blue flower",
    "white flower",
    "purple flower",
    "orange flower",
    "green plant",
    "basil",
    "rose",
    "lavender",
    "sunflower",
    "lily",
    "dahlia",
    "orchid",
    "aster"
  ]);

  const library = new Map();
  for (const query of libraryQueries) {
    try {
      const media = await resolvePlantThumbnail(
        { name: query, title: query, constructStrand: slugify(query) },
        { query, provider: "wikipedia" }
      );
      const normalized = normalizeMedia(media, query, slugify(query), buildSearchUrl(query), query);
      if (normalized.imageUrl) {
        library.set(query, normalized);
      }
    } catch {
      // skip
    }

    await sleep(120);
  }

  return library;
}

function pickRepresentativeMedia(plant, library) {
  const queries = representativeQueriesForPlant(plant);
  for (const query of queries) {
    const match = library.get(query);
    if (match?.imageUrl) {
      return {
        ...match,
        pictureKind: query
      };
    }
  }

  return null;
}

async function resolveMediaForPlant(plant, library) {
  const name = plant.name ?? plant.title ?? plant.id;
  const strand = plant.constructStrand ?? slugify(name);
  const searchUrl = buildSearchUrl(name);
  const remoteSource = plant.imageUrl ?? plant.fullImageUrl ?? plant.pageUrl ?? null;

  const isGenerated = String(plant.id ?? "").startsWith("gen-");
  const representative = pickRepresentativeMedia(plant, library);

  if (!isGenerated) {
    try {
      const exact = await resolvePlantThumbnail(
        {
          name,
          title: name,
          constructStrand: strand,
          anchors: plant.anchors ?? {}
        },
        {
          query: `${name} plant`,
          provider: "wikipedia"
        }
      );
      const exactMedia = normalizeMedia(exact, name, strand, searchUrl, `${name} plant`);
      if (exactMedia.imageUrl) {
        const localUrl = await downloadToLocal(exactMedia.imageUrl, strand, extensionFromUrl(exactMedia.imageUrl));
        if (localUrl) {
          return {
            ...exactMedia,
            imageUrl: localUrl,
            fullImageUrl: exactMedia.fullImageUrl ?? exactMedia.pageUrl ?? searchUrl,
            pageUrl: exactMedia.pageUrl ?? searchUrl,
            imageStatus: "resolved"
          };
        }

        return exactMedia;
      }
    } catch {
      // fall through to representative image
    }
  }

  if (remoteSource) {
    try {
      const localUrl = await downloadToLocal(remoteSource, strand, extensionFromUrl(remoteSource));
      if (localUrl) {
        return {
          id: plant.id,
          name,
          strand,
          source: plant.source ?? "wikipedia",
          imageStatus: "resolved",
          imageUrl: localUrl,
          pageUrl: plant.pageUrl ?? searchUrl,
          searchUrl,
          title: plant.title ?? name,
          fullImageUrl: plant.fullImageUrl ?? plant.pageUrl ?? searchUrl,
          pictureKind: plant.pictureKind ?? name
        };
      }
    } catch {
      // fall through to representative image
    }
  }

  if (representative?.imageUrl) {
    const localUrl = await downloadToLocal(representative.imageUrl, strand, extensionFromUrl(representative.imageUrl));
    if (localUrl) {
      return {
        id: plant.id,
        name,
        strand,
        searchUrl,
        pageUrl: representative.pageUrl ?? searchUrl,
        title: representative.title ?? name,
        imageStatus: "resolved",
        source: representative.source ?? "wikipedia",
        imageUrl: localUrl,
        fullImageUrl: representative.fullImageUrl ?? representative.pageUrl ?? searchUrl,
        pictureKind: representative.pictureKind ?? name
      };
    }

    return {
      ...representative,
      id: plant.id,
      name,
      strand,
      searchUrl,
      pageUrl: representative.pageUrl ?? searchUrl,
      title: representative.title ?? name,
      imageStatus: "resolved",
      source: representative.source ?? "wikipedia"
    };
  }

  return {
    id: plant.id,
    name,
    strand,
    source: "search-link",
    imageStatus: "linked",
    imageUrl: null,
    pageUrl: searchUrl,
    searchUrl,
    title: name,
    fullImageUrl: null,
    pictureKind: "search-link"
  };
}

await ensurePicturesDir();
const plants = await loadPlants();
const library = await resolveRepresentativeLibrary();
const media = [];

const batchSize = 6;
for (let index = 0; index < plants.length; index += batchSize) {
  const batch = plants.slice(index, index + batchSize);
  const resolved = await Promise.all(batch.map((plant) => resolveMediaForPlant(plant, library)));
  media.push(...resolved);
}

media.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
await writeFile(outputPath, `${JSON.stringify(media, null, 2)}\n`, "utf8");
console.log(`Wrote ${media.length} plant media records to ${outputPath}`);
