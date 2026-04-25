import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, isAbsolute, join, normalize } from "node:path";
import { access, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import {
  ensureSoundspaceTables,
  listSoundConstructs,
  recallSoundspace,
  seedSoundspace,
  upsertSoundConstruct
} from "./strandspace/soundspace.js";
import { buildSoundConstructFromQuestion } from "./strandspace/sound-llm.js";
import {
  ensureSubjectspaceTables,
  listSubjectConstructs,
  listSubjectSpaces,
  recallSubjectSpace,
  seedSubjectspace,
  upsertSubjectConstruct
} from "./strandspace/subjectspace.js";
import {
  buildSuggestedConstructFromAssist,
  generateOpenAiSubjectAssist,
  getOpenAiAssistStatus
} from "./strandspace/openai-assist.js";
import {
  initDiabeticDb,
  recallDiabeticRecipe,
  saveDiabeticRecipe,
  listDiabeticRecipes,
  getDiabeticRecipeById,
  searchDiabeticRecipes,
  seedDiabeticRecipes,
  setDiabeticRecipeImage,
  countDiabeticImagesGeneratedToday,
  recordDiabeticImageGeneration,
  deleteDiabeticRecipe,
  saveDiabeticBuilderSession,
  getDiabeticBuilderSession,
  deleteDiabeticBuilderSession
} from "./strandspace/diabeticspace.js";
import {
  adaptDiabeticRecipe,
  generateDiabeticRecipe,
  generateFromBuilderSession,
  generateDiabeticRecipeImageToFile
} from "./strandspace/diabetic-assist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const configuredDatabasePath = String(process.env.STRANDSPACE_DB_PATH ?? "").trim();
const dataDir = join(__dirname, "data");
const preferredDatabasePath = join(__dirname, "data", "strandspace.sqlite");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

let database = null;
let databasePath = "";

const DIABETIC_IMAGE_MAX_BYTES = 1_000_000;
const DEFAULT_IMAGE_PROVIDER = "none";

function resolveDiabeticImageDir() {
  return String(process.env.DIABETICSPACE_IMAGE_DIR ?? "").trim() || join(dataDir, "diabetic-images");
}

function parseBooleanEnv(value, defaultValue = false) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return Boolean(defaultValue);
  return ["1", "true", "yes", "on"].includes(text);
}

function normalizeImageProvider(value = "") {
  const provider = String(value ?? "").trim().toLowerCase();
  if (provider === "openai" || provider === "xai" || provider === "none") return provider;
  return DEFAULT_IMAGE_PROVIDER;
}

function getImageProviderConfig(providerOverride = "") {
  const provider = normalizeImageProvider(providerOverride || process.env.DIABETICSPACE_IMAGE_PROVIDER || DEFAULT_IMAGE_PROVIDER);
  const openAiModel = String(process.env.DIABETICSPACE_IMAGE_MODEL ?? "gpt-image-1").trim() || "gpt-image-1";
  const xaiModel = String(process.env.DIABETICSPACE_XAI_IMAGE_MODEL ?? "").trim();
  const model = provider === "xai" ? xaiModel : openAiModel;
  const quality = String(process.env.DIABETICSPACE_IMAGE_QUALITY ?? "low").trim() || "low";
  const size = String(process.env.DIABETICSPACE_IMAGE_SIZE ?? "1024x1024").trim() || "1024x1024";
  const outputFormat = String(process.env.DIABETICSPACE_IMAGE_OUTPUT_FORMAT ?? "webp").trim() || "webp";
  const outputCompression = Number.isFinite(Number(process.env.DIABETICSPACE_IMAGE_OUTPUT_COMPRESSION))
    ? Number(process.env.DIABETICSPACE_IMAGE_OUTPUT_COMPRESSION)
    : 85;
  const dailyLimit = Number.isFinite(Number(process.env.DIABETICSPACE_IMAGE_DAILY_LIMIT))
    ? Math.max(0, Math.floor(Number(process.env.DIABETICSPACE_IMAGE_DAILY_LIMIT)))
    : 20;
  const budgetCentsPerImage = Number.isFinite(Number(process.env.DIABETICSPACE_IMAGE_BUDGET_CENTS_PER_IMAGE))
    ? Math.max(0, Number(process.env.DIABETICSPACE_IMAGE_BUDGET_CENTS_PER_IMAGE))
    : 5;

  return {
    enabled: provider !== "none",
    autogenerate: parseBooleanEnv(process.env.DIABETICSPACE_AUTOGENERATE_IMAGES, false),
    provider,
    model,
    quality,
    size,
    outputFormat,
    outputCompression,
    dailyLimit,
    budgetCentsPerImage,
    cacheEnabled: true
  };
}

function diabeticImageFilename(imageUrl = "") {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return "";
  const marker = "diabetic-images/";
  const index = raw.indexOf(marker);
  if (index < 0) return "";
  return raw.slice(index + marker.length).split(/[?#]/)[0].split("/").pop() ?? "";
}

async function fileWithinLimit(filePath, maxBytes = DIABETIC_IMAGE_MAX_BYTES) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0 && info.size <= maxBytes;
  } catch {
    return false;
  }
}

async function findCachedRecipeImage(recipeId, outputDir = resolveDiabeticImageDir()) {
  const basename = sanitizeImageBasename(recipeId);
  for (const ext of [".webp", ".png", ".jpg", ".gif"]) {
    const filePath = join(outputDir, `${basename}${ext}`);
    if (await fileWithinLimit(filePath)) {
      return {
        image_url: `diabetic-images/${basename}${ext}`,
        filePath
      };
    }
  }
  return null;
}

