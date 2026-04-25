// Strandspace LLM dispatch module (multi-provider).
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

// --- Named OpenAI-compatible providers ----------------------------------
// Each entry is a label + default base URL + default model. The actual call
// is made through runOpenAiChat with the configured base_url + api_key, so
// any vendor that implements the OpenAI Chat Completions schema works here.
const OPENAI_COMPATIBLE_PRESETS = {
  mistral: { label: "Mistral", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-large-latest" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile" },
  xai: { label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", defaultModel: "grok-2-latest" },
  together: { label: "Together AI", baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openrouter/auto" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
  custom: { label: "Custom (OpenAI-compatible)", baseUrl: "", defaultModel: "" }
};

export function getOpenAiCompatiblePresets() {
  return Object.fromEntries(Object.entries(OPENAI_COMPATIBLE_PRESETS).map(([k, v]) => [k, { ...v }]));
}

function isOpenAiCompatibleProvider(providerId) {
  return Object.prototype.hasOwnProperty.call(OPENAI_COMPATIBLE_PRESETS, String(providerId ?? "").toLowerCase());
}

async function runOpenAiCompatible({
  systemPrompt,
  input,
  routeLabel,
  apiKey = "",
  model = "",
  baseUrl = "",
  provider = "custom"
}) {
  const preset = OPENAI_COMPATIBLE_PRESETS[provider] ?? OPENAI_COMPATIBLE_PRESETS.custom;
  const resolvedBaseUrl = String(baseUrl ?? "").trim() || preset.baseUrl;
  const chosenModel = String(model ?? "").trim() || preset.defaultModel || DEFAULT_MODEL;

  if (!resolvedBaseUrl) {
    const error = new Error(`${provider}: base_url is required (no default for custom)`);
    error.code = "PROVIDER_BASE_URL_MISSING";
    throw error;
  }

  return runOpenAiChat({
    systemPrompt,
    input,
    routeLabel,
    apiKey,
    model: chosenModel,
    baseUrl: resolvedBaseUrl,
    provider
  });
}

function anthropicUnavailableError(message) {
  const error = new Error(message || "Anthropic API not reachable");
  error.code = "ANTHROPIC_UNAVAILABLE";
  return error;
}

async function runAnthropic({
  systemPrompt,
  input,
  routeLabel,
  apiKey = "",
  model = "",
  baseUrl = "",
  provider = "anthropic"
}) {
  const resolvedKey = String(apiKey ?? "").trim() || String(process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!resolvedKey) {
    const error = new Error("ANTHROPIC_API_KEY not configured");
    error.code = "ANTHROPIC_API_KEY_MISSING";
    throw error;
  }
  const chosenModel = String(model ?? "").trim() || String(process.env.ANTHROPIC_MODEL ?? "").trim() || "claude-sonnet-4-6";
  const endpoint = (String(baseUrl ?? "").trim() || "https://api.anthropic.com").replace(/\/+$/, "");

  if (mock) {
    const recipe = await mock({ systemPrompt, input, routeLabel, provider, model: chosenModel, baseUrl: endpoint });
    return {
      recipe,
      llm: {
        provider, model: chosenModel, latencyMs: null, responseId: null,
        inputTokens: null, outputTokens: null, totalTokens: null
      }
    };
  }

  const started = performance.now();
  let response;
  try {
    response = await fetch(`${endpoint}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": resolvedKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: input }]
      })
    });
  } catch (error) {
    throw anthropicUnavailableError(error instanceof Error ? error.message : "Anthropic API not reachable");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw anthropicUnavailableError(`Anthropic returned HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`);
  }

  const payload = await response.json().catch(() => ({}));
  const content = Array.isArray(payload?.content)
    ? payload.content.map((block) => String(block?.text ?? "")).join("")
    : "";
  const recipe = parseJsonOrThrow(content, routeLabel);
  const usage = normalizeUsage({
    input_tokens: payload?.usage?.input_tokens,
    output_tokens: payload?.usage?.output_tokens
  });

  return {
    recipe,
    llm: {
      provider,
      model: payload?.model ?? chosenModel,
      latencyMs: Number((performance.now() - started).toFixed(3)),
      responseId: payload?.id ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null
    }
  };
}

function geminiUnavailableError(message) {
  const error = new Error(message || "Google Gemini API not reachable");
  error.code = "GEMINI_UNAVAILABLE";
  return error;
}

async function runGemini({
  systemPrompt,
  input,
  routeLabel,
  apiKey = "",
  model = "",
  baseUrl = "",
  provider = "gemini"
}) {
  const resolvedKey = String(apiKey ?? "").trim()
    || String(process.env.GOOGLE_API_KEY ?? "").trim()
    || String(process.env.GEMINI_API_KEY ?? "").trim();
  if (!resolvedKey) {
    const error = new Error("GOOGLE_API_KEY (or GEMINI_API_KEY) not configured");
    error.code = "GEMINI_API_KEY_MISSING";
    throw error;
  }
  const chosenModel = String(model ?? "").trim() || String(process.env.GEMINI_MODEL ?? "").trim() || "gemini-1.5-flash";
  const endpoint = (String(baseUrl ?? "").trim() || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");

  if (mock) {
    const recipe = await mock({ systemPrompt, input, routeLabel, provider, model: chosenModel, baseUrl: endpoint });
    return {
      recipe,
      llm: {
        provider, model: chosenModel, latencyMs: null, responseId: null,
        inputTokens: null, outputTokens: null, totalTokens: null
      }
    };
  }

  const started = performance.now();
  let response;
  const url = `${endpoint}/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(resolvedKey)}`;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: input }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });
  } catch (error) {
    throw geminiUnavailableError(error instanceof Error ? error.message : "Gemini API not reachable");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw geminiUnavailableError(`Gemini returned HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`);
  }

  const payload = await response.json().catch(() => ({}));
  const content = (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => String(part?.text ?? ""))
    .join("");
  const recipe = parseJsonOrThrow(content, routeLabel);
  const usage = normalizeUsage({
    prompt_tokens: payload?.usageMetadata?.promptTokenCount,
    completion_tokens: payload?.usageMetadata?.candidatesTokenCount,
    total_tokens: payload?.usageMetadata?.totalTokenCount
  });

  return {
    recipe,
    llm: {
      provider,
      model: chosenModel,
      latencyMs: Number((performance.now() - started).toFixed(3)),
      responseId: payload?.responseId ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null
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
  if (provider === "anthropic") {
    return runAnthropic({ ...args, provider: "anthropic" });
  }
  if (provider === "gemini") {
    return runGemini({ ...args, provider: "gemini" });
  }
  if (isOpenAiCompatibleProvider(provider)) {
    return runOpenAiCompatible({ ...args, provider });
  }
  if (provider === "none") {
    throw llmDisabledError(provider);
  }
  return runOpenAi({ ...args, provider: "openai" });
}

function resolveProviderBaseUrl(providerId, baseUrl) {
  const trimmed = String(baseUrl ?? "").trim();
  if (trimmed) return trimmed;
  if (isOpenAiCompatibleProvider(providerId)) {
    return OPENAI_COMPATIBLE_PRESETS[providerId]?.baseUrl ?? "";
  }
  if (providerId === "ollama") {
    return "http://localhost:11434";
  }
  return "";
}

function resolveProviderDefaultModel(providerId) {
  if (isOpenAiCompatibleProvider(providerId)) {
    return OPENAI_COMPATIBLE_PRESETS[providerId]?.defaultModel ?? "";
  }
  if (providerId === "ollama") {
    return "llama3.1";
  }
  return "";
}

async function listOpenAiModelIds({ apiKey = "", baseUrl = "" } = {}) {
  const openai = getClient({ apiKey, baseUrl });
  const page = await openai.models.list();
  const data = Array.isArray(page?.data) ? page.data : [];
  return data
    .map((row) => String(row?.id ?? "").trim())
    .filter(Boolean);
}

function deriveImageModelIdsFromModels(providerId, models) {
  const provider = String(providerId ?? "").trim().toLowerCase();
  const list = Array.isArray(models) ? models.map((m) => String(m ?? "").trim()).filter(Boolean) : [];
  const image = list.filter((id) => {
    const lower = id.toLowerCase();
    return lower.includes("gpt-image") || lower.includes("dall-e") || lower.includes("image");
  });

  // The models endpoint does not always surface every image model. Provide a
  // small, safe fallback for OpenAI so users can still select common options.
  if (provider === "openai") {
    const fallback = ["gpt-image-1", "dall-e-3", "dall-e-2"];
    for (const id of fallback) {
      if (!image.includes(id)) image.push(id);
    }
  }

  return image;
}

async function listOllamaModelIds(baseUrl) {
  const endpoint = String(baseUrl ?? "").trim().replace(/\/+$/, "") || "http://localhost:11434";
  let response;
  try {
    response = await fetch(`${endpoint}/api/tags`, { method: "GET" });
  } catch (error) {
    throw ollamaUnavailableError(error instanceof Error ? error.message : "Ollama server not reachable");
  }
  if (!response.ok) {
    throw ollamaUnavailableError(`Ollama returned HTTP ${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  const models = Array.isArray(payload?.models) ? payload.models : [];
  return models
    .map((row) => String(row?.name ?? "").trim())
    .filter(Boolean);
}

async function tryListProviderModels(providerId, { apiKey = "", baseUrl = "" } = {}) {
  const provider = String(providerId ?? "").trim().toLowerCase() || "openai";
  if (provider === "openai") {
    const models = await listOpenAiModelIds({ apiKey, baseUrl: "" });
    return { ok: true, models };
  }
  if (provider === "openai_chat" || isOpenAiCompatibleProvider(provider)) {
    const resolvedBaseUrl = resolveProviderBaseUrl(provider, baseUrl);
    if (!resolvedBaseUrl) {
      return { ok: false, models: [], error: "base_url is required to list models" };
    }
    const models = await listOpenAiModelIds({ apiKey, baseUrl: resolvedBaseUrl });
    return { ok: true, models };
  }
  if (provider === "ollama") {
    const resolvedBaseUrl = resolveProviderBaseUrl(provider, baseUrl);
    const models = await listOllamaModelIds(resolvedBaseUrl);
    return { ok: true, models };
  }
  return { ok: false, models: [], error: "Model listing not supported for this provider." };
}

function suggestModelFromList(providerId, models, preferredModel) {
  const list = Array.isArray(models) ? models.map((m) => String(m ?? "").trim()).filter(Boolean) : [];
  if (!list.length) return "";
  const preferred = String(preferredModel ?? "").trim();
  if (preferred && list.includes(preferred)) return preferred;

  const fallback = resolveProviderDefaultModel(providerId);
  if (fallback && list.includes(fallback)) return fallback;

  if (providerId === "xai") {
    const grok = list.find((m) => m === "grok-2-latest" || m.startsWith("grok-2")) ?? "";
    if (grok) return grok;
  }

  return list[0] ?? "";
}

function suggestImageModelFromList(providerId, models, preferredModel) {
  const provider = String(providerId ?? "").trim().toLowerCase();
  const list = Array.isArray(models) ? models.map((m) => String(m ?? "").trim()).filter(Boolean) : [];
  if (!list.length) return "";

  const preferred = String(preferredModel ?? "").trim();
  if (preferred && list.includes(preferred)) return preferred;

  if (provider === "openai") {
    const preferredOpenAi = ["gpt-image-1", "dall-e-3", "dall-e-2"];
    for (const candidate of preferredOpenAi) {
      if (list.includes(candidate)) return candidate;
    }
  }

  return list[0] ?? "";
}

// Tiny ping used by the "Test connection" button. Returns latency + sample
// reply text. Routes through the same dispatcher but uses a trivial prompt
// that doesn't require structured JSON output.
export async function testProviderConnection({ provider = "openai", apiKey = "", model = "", baseUrl = "", imageModel = "", image_model = "" } = {}) {
  const providerId = String(provider ?? "").trim().toLowerCase() || "openai";
  if (providerId === "none") {
    throw llmDisabledError(providerId);
  }
  const started = performance.now();
  // We reuse the recipe dispatcher but with a no-op JSON shape: a system that
  // asks for {"ok": true} guarantees a small, parseable response everywhere.
  const args = {
    systemPrompt: "You are a connection test. Reply ONLY with the JSON object: {\"ok\": true}. No prose.",
    input: "ping",
    routeLabel: "testProviderConnection",
    apiKey,
    model,
    baseUrl
  };
  let result;
  try {
    if (providerId === "openai") result = await runOpenAi({ ...args, provider: providerId });
    else if (providerId === "openai_chat") result = await runOpenAiChat({ ...args, provider: providerId });
    else if (providerId === "ollama") result = await runOllama({ ...args, provider: providerId });
    else if (providerId === "anthropic") result = await runAnthropic({ ...args, provider: providerId });
    else if (providerId === "gemini") result = await runGemini({ ...args, provider: providerId });
    else if (isOpenAiCompatibleProvider(providerId)) result = await runOpenAiCompatible({ ...args, provider: providerId });
    else result = await runOpenAi({ ...args, provider: "openai" });
  } catch (error) {
    let modelsPayload = null;
    try {
      modelsPayload = await tryListProviderModels(providerId, { apiKey, baseUrl });
    } catch (listError) {
      modelsPayload = { ok: false, models: [], error: listError instanceof Error ? listError.message : String(listError) };
    }

    const resolvedImageModel = String(imageModel || image_model || "").trim();
    const imageModels = modelsPayload?.ok ? deriveImageModelIdsFromModels(providerId, modelsPayload.models) : [];
    const suggestedImageModel = modelsPayload?.ok ? (suggestImageModelFromList(providerId, imageModels, resolvedImageModel) || null) : null;

    return {
      ok: false,
      provider: providerId,
      latencyMs: Number((performance.now() - started).toFixed(3)),
      error: error instanceof Error ? error.message : String(error),
      code: error?.code ?? null,
      models: modelsPayload?.ok ? (modelsPayload.models ?? []) : [],
      models_error: modelsPayload && !modelsPayload.ok ? String(modelsPayload.error ?? "Unable to list models") : null,
      suggested_model: modelsPayload?.ok ? (suggestModelFromList(providerId, modelsPayload.models, model) || null) : null,
      image_models: imageModels,
      image_models_error: modelsPayload && !modelsPayload.ok ? String(modelsPayload.error ?? "Unable to list models") : null,
      suggested_image_model: suggestedImageModel
    };
  }

  let modelsPayload = null;
  try {
    modelsPayload = await tryListProviderModels(providerId, { apiKey, baseUrl });
  } catch (listError) {
    modelsPayload = { ok: false, models: [], error: listError instanceof Error ? listError.message : String(listError) };
  }

  const resolvedImageModel = String(imageModel || image_model || "").trim();
  const imageModels = modelsPayload?.ok ? deriveImageModelIdsFromModels(providerId, modelsPayload.models) : [];

  return {
    ok: true,
    provider: providerId,
    latencyMs: result?.llm?.latencyMs ?? Number((performance.now() - started).toFixed(3)),
    model: result?.llm?.model ?? model,
    inputTokens: result?.llm?.inputTokens ?? null,
    outputTokens: result?.llm?.outputTokens ?? null,
    totalTokens: result?.llm?.totalTokens ?? null,
    sample: result?.recipe ?? null,
    models: modelsPayload?.ok ? (modelsPayload.models ?? []) : [],
    models_error: modelsPayload && !modelsPayload.ok ? String(modelsPayload.error ?? "Unable to list models") : null,
    suggested_model: modelsPayload?.ok
      ? (suggestModelFromList(providerId, modelsPayload.models, result?.llm?.model ?? model) || null)
      : null,
    image_models: imageModels,
    image_models_error: modelsPayload && !modelsPayload.ok ? String(modelsPayload.error ?? "Unable to list models") : null,
    suggested_image_model: modelsPayload?.ok ? (suggestImageModelFromList(providerId, imageModels, resolvedImageModel) || null) : null
  };
}

// ----- recipe entry points -----------------------------------------------
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
