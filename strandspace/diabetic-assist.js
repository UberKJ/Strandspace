import OpenAI from "openai";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_MODEL = process.env.DIABETICSPACE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";
const DEFAULT_IMAGE_MODEL = process.env.DIABETICSPACE_IMAGE_MODEL || "gpt-image-1";
const DEFAULT_IMAGE_MAX_BYTES = 1_000_000;
const DEFAULT_IMAGE_QUALITY = process.env.DIABETICSPACE_IMAGE_QUALITY || "low";
const DEFAULT_IMAGE_SIZE = process.env.DIABETICSPACE_IMAGE_SIZE || "1024x1024";
const DEFAULT_IMAGE_OUTPUT_FORMAT = process.env.DIABETICSPACE_IMAGE_OUTPUT_FORMAT || "webp";
const DEFAULT_IMAGE_OUTPUT_COMPRESSION = Number(process.env.DIABETICSPACE_IMAGE_OUTPUT_COMPRESSION ?? 85);

let client = null;
let mock = null;
let imageMock = null;
let resolvedApiKey = null;
let resolvedApiKeyLoaded = false;

function normalizeUsage(usage = null) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inputTokensRaw = usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? null;
  const outputTokensRaw = usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? null;
  const totalTokensRaw = usage.total_tokens ?? usage.totalTokens ?? null;

  const inputTokens = Number.isFinite(Number(inputTokensRaw)) ? Number(inputTokensRaw) : null;
  const outputTokens = Number.isFinite(Number(outputTokensRaw)) ? Number(outputTokensRaw) : null;
  const totalTokens = Number.isFinite(Number(totalTokensRaw))
    ? Number(totalTokensRaw)
    : Number.isFinite(inputTokens) || Number.isFinite(outputTokens)
      ? Number((inputTokens ?? 0) + (outputTokens ?? 0))
      : null;

  return {
    inputTokens,
    outputTokens,
    totalTokens
  };
}

function canUseWindowsEnvFallback() {
  return process.platform === "win32" && process.env.DIABETICSPACE_DISABLE_USER_ENV_LOOKUP !== "1";
}

function readWindowsUserEnvironment(name) {
  if (!canUseWindowsEnvFallback()) {
    return "";
  }

  try {
    return execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `[Environment]::GetEnvironmentVariable('${name}','User')`
      ],
      {
        encoding: "utf8",
        timeout: 1500,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim();
  } catch {
    return "";
  }
}

function resolveOpenAiApiKey() {
  const processKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (processKey) {
    return processKey;
  }

  if (!canUseWindowsEnvFallback()) {
    return "";
  }

  if (resolvedApiKeyLoaded) {
    return resolvedApiKey;
  }

  resolvedApiKeyLoaded = true;
  resolvedApiKey = readWindowsUserEnvironment("OPENAI_API_KEY");

  if (resolvedApiKey) {
    process.env.OPENAI_API_KEY = resolvedApiKey;
  }

  return resolvedApiKey;
}

function openAiUnavailableError() {
  const error = new Error("OPENAI_API_KEY not configured");
  error.code = "OPENAI_API_KEY_MISSING";
  return error;
}

function xaiUnavailableError() {
  const error = new Error("XAI_API_KEY not configured");
  error.code = "XAI_API_KEY_MISSING";
  return error;
}