async function safeUnlink(filePath) {
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeImageBasename(value) {
  const safe = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return safe || `recipe-${Date.now().toString(36)}`;
}

function imageExtensionForMime(mime = "") {
  const normalized = String(mime ?? "").trim().toLowerCase();
  if (normalized === "image/png") return ".png";
  if (normalized === "image/jpeg" || normalized === "image/jpg") return ".jpg";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  return "";
}

function decodeUploadedImage(payload = {}) {
  const dataUrl = String(payload.data_url ?? payload.dataUrl ?? "").trim();
  if (dataUrl) {
    const match = dataUrl.match(/^data:(?<mime>image\/[a-z0-9.+-]+);base64,(?<data>[A-Za-z0-9+/=]+)$/i);
    if (!match?.groups?.mime || !match?.groups?.data) {
      throw Object.assign(new Error("Invalid data URL"), { statusCode: 400 });
    }
    const mime = match.groups.mime;
    const bytes = Buffer.from(match.groups.data, "base64");
    return { mime, bytes };
  }

  const base64 = String(payload.base64 ?? payload.bytes_base64 ?? payload.bytesBase64 ?? "").trim();
  const mime = String(payload.mime ?? "").trim();
  if (!base64 || !mime) {
    throw Object.assign(new Error("Image payload is required"), { statusCode: 400 });
  }
  const bytes = Buffer.from(base64, "base64");
  return { mime, bytes };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function toLatencyMs(value) {
  return Number(Math.max(Number(value) || 0, 0.001).toFixed(3));
}

function measureSync(task) {
  const started = performance.now();
  const result = task();
  return {
    result,
    latencyMs: toLatencyMs(performance.now() - started)
  };
}

function readSubjectspaceParams(source = null) {
  if (source instanceof URL) {
    return {
      question: String(source.searchParams.get("q") ?? "").trim(),
      subjectId: String(source.searchParams.get("subjectId") ?? source.searchParams.get("subject") ?? "").trim()
    };
  }

  return {
    question: String(source?.question ?? source?.q ?? "").trim(),
    subjectId: String(source?.subjectId ?? source?.subject ?? "").trim()
  };
}

function buildSubjectspaceAnswerPayload(recall, { question = "", subjectId = "" } = {}) {
  return {
    ok: true,
    source: recall.ready ? "strandspace" : "unresolved",
    question,
    subjectId: recall.matched?.subjectId ?? subjectId,
    answer: recall.answer,
    construct: recall.matched,
    recall
  };
}

function resolveSubjectspaceLabel(db, subjectId, recall, subjects = null) {
  const subjectList = Array.isArray(subjects) ? subjects : listSubjectSpaces(db);
  return recall?.matched?.subjectLabel
    ?? subjectList.find((item) => item.subjectId === subjectId)?.subjectLabel
    ?? "General Recall";
}

function buildSubjectspaceBenchmark(localLatencyMs, llm = {}) {
  if (!llm.enabled) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: null,
      summary: `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${llm.reason}`
    };
  }

  if (llm.error) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: Number.isFinite(llm.latencyMs) ? toLatencyMs(Math.abs(Number(llm.latencyMs) - localLatencyMs)) : null,
      summary: Number.isFinite(llm.latencyMs)
        ? `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM path failed after ${Number(llm.latencyMs).toFixed(3)} ms: ${llm.error}`
        : `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM benchmark failed: ${llm.error}`
    };
  }

  if (!Number.isFinite(llm.latencyMs)) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: null,
      summary: `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM benchmark failed${llm.error ? `: ${llm.error}` : "."}`
    };
  }

  const faster = localLatencyMs <= llm.latencyMs ? "strandbase" : "llm";
  const fasterLatency = faster === "strandbase" ? localLatencyMs : llm.latencyMs;
  const slowerLatency = faster === "strandbase" ? llm.latencyMs : localLatencyMs;
  const speedup = Number((slowerLatency / Math.max(fasterLatency, 0.001)).toFixed(1));
  const deltaMs = toLatencyMs(slowerLatency - fasterLatency);

  return {
    available: true,
    faster,
    speedup,
    deltaMs,
    summary: faster === "strandbase"
      ? `Strandbase recall was ${speedup}x faster than the LLM assist round-trip for this prompt.`
      : `The LLM assist round-trip was ${speedup}x faster than Strandbase recall for this prompt.`
  };
}

async function resolveDatabasePath() {
  if (databasePath) {
    return databasePath;
  }

  if (configuredDatabasePath) {
    databasePath = isAbsolute(configuredDatabasePath)
      ? configuredDatabasePath
      : join(__dirname, configuredDatabasePath);
    return databasePath;
  }

  try {
    await access(preferredDatabasePath);
    databasePath = preferredDatabasePath;
    return databasePath;
  } catch {
    // Fall through.
  }

  try {
    const entries = (await readdir(dataDir))
      .filter((name) => name.endsWith(".sqlite") && name !== "strandspace.sqlite")
      .sort((left, right) => left.localeCompare(right));

    if (entries[0]) {
      databasePath = join(dataDir, entries[0]);
      return databasePath;
    }
  } catch {
    // Fall through to the preferred path.
  }

  databasePath = preferredDatabasePath;
  return databasePath;
}

function openMemoryDatabase() {
  if (database) {
    return database;
  }

  if (!databasePath) {
    throw new Error("Database path has not been resolved yet.");
  }

  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL;");
  ensureSoundspaceTables(database);
  seedSoundspace(database);
  ensureSubjectspaceTables(database);
  seedSubjectspace(database);
  initDiabeticDb(database);
  seedDiabeticRecipes(database);
  return database;
}

async function readStaticFile(urlPath) {
  const cleaned =
    urlPath === "/"
      ? "/index.html"
      : (urlPath === "/soundspace" || urlPath === "/soundspace/" ? "/soundspace/index.html" : urlPath);
  const normalizedUrl = String(cleaned ?? "");

  const diabeticImageMarker = "/diabetic-images/";
  const diabeticImageIndex = normalizedUrl.indexOf(diabeticImageMarker);
  if (diabeticImageIndex >= 0) {
    const relative = normalizedUrl.slice(diabeticImageIndex + diabeticImageMarker.length);
    const baseDir = resolveDiabeticImageDir();
    const filePath = join(baseDir, relative);
    if (!normalize(filePath).startsWith(normalize(baseDir))) {
      throw Object.assign(new Error("Invalid path"), { statusCode: 400 });
    }
    return readFile(filePath);
  }

  const filePath = join(publicDir, normalizedUrl.replace(/^\/+/, ""));

  if (!normalize(filePath).startsWith(normalize(publicDir))) {
    throw Object.assign(new Error("Invalid path"), { statusCode: 400 });
  }

  return readFile(filePath);
}

