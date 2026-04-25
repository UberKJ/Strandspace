import OpenAI from "openai";
import { execFileSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_MODEL = process.env.DIABETICSPACE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";
const DEFAULT_IMAGE_MODEL = process.env.DIABETICSPACE_IMAGE_MODEL || "gpt-image-1";

let client = null;
let clientApiKey = "";
let clientBaseUrl = "";
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

export function resolveOpenAiApiKeyFromEnv() {
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

function llmDisabledError(providerId) {
  const error = new Error(`LLM provider disabled (${String(providerId ?? "none")})`);
  error.code = "LLM_DISABLED";
  return error;
}

function ollamaUnavailableError(message) {
  const error = new Error(message || "Ollama server not reachable");
  error.code = "OLLAMA_UNAVAILABLE";
  return error;
}

function getClient({ apiKey, baseUrl } = {}) {
  const resolved = String(apiKey ?? "").trim() || resolveOpenAiApiKeyFromEnv();
  const finalKey = String(resolved ?? "").trim();
  if (!finalKey) {
    throw openAiUnavailableError();
  }

  const normalizedBaseUrl = String(baseUrl ?? "").trim();
  if (!client || clientApiKey !== finalKey || clientBaseUrl !== normalizedBaseUrl) {
    clientApiKey = finalKey;
    clientBaseUrl = normalizedBaseUrl;
    client = new OpenAI(normalizedBaseUrl ? { apiKey: finalKey, baseURL: normalizedBaseUrl } : { apiKey: finalKey });
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

  const attempt = (candidate) => {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (error) {
      return { ok: false, error };
    }
  };

  const direct = attempt(raw);
  if (direct.ok) return direct.value;

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const sliced = raw.slice(first, last + 1);
    const extracted = attempt(sliced);
    if (extracted.ok) return extracted.value;
  }

  throw new Error(`${routeLabel}: invalid JSON response (${direct.error instanceof Error ? direct.error.message : String(direct.error)})`);
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
  routeLabel,
  apiKey = "",
  model = "",
  baseUrl = "",
  provider = "openai"
}) {
  const chosenModel = String(model ?? "").trim() || DEFAULT_MODEL;
  if (mock) {
    const recipe = await mock({ systemPrompt, input, routeLabel, provider, model: chosenModel, baseUrl });
    return {
      recipe,
      llm: {
        provider,
        model: chosenModel,
        latencyMs: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null
      }
    };
  }

  const openai = getClient({ apiKey, baseUrl });
  const started = performance.now();
  const response = await openai.responses.create({
    model: chosenModel,
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
      provider,
      model: response.model ?? chosenModel,
      latencyMs: Number((performance.now() - started).toFixed(3)),
      responseId: response.id ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null
    }
  };
}

async function runOpenAiChat({
  systemPrompt,
  input,
  routeLabel,
  apiKey = "",
  model = "",
  baseUrl = "",
  provider = "openai_chat"
}) {
  const chosenModel = String(model ?? "").trim() || DEFAULT_MODEL;
  if (mock) {
    const recipe = await mock({ systemPrompt, input, routeLabel, provider, model: chosenModel, baseUrl });
    return {
      recipe,
      llm: {
        provider,
        model: chosenModel,
        latencyMs: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null
      }
    };
  }

  const openai = getClient({ apiKey, baseUrl });
  const started = performance.now();
  const response = await openai.chat.completions.create({
    model: chosenModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input }
    ],
    temperature: 0.2
  });

  const content = response?.choices?.[0]?.message?.content ?? "";
  const recipe = parseJsonOrThrow(content, routeLabel);
  const usage = normalizeUsage(response?.usage ?? null);

  return {
    recipe,
    llm: {
      provider,
      model: response?.model ?? chosenModel,
      latencyMs: Number((performance.now() - started).toFixed(3)),
      responseId: response?.id ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null
    }
  };
}