function getClient() {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    throw openAiUnavailableError();
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

function recipeSchema() {
  const ingredient = {
    type: "object",
    properties: {
      name: { type: "string" },
      amount: { type: ["number", "string", "null"] },
      unit: { type: ["string", "null"] },
      note: { type: ["string", "null"] }
    },
    required: ["name", "amount", "unit", "note"],
    additionalProperties: false
  };

  const substitute = {
    type: "object",
    properties: {
      original: { type: "string" },
      substitute: { type: "string" },
      reason: { type: ["string", "null"] }
    },
    required: ["original", "substitute", "reason"],
    additionalProperties: false
  };

  return {
    type: "object",
    properties: {
      recipe_id: { type: "string" },
      title: { type: "string" },
      meal_type: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      ingredients: { type: "array", items: ingredient, minItems: 1, maxItems: 24 },
      substitutes: { type: "array", items: substitute, maxItems: 8 },
      instructions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 },
      servings: { type: ["number", "integer", "null"] },
      serving_notes: { type: ["string", "null"] },
      tags: { type: "array", items: { type: "string" }, maxItems: 16 },
      gi_notes: { type: ["string", "null"] }
    },
    required: [
      "recipe_id",
      "title",
      "meal_type",
      "description",
      "ingredients",
      "substitutes",
      "instructions",
      "servings",
      "serving_notes",
      "tags",
      "gi_notes"
    ],
    additionalProperties: false
  };
}