async function handleStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/soundspace") {
    res.writeHead(302, {
      Location: "/soundspace/",
      "Cache-Control": "no-store"
    });
    res.end();
    return;
  }
  const resolvedPath =
    pathname === "/"
      ? "/index.html"
      : (pathname === "/soundspace" || pathname === "/soundspace/" ? "/soundspace/index.html" : pathname);
  const extension = extname(resolvedPath);

  try {
    const data = await readStaticFile(pathname);
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream"
    });
    res.end(data);
  } catch (error) {
    const statusCode = error?.code === "ENOENT" ? 404 : Number(error?.statusCode ?? 500);
    sendText(res, statusCode, statusCode === 404 ? "Not found" : "Internal server error");
  }
}

function soundConstructAnswerPayload(source, question, construct, recall) {
  return {
    ok: true,
    source,
    question,
    answer: recall.answer,
    construct,
    recall
  };
}

function imageMetadataPayload(recipe = null) {
  return {
    image_url: recipe?.image_url ?? null,
    image_provider: recipe?.image_provider ?? null,
    image_model: recipe?.image_model ?? null,
    image_quality: recipe?.image_quality ?? null,
    image_size: recipe?.image_size ?? null,
    image_prompt_hash: recipe?.image_prompt_hash ?? null,
    image_generated_at: recipe?.image_generated_at ?? null,
    image_generation_latency_ms: recipe?.image_generation_latency_ms ?? null
  };
}