async function runOllama({
  systemPrompt,
  input,
  routeLabel,
  model = "",
  baseUrl = "",
  provider = "ollama"
}) {
  const chosenModel = String(model ?? "").trim() || String(process.env.DIABETICSPACE_OLLAMA_MODEL ?? "").trim() || "llama3.1";
  const resolvedBaseUrl = String(baseUrl ?? "").trim() || String(process.env.DIABETICSPACE_OLLAMA_BASE_URL ?? "").trim() || "http://localhost:11434";

  if (mock) {
    const recipe = await mock({ systemPrompt, input, routeLabel, provider, model: chosenModel, baseUrl: resolvedBaseUrl });
    return {
      recipe,
      llm: {
        provider,
        model: chosenModel,
        latencyMs: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null
      }
    };
  }

  const started = performance.now();
  const endpoint = resolvedBaseUrl.replace(/\/+$/, "");
  let response;
  try {
    response = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chosenModel,
        prompt: `${systemPrompt}\n\n${input}`.trim(),
        stream: false
      })
    });
  } catch (error) {
    throw ollamaUnavailableError(error instanceof Error ? error.message : "Ollama server not reachable");
  }

  if (!response.ok) {
    throw ollamaUnavailableError(`Ollama returned HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const recipe = parseJsonOrThrow(payload?.response ?? payload?.message?.content ?? "", routeLabel);

  return {
    recipe,
    llm: {
      provider,
      model: chosenModel,
      latencyMs: Number((performance.now() - started).toFixed(3)),
      responseId: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null
    }
  };
}

async function runRecipeProvider(providerId, args) {
  const provider = String(providerId ?? "").trim().toLowerCase() || "openai";
  if (provider === "openai") {
    return runOpenAi({ ...args, provider: "openai" });
  }
  if (provider === "openai_chat") {
    return runOpenAiChat({ ...args, provider: "openai_chat" });
  }
  if (provider === "ollama") {
    return runOllama({ ...args, provider: "ollama" });
  }
  if (provider === "none") {
    throw llmDisabledError(provider);
  }
  return runOpenAi({ ...args, provider: "openai" });
}

export async function generateDiabeticRecipe(userMessage, localRecallResult, { provider = "openai", apiKey = "", model = "", baseUrl = "" } = {}) {
  const systemPrompt = "You are a diabetic-friendly recipe assistant. You only suggest recipes appropriate for people managing Type 1 or Type 2 diabetes. All recipes must be low glycemic index (GI < 55 preferred), low in added sugar, and blood-sugar friendly. When asked for a recipe, always return a JSON object with these exact keys: recipe_id, title, meal_type, description, ingredients (array of {name,amount,unit,note}), substitutes (array of {original,substitute,reason}), instructions (array of strings), servings, serving_notes, tags (array), gi_notes. Return ONLY the JSON object. No markdown, no explanation.";
  const local = normalizeLocalRecall(localRecallResult);
  const input = [
    `User message: ${String(userMessage ?? "").trim()}`,
    `Local recall context: ${JSON.stringify(local, null, 2)}`
  ].join("\n\n");

  return runRecipeProvider(provider, {
    systemPrompt,
    input,
    routeLabel: "generateDiabeticRecipe",
    apiKey,
    model,
    baseUrl
  });
}

export async function adaptDiabeticRecipe(changeRequest, localRecallResult, { provider = "openai", apiKey = "", model = "", baseUrl = "" } = {}) {
  const systemPrompt = "You adapt existing diabetic-friendly recipes. Keep the recipe safe for people managing Type 1 or Type 2 diabetes. Preserve the core dish unless the requested change requires otherwise. Return a JSON object with these exact keys: recipe_id, title, meal_type, description, ingredients (array of {name,amount,unit,note}), substitutes (array of {original,substitute,reason}), instructions (array of strings), servings, serving_notes, tags (array), gi_notes. Return ONLY the JSON object. No markdown, no explanation.";
  const local = normalizeLocalRecall(localRecallResult);
  const input = [
    `Change request: ${String(changeRequest ?? "").trim()}`,
    `Original recipe: ${JSON.stringify(local, null, 2)}`
  ].join("\n\n");

  return runRecipeProvider(provider, {
    systemPrompt,
    input,
    routeLabel: "adaptDiabeticRecipe",
    apiKey,
    model,
    baseUrl
  });
}

export async function generateFromBuilderSession(sessionObj, localRecallResult, { provider = "openai", apiKey = "", model = "", baseUrl = "" } = {}) {
  const systemPrompt = "You convert a structured diabetic recipe request into one diabetic-friendly recipe. The request includes meal type, health goal, ingredients to include, ingredients to avoid, servings, and extra notes. Return one JSON object with these exact keys: recipe_id, title, meal_type, description, ingredients (array of {name,amount,unit,note}), substitutes (array of {original,substitute,reason}), instructions (array of strings), servings, serving_notes, tags (array), gi_notes. Return ONLY the JSON object. No markdown, no explanation.";
  const local = normalizeLocalRecall(localRecallResult);
  const input = [
    `Builder session request: ${JSON.stringify(sessionObj ?? {}, null, 2)}`,
    `Local recall context: ${JSON.stringify(local, null, 2)}`
  ].join("\n\n");

  return runRecipeProvider(provider, {
    systemPrompt,
    input,
    routeLabel: "generateFromBuilderSession",
    apiKey,
    model,
    baseUrl
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

function sanitizeRecipeImageFilename(recipeId) {
  const safe = String(recipeId ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return safe ? `${safe}.png` : `recipe-${Date.now().toString(36)}.png`;
}

export async function generateDiabeticRecipeImageToFile(recipe, {
  outputDir = "",
  model = DEFAULT_IMAGE_MODEL,
  size = "1024x1024",
  force = false,
  apiKey = ""
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

  const filename = sanitizeRecipeImageFilename(recipe_id);
  const filePath = join(dir, filename);

  try {
    await access(filePath);
    if (!force) {
      return {
        image_url: `diabetic-images/${filename}`,
        filePath,
        model,
        latencyMs: Number((performance.now() - started).toFixed(3))
      };
    }
  } catch {
    // File doesn't exist yet; continue.
  }

  const prompt = buildRecipeImagePrompt(recipe);

  if (imageMock) {
    const buffer = await imageMock({ recipe, prompt, routeLabel: "generateDiabeticRecipeImageToFile" });
    if (!buffer || !(buffer instanceof Uint8Array)) {
      throw new Error("generateDiabeticRecipeImageToFile: image mock must return a Uint8Array");
    }
    await writeFile(filePath, buffer);
    return {
      image_url: `diabetic-images/${filename}`,
      filePath,
      model,
      latencyMs: Number((performance.now() - started).toFixed(3))
    };
  }

  const openai = getClient({ apiKey });
  const response = await openai.images.generate({
    model,
    prompt,
    size
  });

  const item = Array.isArray(response?.data) ? response.data[0] : null;
  const b64 = item?.b64_json ?? item?.b64 ?? null;
  const url = item?.url ?? null;

  let bytes = null;
  if (typeof b64 === "string" && b64.trim()) {
    bytes = Buffer.from(b64, "base64");
  } else if (typeof url === "string" && url.trim()) {
    const fetched = await fetch(url);
    if (!fetched.ok) {
      throw new Error(`generateDiabeticRecipeImageToFile: failed to fetch image url (HTTP ${fetched.status})`);
    }
    bytes = Buffer.from(await fetched.arrayBuffer());
  }

  if (!bytes || !bytes.length) {
    throw new Error("generateDiabeticRecipeImageToFile: OpenAI image response was missing image bytes");
  }

  if (bytes.length > 1_800_000) {
    throw Object.assign(new Error("generateDiabeticRecipeImageToFile: generated image exceeded 1.8MB limit"), {
      code: "IMAGE_TOO_LARGE",
      bytes: bytes.length
    });
  }

  await writeFile(filePath, bytes);
  return {
    image_url: `diabetic-images/${filename}`,
    filePath,
    model,
    latencyMs: Number((performance.now() - started).toFixed(3))
  };
}