function parseJsonOrThrow(text, routeLabel = "diabetic-assist") {
  const raw = String(text ?? "").trim();
  if (!raw) {
    throw new Error(`${routeLabel}: empty OpenAI response`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${routeLabel}: invalid JSON response (${error instanceof Error ? error.message : String(error)})`);
  }
}

function normalizeLocalRecall(localRecallResult) {
  if (!localRecallResult || typeof localRecallResult !== "object") {
    return null;
  }

  return {
    recipe_id: String(localRecallResult.recipe_id ?? "").trim() || null,
    title: String(localRecallResult.title ?? "").trim() || null,
    meal_type: String(localRecallResult.meal_type ?? "").trim() || null,
    tags: Array.isArray(localRecallResult.tags) ? localRecallResult.tags : [],
    description: String(localRecallResult.description ?? "").trim() || null,
    ingredients: Array.isArray(localRecallResult.ingredients) ? localRecallResult.ingredients : [],
    instructions: Array.isArray(localRecallResult.instructions) ? localRecallResult.instructions : [],
    gi_notes: String(localRecallResult.gi_notes ?? "").trim() || null
  };
}

async function runOpenAi({
  systemPrompt,
  input,
  routeLabel
}) {
  if (mock) {
    const recipe = await mock({ systemPrompt, input, routeLabel });
    return {
      recipe,
      llm: {
        provider: "openai",
        model: DEFAULT_MODEL,
        latencyMs: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null
      }
    };
  }

  const openai = getClient();
  const started = performance.now();
  const response = await openai.responses.create({
    model: DEFAULT_MODEL,
    store: false,
    instructions: systemPrompt,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "diabetic_recipe",
        strict: true,
        schema: recipeSchema()
      }
    }
  });

  const recipe = parseJsonOrThrow(response.output_text, routeLabel);
  const usage = normalizeUsage(response.usage);

  return {
    recipe,
    llm: {
      provider: "openai",
      model: response.model ?? DEFAULT_MODEL,
      latencyMs: Number((performance.now() - started).toFixed(3)),
      responseId: response.id ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null
    }
  };
}

export async function generateDiabeticRecipe(userMessage, localRecallResult) {
  const systemPrompt = "You are a diabetic-friendly recipe assistant. You only suggest recipes appropriate for people managing Type 1 or Type 2 diabetes. All recipes must be low glycemic index (GI < 55 preferred), low in added sugar, and blood-sugar friendly. When asked for a recipe, always return a JSON object with these exact keys: recipe_id, title, meal_type, description, ingredients (array of {name,amount,unit,note}), substitutes (array of {original,substitute,reason}), instructions (array of strings), servings, serving_notes, tags (array), gi_notes. Return ONLY the JSON object. No markdown, no explanation.";
  const local = normalizeLocalRecall(localRecallResult);
  const input = [
    `User message: ${String(userMessage ?? "").trim()}`,
    `Local recall context: ${JSON.stringify(local, null, 2)}`
  ].join("\n\n");

  return runOpenAi({
    systemPrompt,
    input,
    routeLabel: "generateDiabeticRecipe"
  });
}

export async function adaptDiabeticRecipe(changeRequest, localRecallResult) {
  const systemPrompt = "You adapt existing diabetic-friendly recipes. Keep the recipe safe for people managing Type 1 or Type 2 diabetes. Preserve the core dish unless the requested change requires otherwise. Return a JSON object with these exact keys: recipe_id, title, meal_type, description, ingredients (array of {name,amount,unit,note}), substitutes (array of {original,substitute,reason}), instructions (array of strings), servings, serving_notes, tags (array), gi_notes. Return ONLY the JSON object. No markdown, no explanation.";
  const local = normalizeLocalRecall(localRecallResult);
  const input = [
    `Change request: ${String(changeRequest ?? "").trim()}`,
    `Original recipe: ${JSON.stringify(local, null, 2)}`
  ].join("\n\n");

  return runOpenAi({
    systemPrompt,
    input,
    routeLabel: "adaptDiabeticRecipe"
  });
}

export async function generateFromBuilderSession(sessionObj, localRecallResult) {
  const systemPrompt = "You convert a structured diabetic recipe request into one diabetic-friendly recipe. The request includes meal type, health goal, ingredients to include, ingredients to avoid, servings, and extra notes. Return one JSON object with these exact keys: recipe_id, title, meal_type, description, ingredients (array of {name,amount,unit,note}), substitutes (array of {original,substitute,reason}), instructions (array of strings), servings, serving_notes, tags (array), gi_notes. Return ONLY the JSON object. No markdown, no explanation.";
  const local = normalizeLocalRecall(localRecallResult);
  const input = [
    `Builder session request: ${JSON.stringify(sessionObj ?? {}, null, 2)}`,
    `Local recall context: ${JSON.stringify(local, null, 2)}`
  ].join("\n\n");

  return runOpenAi({
    systemPrompt,
    input,
    routeLabel: "generateFromBuilderSession"
  });
}

export function __setDiabeticAssistMock(fn) {
  mock = typeof fn === "function" ? fn : null;
}

export function __setDiabeticImageMock(fn) {
  imageMock = typeof fn === "function" ? fn : null;
}

function buildRecipeImagePrompt(recipe) {
  const title = String(recipe?.title ?? "").trim();
  const mealType = String(recipe?.meal_type ?? "").trim();
  const description = String(recipe?.description ?? "").trim();
  const ingredients = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients.map((item) => String(item?.name ?? "").trim()).filter(Boolean).slice(0, 10)
    : [];

  return [
    "Create a polished, appetizing, photo-realistic food image.",
    "No text, no watermark, no logos.",
    "Single dish hero shot, soft studio lighting, shallow depth of field.",
    mealType ? `Meal type: ${mealType}.` : "",
    title ? `Dish: ${title}.` : "",
    description ? `Description: ${description}.` : "",
    ingredients.length ? `Key ingredients: ${ingredients.join(", ")}.` : ""
  ].filter(Boolean).join(" ");
}

function hashImagePrompt(prompt) {
  return createHash("sha256").update(String(prompt ?? "")).digest("hex");
}

function sanitizeRecipeImageBasename(recipeId) {
  const safe = String(recipeId ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return safe ? safe : `recipe-${Date.now().toString(36)}`;
}

function detectImageExtension(bytes, fallback = ".png") {
  if (!bytes || bytes.length < 12) return fallback;

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return ".png";
  }

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return ".jpg";
  }

  // GIF
  const header = bytes.subarray(0, 6).toString("ascii");
  if (header === "GIF87a" || header === "GIF89a") {
    return ".gif";
  }

  // WebP: RIFF....WEBP
  const riff = bytes.subarray(0, 4).toString("ascii");
  const webp = bytes.subarray(8, 12).toString("ascii");
  if (riff === "RIFF" && webp === "WEBP") {
    return ".webp";
  }

  return fallback;
}

function extensionForOutputFormat(format = "") {
  const normalized = String(format ?? "").trim().toLowerCase();
  if (normalized === "webp") return ".webp";
  if (normalized === "jpeg" || normalized === "jpg") return ".jpg";
  if (normalized === "png") return ".png";
  return ".png";
}

export async function generateDiabeticRecipeImageToFile(recipe, {
  provider = "openai",
  outputDir = "",
  model = DEFAULT_IMAGE_MODEL,
  size = DEFAULT_IMAGE_SIZE,
  quality = DEFAULT_IMAGE_QUALITY,
  outputFormat = DEFAULT_IMAGE_OUTPUT_FORMAT,
  outputCompression = DEFAULT_IMAGE_OUTPUT_COMPRESSION,
  maxBytes = DEFAULT_IMAGE_MAX_BYTES,
  force = false
} = {}) {
  const recipe_id = String(recipe?.recipe_id ?? "").trim();
  if (!recipe_id) {
    throw new Error("generateDiabeticRecipeImageToFile: recipe_id is required");
  }

  const dir = String(outputDir ?? "").trim();
  if (!dir) {
    throw new Error("generateDiabeticRecipeImageToFile: outputDir is required");
  }

  const started = performance.now();
  await mkdir(dir, { recursive: true });

  const normalizedProvider = String(provider ?? "openai").trim().toLowerCase() || "openai";
  const basename = sanitizeRecipeImageBasename(recipe_id);
  const existingExtensions = [".webp", ".png", ".jpg", ".gif"];
  const limit = Number(maxBytes ?? DEFAULT_IMAGE_MAX_BYTES);

  if (!force) {
    for (const ext of existingExtensions) {
      const candidatePath = join(dir, `${basename}${ext}`);
      try {
        await access(candidatePath);
        const info = await stat(candidatePath);
        if (info.isFile() && info.size > 0 && info.size <= limit) {
          return {
            image_url: `diabetic-images/${basename}${ext}`,
            filePath: candidatePath,
            provider: normalizedProvider,
            model,
            quality,
            size,
            promptHash: null,
            latencyMs: Number((performance.now() - started).toFixed(3))
          };
        }
      } catch {
        // ignore
      }
    }
  }

  const prompt = buildRecipeImagePrompt(recipe);
  const promptHash = hashImagePrompt(prompt);

  if (imageMock) {
    const buffer = await imageMock({ recipe, prompt, provider: normalizedProvider, model, routeLabel: "generateDiabeticRecipeImageToFile" });
    if (!buffer || !(buffer instanceof Uint8Array)) {
      throw new Error("generateDiabeticRecipeImageToFile: image mock must return a Uint8Array");
    }
    if (buffer.length > limit) {
      throw new Error("generateDiabeticRecipeImageToFile: generated image exceeded 1MB limit");
    }
    const ext = detectImageExtension(Buffer.from(buffer), ".png");
    const filePath = join(dir, `${basename}${ext}`);
    await writeFile(filePath, buffer);
    return {
      image_url: `diabetic-images/${basename}${ext}`,
      filePath,
      provider: normalizedProvider,
      model,
      quality,
      size,
      promptHash,
      latencyMs: Number((performance.now() - started).toFixed(3))
    };
  }

  async function requestOpenAiBytes({
    imageSize,
    imageQuality,
    format,
    compression
  }) {
    const openai = getClient();
    const response = await openai.images.generate({
      model,
      prompt,
      size: imageSize,
      quality: imageQuality,
      output_format: format,
      output_compression: compression
    });

    const item = Array.isArray(response?.data) ? response.data[0] : null;
    const b64 = item?.b64_json ?? item?.b64 ?? null;
    const url = item?.url ?? null;

    if (typeof b64 === "string" && b64.trim()) {
      return Buffer.from(b64, "base64");
    }
    if (typeof url === "string" && url.trim()) {
      const fetched = await fetch(url);
      if (!fetched.ok) {
        throw new Error(`generateDiabeticRecipeImageToFile: failed to fetch image url (HTTP ${fetched.status})`);
      }
      return Buffer.from(await fetched.arrayBuffer());
    }

    throw new Error("generateDiabeticRecipeImageToFile: OpenAI image response was missing image bytes");
  }

  async function requestXaiBytes() {
    const apiKey = String(process.env.XAI_API_KEY ?? "").trim();
    if (!apiKey) {
      throw xaiUnavailableError();
    }
    const xaiModel = String(model ?? process.env.DIABETICSPACE_XAI_IMAGE_MODEL ?? "").trim();
    if (!xaiModel) {
      const error = new Error("DIABETICSPACE_XAI_IMAGE_MODEL not configured");
      error.code = "XAI_IMAGE_MODEL_MISSING";
      throw error;
    }

    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: xaiModel, prompt })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.error?.message || body?.message || `xAI image generation failed (HTTP ${response.status})`;
      throw new Error(message);
    }

    const item = Array.isArray(body?.data) ? body.data[0] : null;
    const b64 = item?.b64_json ?? item?.b64 ?? null;
    const url = item?.url ?? null;
    if (typeof b64 === "string" && b64.trim()) {
      return Buffer.from(b64, "base64");
    }
    if (typeof url === "string" && url.trim()) {
      const fetched = await fetch(url);
      if (!fetched.ok) {
        throw new Error(`generateDiabeticRecipeImageToFile: failed to fetch xAI image url (HTTP ${fetched.status})`);
      }
      return Buffer.from(await fetched.arrayBuffer());
    }
    throw new Error("generateDiabeticRecipeImageToFile: xAI image response was missing image bytes");
  }

  const normalizedSize = String(size ?? "").trim() || "1024x1024";
  const normalizedQuality = String(quality ?? "").trim() || "low";
  const normalizedFormat = String(outputFormat ?? "").trim() || "webp";
  const normalizedCompression = Number.isFinite(Number(outputCompression)) ? Number(outputCompression) : 85;

  let bytes = null;
  let finalExt = null;
  if (normalizedProvider === "xai") {
    const attemptBytes = await requestXaiBytes();
    if (attemptBytes?.length && attemptBytes.length <= limit) {
      bytes = attemptBytes;
      finalExt = detectImageExtension(attemptBytes, extensionForOutputFormat(normalizedFormat));
    }
  } else {
    const attempts = [
      { imageSize: normalizedSize, imageQuality: normalizedQuality, format: normalizedFormat, compression: normalizedCompression },
      { imageSize: normalizedSize, imageQuality: normalizedQuality, format: normalizedFormat, compression: 95 },
      { imageSize: normalizedSize, imageQuality: normalizedQuality, format: "jpeg", compression: 90 },
      { imageSize: normalizedSize, imageQuality: normalizedQuality, format: "jpeg", compression: 97 }
    ];
    for (const attempt of attempts) {
      const attemptBytes = await requestOpenAiBytes(attempt);
      if (!attemptBytes?.length) continue;
      if (attemptBytes.length > limit) continue;
      bytes = attemptBytes;
      finalExt = detectImageExtension(attemptBytes, extensionForOutputFormat(attempt.format));
      break;
    }
  }

  if (!bytes?.length || !finalExt) {
    throw new Error("generateDiabeticRecipeImageToFile: generated image exceeded 1MB limit");
  }

  const filePath = join(dir, `${basename}${finalExt}`);
  await writeFile(filePath, bytes);
  return {
    image_url: `diabetic-images/${basename}${finalExt}`,
    filePath,
    provider: normalizedProvider,
    model,
    quality: normalizedQuality,
    size: normalizedSize,
    promptHash,
    latencyMs: Number((performance.now() - started).toFixed(3))
  };
}