async function handleDiabeticImagePost(req, res, db) {
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST" });
    res.end();
    return;
  }

  let payload = {};
  try {
    payload = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const recipeId = String(payload.recipe_id ?? payload.recipeId ?? "").trim();
  if (!recipeId) {
    sendJson(res, 400, { error: "recipe_id is required" });
    return;
  }

  let recipe = getDiabeticRecipeById(db, recipeId);
  if (!recipe) {
    sendJson(res, 404, { error: "Recipe not found" });
    return;
  }

  const force = Boolean(payload.force_regenerate ?? payload.force ?? false);
  const config = getImageProviderConfig(payload.provider);
  const outputDir = resolveDiabeticImageDir();
  await mkdir(outputDir, { recursive: true });

  if (!force && recipe.image_url) {
    const existingFilename = diabeticImageFilename(recipe.image_url);
    if (!existingFilename || await fileWithinLimit(join(outputDir, existingFilename))) {
      sendJson(res, 200, {
        ok: true,
        created: false,
        cached: true,
        provider: recipe.image_provider ?? config.provider,
        recipe,
        image: imageMetadataPayload(recipe),
        metrics: { local: null, llm: null, image: null }
      });
      return;
    }
  }

  if (!force) {
    const cached = await findCachedRecipeImage(recipeId, outputDir);
    if (cached) {
      recipe = setDiabeticRecipeImage(db, recipeId, cached.image_url, {
        image_provider: recipe.image_provider,
        image_model: recipe.image_model,
        image_quality: recipe.image_quality,
        image_size: recipe.image_size,
        image_prompt_hash: recipe.image_prompt_hash,
        image_generated_at: recipe.image_generated_at,
        image_generation_latency_ms: recipe.image_generation_latency_ms
      }) ?? recipe;
      sendJson(res, 200, {
        ok: true,
        created: false,
        cached: true,
        provider: recipe.image_provider ?? config.provider,
        recipe,
        image: imageMetadataPayload(recipe),
        metrics: { local: null, llm: null, image: null }
      });
      return;
    }
  }

  if (config.provider === "none") {
    sendJson(res, 200, {
      ok: true,
      created: false,
      cached: false,
      provider: "none",
      reason: "Image provider disabled",
      recipe,
      image: imageMetadataPayload(recipe),
      metrics: { local: null, llm: null, image: null }
    });
    return;
  }

  const generatedToday = countDiabeticImagesGeneratedToday(db);
  if (generatedToday >= config.dailyLimit) {
    sendJson(res, 429, {
      ok: false,
      error: "Image generation is disabled for the day because the daily limit was reached.",
      route: "image_daily_limit",
      provider: config.provider,
      daily_limit: config.dailyLimit,
      generated_today: generatedToday,
      recipe,
      metrics: { local: null, llm: null, image: null }
    });
    return;
  }

  try {
    const result = await generateDiabeticRecipeImageToFile(recipe, {
      provider: config.provider,
      outputDir,
      model: config.model,
      size: config.size,
      quality: config.quality,
      outputFormat: config.outputFormat,
      outputCompression: config.outputCompression,
      maxBytes: DIABETIC_IMAGE_MAX_BYTES,
      force
    });
    const generatedAt = new Date().toISOString();
    const metadata = {
      image_provider: result.provider ?? config.provider,
      image_model: result.model ?? config.model,
      image_quality: result.quality ?? config.quality,
      image_size: result.size ?? config.size,
      image_prompt_hash: result.promptHash ?? null,
      image_generated_at: generatedAt,
      image_generation_latency_ms: result.latencyMs ?? null
    };
    const updated = setDiabeticRecipeImage(db, recipe.recipe_id, result.image_url, metadata) ?? recipe;
    recordDiabeticImageGeneration(db, {
      recipe_id: recipe.recipe_id,
      image_provider: metadata.image_provider,
      image_model: metadata.image_model,
      image_url: result.image_url,
      generated_at: generatedAt
    });
    sendJson(res, 200, {
      ok: true,
      created: true,
      cached: false,
      provider: metadata.image_provider,
      recipe: updated,
      image: imageMetadataPayload(updated),
      metrics: {
        local: null,
        llm: null,
        image: {
          provider: metadata.image_provider,
          model: metadata.image_model,
          latencyMs: result.latencyMs ?? null,
          imageUrl: result.image_url
        }
      }
    });
    return;
  } catch (error) {
    const code = String(error?.code ?? "");
    if (code === "OPENAI_API_KEY_MISSING" || code === "XAI_API_KEY_MISSING" || code === "XAI_IMAGE_MODEL_MISSING") {
      sendJson(res, 503, { error: error instanceof Error ? error.message : String(error), route: "api_unavailable", provider: config.provider });
      return;
    }
    sendJson(res, 502, { error: error instanceof Error ? error.message : String(error), route: "image_failed", provider: config.provider });
    return;
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const db = openMemoryDatabase();

  if (url.pathname === "/api/diabetic/recipes") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const mealType = String(url.searchParams.get("meal_type") ?? "").trim();
    sendJson(res, 200, {
      ok: true,
      recipes: listDiabeticRecipes(db, mealType)
    });
    return;
  }

  if (url.pathname === "/api/diabetic/recipe") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const recipeId = String(url.searchParams.get("recipe_id") ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return;
    }

    const recipe = getDiabeticRecipeById(db, recipeId);
    if (!recipe) {
      sendJson(res, 404, { error: "Recipe not found" });
      return;
    }

    sendJson(res, 200, { ok: true, recipe });
    return;
  }

  if (url.pathname === "/api/diabetic/image/status") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const config = getImageProviderConfig();
    sendJson(res, 200, {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      quality: config.quality,
      size: config.size,
      daily_limit: config.dailyLimit,
      generated_today: countDiabeticImagesGeneratedToday(db),
      cache_enabled: config.cacheEnabled,
      autogenerate: config.autogenerate,
      budget_cents_per_image: config.budgetCentsPerImage
    });
    return;
  }

  if (url.pathname === "/api/diabetic/image" || url.pathname === "/api/diabetic/ensure-image") {
    await handleDiabeticImagePost(req, res, db);
    return;
  }
  if (url.pathname === "/api/diabetic/upload-image") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const recipeId = String(payload.recipe_id ?? payload.recipeId ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return;
    }

    const recipe = getDiabeticRecipeById(db, recipeId);
    if (!recipe) {
      sendJson(res, 404, { error: "Recipe not found" });
      return;
    }

    const started = performance.now();
    let decoded;
    try {
      decoded = decodeUploadedImage(payload);
    } catch (error) {
      sendJson(res, Number(error?.statusCode ?? 400), { error: error instanceof Error ? error.message : String(error) });
      return;
    }

    const extension = imageExtensionForMime(decoded.mime);
    if (!extension) {
      sendJson(res, 400, { error: `Unsupported image type (${decoded.mime})` });
      return;
    }

    const bytes = decoded.bytes;
    if (!bytes?.length) {
      sendJson(res, 400, { error: "Uploaded image was empty" });
      return;
    }
    if (bytes.length > DIABETIC_IMAGE_MAX_BYTES) {
      sendJson(res, 413, { error: "Uploaded image is too large (max 1MB)" });
      return;
    }

    const outputDir = resolveDiabeticImageDir();
    await mkdir(outputDir, { recursive: true });

    const base = sanitizeImageBasename(recipeId);
    const filename = `${base}-upload-${Date.now().toString(36)}${extension}`;
    const filePath = join(outputDir, filename);
    if (!normalize(filePath).startsWith(normalize(outputDir))) {
      sendJson(res, 400, { error: "Invalid image path" });
      return;
    }

    const previousFilename = diabeticImageFilename(recipe.image_url);
    const previousPath = previousFilename ? join(outputDir, previousFilename) : "";

    await writeFile(filePath, bytes);
    const updated = setDiabeticRecipeImage(db, recipeId, `diabetic-images/${filename}`) ?? recipe;

    let previousDeleted = false;
    if (previousPath && normalize(previousPath).startsWith(normalize(outputDir)) && previousPath !== filePath) {
      previousDeleted = await safeUnlink(previousPath);
    }

    sendJson(res, 200, {
      ok: true,
      recipe: updated,
      image_url: updated?.image_url ?? null,
      image_deleted: previousDeleted,
      metrics: {
        local: {
          kind: "upload-image",
          latencyMs: toLatencyMs(performance.now() - started)
        },
        llm: null,
        image: null
      }
    });
    return;
  }

  if (url.pathname === "/api/diabetic/delete") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const recipeId = String(payload.recipe_id ?? payload.recipeId ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return;
    }

    const existing = getDiabeticRecipeById(db, recipeId);
    if (!existing) {
      sendJson(res, 404, { error: "Recipe not found" });
      return;
    }

    const deleted = deleteDiabeticRecipe(db, recipeId);
    const filename = diabeticImageFilename(existing.image_url);
    let imageDeleted = false;
    if (filename) {
      const baseDir = resolveDiabeticImageDir();
      const filePath = join(baseDir, filename);
      if (normalize(filePath).startsWith(normalize(baseDir))) {
        imageDeleted = await safeUnlink(filePath);
      }
    }

    sendJson(res, 200, {
      ok: true,
      deleted: Boolean(deleted),
      recipe_id: recipeId,
      image_deleted: imageDeleted
    });
    return;
  }

  if (url.pathname === "/api/diabetic/search") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const query = String(url.searchParams.get("q") ?? "").trim();
    if (!query) {
      sendJson(res, 400, { error: "q is required" });
      return;
    }

    const mealType = String(url.searchParams.get("meal_type") ?? "").trim();
    const localSearch = measureSync(() => searchDiabeticRecipes(db, query, { mealType }));
    const matches = localSearch.result;
    sendJson(res, 200, {
      query,
      meal_type: mealType || null,
      matches,
      count: matches.length,
      metrics: {
        local: {
          kind: "search",
          latencyMs: localSearch.latencyMs
        },
        llm: null,
        image: null
      }
    });
    return;
  }

  if (url.pathname === "/api/diabetic/search-create") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const query = String(payload.query ?? "").trim();
    const use_ai = Boolean(payload.use_ai);
    const mealType = String(payload.meal_type ?? "").trim();

    if (!query) {
      sendJson(res, 400, { error: "query is required" });
      return;
    }

    const localSearch = measureSync(() => searchDiabeticRecipes(db, query, { mealType }));
    const matches = localSearch.result;

    if (!use_ai) {
      sendJson(res, 200, {
        query,
        meal_type: mealType || null,
        matches,
        ai_used: false,
        recipe: null,
        metrics: {
          local: {
            kind: "search-create",
            latencyMs: localSearch.latencyMs
          },
          llm: null,
          image: null
        }
      });
      return;
    }

    const bestMatchRecipe = matches.length ? getDiabeticRecipeById(db, matches[0].recipe_id) : null;

    try {
      const generated = await generateDiabeticRecipe(query, bestMatchRecipe);
      const saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
      sendJson(res, 200, {
        query,
        meal_type: mealType || null,
        matches,
        ai_used: true,
        recipe: saved,
        metrics: {
          local: {
            kind: "search-create",
            latencyMs: localSearch.latencyMs
          },
          llm: generated.llm ?? null,
          image: null
        }
      });
      return;
    } catch (error) {
      if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
        sendJson(res, 503, {
          error: "OPENAI_API_KEY not configured",
          route: "api_unavailable",
          query,
          meal_type: mealType || null,
          matches,
          metrics: {
            local: {
              kind: "search-create",
              latencyMs: localSearch.latencyMs
            },
            llm: null,
            image: null
          }
        });
        return;
      }

      sendJson(res, 200, {
        query,
        meal_type: mealType || null,
        matches,
        ai_used: true,
        recipe: null,
        ai_error: error instanceof Error ? error.message : String(error),
        metrics: {
          local: {
            kind: "search-create",
            latencyMs: localSearch.latencyMs
          },
          llm: null,
          image: null
        }
      });
      return;
    }
  }

  if (url.pathname === "/api/diabetic/chat") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const message = String(payload.message ?? "").trim();
    if (!message) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }

    const started = performance.now();
    const recalled = recallDiabeticRecipe(db, message);
    const latency_ms = toLatencyMs(performance.now() - started);

    if (recalled) {
      const recall_count = Number(recalled.recall_count ?? 0);
      if (recall_count >= 2) {
        sendJson(res, 200, {
          route: "local_recall",
          recipe: recalled,
          recall_count,
          latency_ms,
          metrics: {
            local: {
              kind: "chat-recall",
              latencyMs: latency_ms
            },
            llm: null,
            image: null
          }
        });
        return;
      }

      try {
        const generated = await generateDiabeticRecipe(message, recalled);
        const saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
        sendJson(res, 200, {
          route: "api_validate",
          recipe: saved,
          recall_count: Number(saved?.recall_count ?? recall_count),
          latency_ms,
          metrics: {
            local: {
              kind: "chat-recall",
              latencyMs: latency_ms
            },
            llm: generated.llm ?? null,
            image: null
          }
        });
        return;
      } catch (error) {
        if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
          sendJson(res, 503, {
            error: "OPENAI_API_KEY not configured",
            route: "api_unavailable",
            metrics: {
              local: {
                kind: "chat-recall",
                latencyMs: latency_ms
              },
              llm: null,
              image: null
            }
          });
          return;
        }

        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
          metrics: {
            local: {
              kind: "chat-recall",
              latencyMs: latency_ms
            },
            llm: null,
            image: null
          }
        });
        return;
      }
    }

    try {
      const generated = await generateDiabeticRecipe(message, null);
      const saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
      sendJson(res, 200, {
        route: "api_expand",
        recipe: saved,
        recall_count: Number(saved?.recall_count ?? 0),
        latency_ms,
        metrics: {
          local: {
            kind: "chat-recall",
            latencyMs: latency_ms
          },
          llm: generated.llm ?? null,
          image: null
        }
      });
      return;
    } catch (error) {
      if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
        sendJson(res, 503, {
          error: "OPENAI_API_KEY not configured",
          route: "api_unavailable",
          metrics: {
            local: {
              kind: "chat-recall",
              latencyMs: latency_ms
            },
            llm: null,
            image: null
          }
        });
        return;
      }

      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
        metrics: {
          local: {
            kind: "chat-recall",
            latencyMs: latency_ms
          },
          llm: null,
          image: null
        }
      });
      return;
    }
  }

  if (url.pathname === "/api/diabetic/save") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const localSave = measureSync(() => saveDiabeticRecipe(db, payload));
    const saved = localSave.result;
    sendJson(res, 200, {
      saved: true,
      recipe_id: saved?.recipe_id ?? null,
      image_url: saved?.image_url ?? null,
      metrics: {
        local: {
          kind: "save",
          latencyMs: localSave.latencyMs
        },
        llm: null,
        image: null
      }
    });
    return;
  }

  if (url.pathname === "/api/diabetic/adapt") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const recipeId = String(payload.recipe_id ?? "").trim();
    const change = String(payload.change ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return;
    }
    if (!change) {
      sendJson(res, 400, { error: "change is required" });
      return;
    }

    const original = getDiabeticRecipeById(db, recipeId);
    if (!original) {
      sendJson(res, 404, { error: "Recipe not found" });
      return;
    }

    let adapted;
    let llm = null;
    try {
      const result = await adaptDiabeticRecipe(change, original);
      adapted = result.recipe;
      llm = result.llm ?? null;
    } catch (error) {
      if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
        sendJson(res, 503, {
          error: "OPENAI_API_KEY not configured",
          route: "api_unavailable",
          metrics: {
            local: null,
            llm: null,
            image: null
          }
        });
        return;
      }
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      return;
    }

    let candidateId = `${original.recipe_id}-adapted`;
    let suffix = 1;
    while (getDiabeticRecipeById(db, candidateId)) {
      suffix += 1;
      candidateId = `${original.recipe_id}-adapted-${suffix}`;
      if (suffix > 25) {
        sendJson(res, 409, { error: "Unable to allocate unique adapted recipe_id" });
        return;
      }
    }

    const saved = saveDiabeticRecipe(db, { ...adapted, recipe_id: candidateId, source: "ai" });
    sendJson(res, 200, {
      route: "api_expand",
      recipe: saved,
      saved: true,
      metrics: {
        local: null,
        llm,
        image: null
      }
    });
    return;
  }

  if (url.pathname === "/api/diabetic/builder/start") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const requestedSessionId = String(payload.session_id ?? "").trim();
    const existing = requestedSessionId ? getDiabeticBuilderSession(db, requestedSessionId) : null;
    const session_id = existing?.session_id ?? `diabetic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const stage = existing?.stage ?? "meal_type";

    const session = existing ?? saveDiabeticBuilderSession(db, {
      session_id,
      stage,
      original_query: ""
    });

    const prompt = "What kind of meal do you want to build? Breakfast, lunch, dinner, dessert, or snack?";
    sendJson(res, 200, { session_id, stage, prompt, session });
    return;
  }

  if (url.pathname === "/api/diabetic/builder/next") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const session_id = String(payload.session_id ?? "").trim();
    const answer = String(payload.answer ?? "").trim();
    if (!session_id) {
      sendJson(res, 400, { error: "session_id is required" });
      return;
    }
    if (!answer) {
      sendJson(res, 400, { error: "answer is required" });
      return;
    }

    const session = getDiabeticBuilderSession(db, session_id);
    if (!session) {
      sendJson(res, 404, { error: "Session not found" });
      return;
    }

    const promptsByStage = {
      meal_type: "What kind of meal do you want to build? Breakfast, lunch, dinner, dessert, or snack?",
      goal: "What is the main goal for this recipe? Examples: low-carb, high-protein, lower calorie, gluten-free, budget-friendly.",
      include_items: "What ingredients do you want to include? You can list several separated by commas.",
      avoid_items: "What ingredients or limits should I avoid? Examples: sugar, white flour, rice, potatoes, dairy, gluten.",
      servings: "How many servings do you want?",
      extra_notes: "Any extra notes? Examples: quick meal, one-pan, air fryer, no seafood, more flavor, kid-friendly."
    };

    const stageOrder = ["meal_type", "goal", "include_items", "avoid_items", "servings", "extra_notes", "review"];
    const currentStage = session.stage;

    if (currentStage === "review") {
      const normalized = answer.toLowerCase();
      if (normalized === "confirm") {
        sendJson(res, 200, {
          session_id,
          stage: "review",
          summary: {
            meal_type: session.meal_type,
            goal: session.goal,
            include_items: session.include_items,
            avoid_items: session.avoid_items,
            servings: session.servings,
            extra_notes: session.extra_notes
          },
          prompt: "Confirmed. Now call /api/diabetic/builder/complete to build the recipe."
        });
        return;
      }

      if (normalized.startsWith("edit ")) {
        const field = normalized.slice(5).trim();
        const allowed = new Set(["meal_type", "goal", "include_items", "avoid_items", "servings", "extra_notes"]);
        if (!allowed.has(field)) {
          sendJson(res, 200, {
            session_id,
            stage: "review",
            summary: {
              meal_type: session.meal_type,
              goal: session.goal,
              include_items: session.include_items,
              avoid_items: session.avoid_items,
              servings: session.servings,
              extra_notes: session.extra_notes
            },
            prompt: "Reply 'confirm' to build the recipe, or say 'edit <field>' to change one part."
          });
          return;
        }

        const updated = saveDiabeticBuilderSession(db, {
          ...session,
          stage: field
        });
        sendJson(res, 200, {
          session_id,
          stage: field,
          prompt: promptsByStage[field] ?? "Answer the next question.",
          session: updated
        });
        return;
      }

      sendJson(res, 200, {
        session_id,
        stage: "review",
        summary: {
          meal_type: session.meal_type,
          goal: session.goal,
          include_items: session.include_items,
          avoid_items: session.avoid_items,
          servings: session.servings,
          extra_notes: session.extra_notes
        },
        prompt: "Reply 'confirm' to build the recipe, or say 'edit <field>' to change one part."
      });
      return;
    }

    const nextIndex = Math.max(0, stageOrder.indexOf(currentStage)) + 1;
    const nextStage = stageOrder[nextIndex] ?? "review";

    const patch = { ...session };
    if (currentStage === "meal_type") {
      patch.meal_type = answer.toLowerCase().trim();
    } else if (currentStage === "goal") {
      patch.goal = answer.trim();
    } else if (currentStage === "include_items") {
      patch.include_items = answer.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (currentStage === "avoid_items") {
      patch.avoid_items = answer.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (currentStage === "servings") {
      const parsed = Number(answer);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        sendJson(res, 200, {
          session_id,
          stage: currentStage,
          prompt: promptsByStage.servings,
          session
        });
        return;
      }
      patch.servings = Math.round(parsed);
    } else if (currentStage === "extra_notes") {
      patch.extra_notes = answer.trim();
    }

    patch.stage = nextStage;
    const saved = saveDiabeticBuilderSession(db, patch);

    if (nextStage === "review") {
      sendJson(res, 200, {
        session_id,
        stage: "review",
        summary: {
          meal_type: saved.meal_type,
          goal: saved.goal,
          include_items: saved.include_items,
          avoid_items: saved.avoid_items,
          servings: saved.servings,
          extra_notes: saved.extra_notes
        },
        prompt: "Reply 'confirm' to build the recipe, or say 'edit <field>' to change one part."
      });
      return;
    }

    sendJson(res, 200, {
      session_id,
      stage: nextStage,
      prompt: promptsByStage[nextStage] ?? "Answer the next question.",
      session: saved
    });
    return;
  }

  if (url.pathname === "/api/diabetic/builder/complete") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const session_id = String(payload.session_id ?? "").trim();
    if (!session_id) {
      sendJson(res, 400, { error: "session_id is required" });
      return;
    }

    const session = getDiabeticBuilderSession(db, session_id);
    if (!session) {
      sendJson(res, 404, { error: "Session not found" });
      return;
    }

    const query = [
      session.meal_type ? `meal:${session.meal_type}` : "",
      session.goal ? `goal:${session.goal}` : "",
      Array.isArray(session.include_items) && session.include_items.length ? `include:${session.include_items.join(", ")}` : "",
      Array.isArray(session.avoid_items) && session.avoid_items.length ? `avoid:${session.avoid_items.join(", ")}` : "",
      session.servings ? `servings:${session.servings}` : "",
      session.extra_notes ? `notes:${session.extra_notes}` : ""
    ].filter(Boolean).join(" | ");

    const localRecall = measureSync(() => recallDiabeticRecipe(db, query));
    const recalled = localRecall.result;
    if (recalled) {
      const recall_count = Number(recalled.recall_count ?? 0);
      if (recall_count >= 2) {
        deleteDiabeticBuilderSession(db, session_id);
        sendJson(res, 200, {
          route: "local_recall",
          recipe: recalled,
          recall_count,
          session_id,
          completed: true,
          metrics: {
            local: {
              kind: "builder-recall",
              latencyMs: localRecall.latencyMs
            },
            llm: null,
            image: null
          }
        });
        return;
      }

      try {
        const generated = await generateFromBuilderSession(session, recalled);
        const saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
        deleteDiabeticBuilderSession(db, session_id);
        sendJson(res, 200, {
          route: "api_validate",
          recipe: saved,
          recall_count: Number(saved?.recall_count ?? recall_count),
          session_id,
          completed: true,
          metrics: {
            local: {
              kind: "builder-recall",
              latencyMs: localRecall.latencyMs
            },
            llm: generated.llm ?? null,
            image: null
          }
        });
        return;
      } catch (error) {
        if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
          sendJson(res, 503, {
            error: "OPENAI_API_KEY not configured",
            route: "api_unavailable",
            metrics: {
              local: {
                kind: "builder-recall",
                latencyMs: localRecall.latencyMs
              },
              llm: null,
              image: null
            }
          });
          return;
        }
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    try {
      const generated = await generateFromBuilderSession(session, null);
      const saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
      deleteDiabeticBuilderSession(db, session_id);
      sendJson(res, 200, {
        route: "api_expand",
        recipe: saved,
        recall_count: Number(saved?.recall_count ?? 0),
        session_id,
        completed: true,
        metrics: {
          local: {
            kind: "builder-recall",
            latencyMs: localRecall.latencyMs
          },
          llm: generated.llm ?? null,
          image: null
        }
      });
      return;
    } catch (error) {
      if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
        sendJson(res, 503, {
          error: "OPENAI_API_KEY not configured",
          route: "api_unavailable",
          metrics: {
            local: {
              kind: "builder-recall",
              latencyMs: localRecall.latencyMs
            },
            llm: null,
            image: null
          }
        });
        return;
      }
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }

  if (url.pathname === "/api/subjectspace/subjects") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjects = listSubjectSpaces(db);
    const defaultSubjectId = subjects.find((item) => item.subjectId === "music-engineering")?.subjectId
      ?? subjects[0]?.subjectId
      ?? "";

    sendJson(res, 200, {
      ok: true,
      defaultSubjectId,
      subjects
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/library") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjectId = url.searchParams.get("subjectId") ?? url.searchParams.get("subject") ?? "";
    const constructs = listSubjectConstructs(db, subjectId);

    sendJson(res, 200, {
      ok: true,
      subjectId,
      count: constructs.length,
      constructs
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/assist/status") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, {
      ok: true,
      ...getOpenAiAssistStatus()
    });
    return;
  }

  if (url.pathname === "/api/subjectspace" || url.pathname === "/api/subjectspace/recall") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(url);
    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });

    sendJson(res, 200, buildSubjectspaceAnswerPayload(recall, { question, subjectId }));
    return;
  }

  if (url.pathname === "/api/subjectspace/learn") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const subjectLabel = String(payload.subjectLabel ?? payload.subject ?? "").trim();
    const constructLabel = String(payload.constructLabel ?? payload.name ?? "").trim();

    if (!subjectLabel) {
      sendJson(res, 400, { error: "subjectLabel is required" });
      return;
    }

    if (!constructLabel && !String(payload.target ?? "").trim()) {
      sendJson(res, 400, { error: "constructLabel or target is required" });
      return;
    }

    const saved = upsertSubjectConstruct(db, {
      ...payload,
      provenance: {
        source: payload.provenance?.source ?? "manual",
        learnedFromQuestion: payload.provenance?.learnedFromQuestion ?? payload.question ?? null
      }
    });

    sendJson(res, 200, {
      ok: true,
      construct: saved,
      subjects: listSubjectSpaces(db),
      count: listSubjectConstructs(db, saved.subjectId).length
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/assist") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const config = getOpenAiAssistStatus();
    if (!config.enabled) {
      sendJson(res, 503, {
        error: config.reason,
        config
      });
      return;
    }

    const subjects = listSubjectSpaces(db);
    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall, subjects);

    let assistResult;
    const llmStarted = performance.now();
    try {
      assistResult = await generateOpenAiSubjectAssist({
        question,
        subjectId,
        subjectLabel,
        recall
      });
    } catch (error) {
      sendJson(res, 502, {
        error: error instanceof Error ? error.message : String(error),
        config,
        recall,
        llm: {
          provider: config.provider,
          model: config.model,
          latencyMs: toLatencyMs(performance.now() - llmStarted),
          inputTokens: null,
          outputTokens: null,
          totalTokens: null
        }
      });
      return;
    }
    const llmLatencyMs = toLatencyMs(performance.now() - llmStarted);

    const suggestedConstruct = buildSuggestedConstructFromAssist({
      subjectId: subjectId || recall.matched?.subjectId || undefined,
      subjectLabel,
      assist: assistResult.assist,
      question,
      routingMode: recall.routing?.mode ?? ""
    });

    let savedConstruct = null;
    if (payload.save === true) {
      savedConstruct = upsertSubjectConstruct(db, suggestedConstruct);
    }

    sendJson(res, 200, {
      ok: true,
      source: "openai",
      config: {
        ...config,
        model: assistResult.model ?? config.model
      },
      llm: {
        provider: config.provider,
        model: assistResult.model ?? config.model,
        latencyMs: llmLatencyMs,
        inputTokens: assistResult.usage?.inputTokens ?? null,
        outputTokens: assistResult.usage?.outputTokens ?? null,
        totalTokens: assistResult.usage?.totalTokens ?? null
      },
      recall,
      assist: assistResult.assist,
      suggestedConstruct,
      savedConstruct,
      responseId: assistResult.responseId
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/compare") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const subjects = listSubjectSpaces(db);
    const local = measureSync(() => recallSubjectSpace(db, {
      question,
      subjectId
    }));
    const recall = local.result;
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall, subjects);
    const config = getOpenAiAssistStatus();
    let llm = {
      label: "LLM assist round-trip",
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      mode: "assist_round_trip",
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      apiAction: null,
      constructLabel: null,
      reason: config.reason,
      error: null
    };

    if (config.enabled) {
      const started = performance.now();
      try {
        const assistResult = await generateOpenAiSubjectAssist({
          question,
          subjectId,
          subjectLabel,
          recall
        });

        llm = {
          ...llm,
          model: assistResult.model ?? llm.model,
          latencyMs: toLatencyMs(performance.now() - started),
          inputTokens: assistResult.usage?.inputTokens ?? null,
          outputTokens: assistResult.usage?.outputTokens ?? null,
          totalTokens: assistResult.usage?.totalTokens ?? null,
          apiAction: assistResult.assist?.apiAction ?? null,
          constructLabel: assistResult.assist?.constructLabel ?? null
        };
      } catch (error) {
        llm = {
          ...llm,
          latencyMs: toLatencyMs(performance.now() - started),
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    sendJson(res, 200, {
      ok: true,
      question,
      subjectLabel,
      subjectId: recall.matched?.subjectId ?? subjectId,
      local: {
        label: "Strandbase recall",
        latencyMs: local.latencyMs,
        ready: recall.ready,
        route: recall.routing?.mode ?? null,
        confidence: Number(recall.readiness?.confidence ?? 0),
        candidateCount: Number(recall.candidates?.length ?? 0),
        constructLabel: recall.matched?.constructLabel ?? null
      },
      llm,
      comparison: buildSubjectspaceBenchmark(local.latencyMs, llm),
      recall
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/answer") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });

    sendJson(res, 200, buildSubjectspaceAnswerPayload(recall, { question, subjectId }));
    return;
  }

  if (url.pathname === "/api/soundspace" || url.pathname === "/api/soundspace/recall") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const question = String(url.searchParams.get("q") ?? "").trim();
    const recall = recallSoundspace(db, question);

    sendJson(res, 200, {
      ok: true,
      ...recall,
      libraryCount: listSoundConstructs(db).length
    });
    return;
  }

  if (url.pathname === "/api/soundspace/library") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const constructs = listSoundConstructs(db);
    sendJson(res, 200, {
      ok: true,
      count: constructs.length,
      constructs
    });
    return;
  }

  if (url.pathname === "/api/soundspace/learn") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const saved = upsertSoundConstruct(db, {
      ...payload,
      provenance: {
        source: payload.provenance?.source ?? "manual-or-llm",
        learnedFromQuestion: payload.provenance?.learnedFromQuestion ?? payload.question ?? null
      }
    });

    sendJson(res, 200, {
      ok: true,
      construct: saved,
      count: listSoundConstructs(db).length
    });
    return;
  }

  if (url.pathname === "/api/soundspace/answer") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const question = String(payload.question ?? payload.q ?? "").trim();
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const recalled = recallSoundspace(db, question);
    if (!payload.forceGenerate && recalled.ready && recalled.matched) {
      sendJson(res, 200, soundConstructAnswerPayload("strandspace", question, recalled.matched, recalled));
      return;
    }

    let generated;
    try {
      generated = buildSoundConstructFromQuestion(question, {
        provider: payload.provider ?? "heuristic-llm",
        model: payload.model ?? "soundspace-template-v1"
      });
    } catch (error) {
      sendJson(res, 422, {
        error: error instanceof Error ? error.message : String(error),
        recall: recalled
      });
      return;
    }

    const saved = upsertSoundConstruct(db, generated);
    const refreshed = recallSoundspace(db, question);
    sendJson(res, 200, soundConstructAnswerPayload("generated-and-stored", question, saved, refreshed));
    return;
  }

  sendText(res, 404, "Not found");
}

export async function createApp() {
  await resolveDatabasePath();
  openMemoryDatabase();

  return http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendText(res, 400, "Missing request URL");
        return;
      }

      const url = new URL(req.url, "http://localhost");

      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res);
        return;
      }

      if (req.method === "GET") {
        await handleStatic(req, res);
        return;
      }

      res.writeHead(405, {
        Allow: "GET",
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end("Method not allowed");
    } catch (error) {
      sendJson(res, 500, {
        error: "Internal server error",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await createApp();

  server.listen(port, () => {
    console.log(`Strandspace Studio running at http://localhost:${port}`);
  });
}
