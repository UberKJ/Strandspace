import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

import {
  addRecipeToMealPlan,
  addShoppingListItem,
  checkShoppingListItem,
  createWeeklyMealPlan,
  createShoppingList,
  createLocalUser,
  createRecipeSharePackage,
  getDiabeticProviderSetting,
  listDiabeticProviderSettings,
  deleteShoppingListItem,
  exportDiabeticBackup,
  generateShoppingListFromMealPlan,
  generateShoppingListFromRecipes,
  getMealPlanByWeek,
  recallDiabeticRecipe,
  getWeeklyMealPlan,
  getShoppingList,
  getLocalUser,
  getUserSetting,
  listLocalUsers,
  listUserSettings,
  importDiabeticBackup,
  listMealPlans,
  saveDiabeticRecipe,
  listDiabeticRecipes,
  listFavoriteDiabeticRecipes,
  listShoppingLists,
  getDiabeticRecipeById,
  removeMealPlanItem,
  rateDiabeticRecipe,
  searchDiabeticRecipes,
  setRecipeShareStatus,
  setUserSetting,
  setDiabeticRecipeFavorite,
  setDiabeticRecipeImage,
  saveDiabeticBuilderSession,
  getDiabeticBuilderSession,
  deleteDiabeticBuilderSession,
  updateMealPlanItem,
  updateShoppingListItem,
  importRecipeSharePackage,
  setDiabeticProviderSetting,
  verifyLocalPin
} from "../strandspace/diabeticspace.js";

import {
  adaptDiabeticRecipe,
  generateDiabeticRecipe,
  generateFromBuilderSession,
  generateDiabeticRecipeImageToFile,
  getOpenAiCompatiblePresets,
  resolveOpenAiApiKeyFromEnv,
  testProviderConnection
} from "../strandspace/diabetic-assist.js";

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------
// Single source of truth for what each provider supports, what env vars feed
// it, and which DB keys it persists. Adding a new LLM = adding an entry here
// (and, if it's not OpenAI-compatible, a runner in strandspace/diabetic-assist.js).
// ---------------------------------------------------------------------------
const _COMPAT_PRESETS = getOpenAiCompatiblePresets();

const PROVIDER_CATALOG = {
  openai: {
    label: "OpenAI (Responses)",
    supports: { text: true, image: true },
    fields: { api_key: true, base_url: false, model: true, image_model: true },
    env: { api_key: ["OPENAI_API_KEY"], model: ["DIABETICSPACE_OPENAI_MODEL", "OPENAI_MODEL"], image_model: ["DIABETICSPACE_IMAGE_MODEL"] },
    defaults: {}
  },
  openai_chat: {
    label: "OpenAI-compatible (Chat)",
    supports: { text: true, image: false },
    fields: { api_key: true, base_url: true, model: true, image_model: false },
    env: { api_key: ["OPENAI_API_KEY"], model: ["DIABETICSPACE_OPENAI_CHAT_MODEL"], base_url: ["DIABETICSPACE_OPENAI_CHAT_BASE_URL"] },
    defaults: {}
  },
  ollama: {
    label: "Ollama (local)",
    supports: { text: true, image: false },
    fields: { api_key: false, base_url: true, model: true, image_model: false },
    env: { model: ["DIABETICSPACE_OLLAMA_MODEL"], base_url: ["DIABETICSPACE_OLLAMA_BASE_URL"] },
    defaults: { base_url: "http://localhost:11434", model: "llama3.1" }
  },
  anthropic: {
    label: "Anthropic (Claude)",
    supports: { text: true, image: false },
    fields: { api_key: true, base_url: true, model: true, image_model: false },
    env: { api_key: ["ANTHROPIC_API_KEY"], model: ["ANTHROPIC_MODEL"], base_url: ["ANTHROPIC_BASE_URL"] },
    defaults: { model: "claude-sonnet-4-6" }
  },
  gemini: {
    label: "Google Gemini",
    supports: { text: true, image: false },
    fields: { api_key: true, base_url: true, model: true, image_model: false },
    env: { api_key: ["GOOGLE_API_KEY", "GEMINI_API_KEY"], model: ["GEMINI_MODEL"], base_url: ["GEMINI_BASE_URL"] },
    defaults: { model: "gemini-1.5-flash" }
  },
  none: {
    label: "Disabled",
    supports: { text: false, image: false },
    fields: { api_key: false, base_url: false, model: false, image_model: false },
    env: {},
    defaults: {}
  }
};

// Add OpenAI-compatible vendors (Mistral, Groq, xAI, Together, OpenRouter, DeepSeek, Custom).
for (const [providerId, preset] of Object.entries(_COMPAT_PRESETS)) {
  const upper = providerId.toUpperCase();
  PROVIDER_CATALOG[providerId] = {
    label: preset.label,
    supports: { text: true, image: false },
    fields: { api_key: true, base_url: true, model: true, image_model: false },
    env: {
      api_key: [`DIABETICSPACE_${upper}_API_KEY`, `${upper}_API_KEY`],
      model: [`DIABETICSPACE_${upper}_MODEL`, `${upper}_MODEL`],
      base_url: [`DIABETICSPACE_${upper}_BASE_URL`, `${upper}_BASE_URL`]
    },
    defaults: {
      base_url: preset.baseUrl || "",
      model: preset.defaultModel || ""
    }
  };
}

function isKnownProvider(providerId) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_CATALOG, String(providerId ?? "").toLowerCase());
}

function listKnownProviders() {
  return Object.entries(PROVIDER_CATALOG).map(([id, def]) => ({
    id,
    label: def.label,
    supports: { ...def.supports },
    fields: { ...def.fields },
    defaults: { ...def.defaults }
  }));
}

function readEnvFirst(names = []) {
  for (const name of names) {
    const value = String(process.env[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

// Active profile id (if profiles are in use, this overrides the per-provider
// active selection).
function getActiveProfileId(db) {
  const value = String(getDiabeticProviderSetting(db, "app", "active_profile_id", { includeSensitive: true }) ?? "").trim();
  return value || "";
}

function profileNamespace(profileId) {
  return `profile:${String(profileId ?? "").trim()}`;
}

function readProfileSetting(db, profileId, key, { sensitive = false } = {}) {
  return getDiabeticProviderSetting(db, profileNamespace(profileId), key, { includeSensitive: sensitive });
}

function listProfiles(db) {
  const all = listDiabeticProviderSettings(db, "app").filter((row) => row.key === "profile_index").map((row) => row.value);
  // profile_index is a JSON array of profile ids. Fall back to scanning if missing.
  let ids = [];
  if (all.length) {
    try {
      const parsed = JSON.parse(String(all[0] ?? "[]"));
      if (Array.isArray(parsed)) ids = parsed.map((id) => String(id ?? "").trim()).filter(Boolean);
    } catch {
      ids = [];
    }
  }
  return ids.map((profileId) => ({
    profile_id: profileId,
    label: String(readProfileSetting(db, profileId, "label") ?? "").trim() || profileId,
    provider_id: String(readProfileSetting(db, profileId, "provider_id") ?? "").trim() || "openai",
    base_url: String(readProfileSetting(db, profileId, "base_url") ?? "").trim(),
    model: String(readProfileSetting(db, profileId, "model") ?? "").trim(),
    image_model: String(readProfileSetting(db, profileId, "image_model") ?? "").trim(),
    has_api_key: Boolean(String(readProfileSetting(db, profileId, "api_key", { sensitive: true }) ?? "").trim())
  }));
}

function writeProfileIndex(db, ids) {
  setDiabeticProviderSetting(db, "app", "profile_index", JSON.stringify(ids));
}

function generateProfileId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createOrUpdateProfile(db, { profile_id = "", label = "", provider_id = "", base_url = "", model = "", image_model = "", api_key = "" } = {}) {
  const cleanProvider = String(provider_id ?? "").trim().toLowerCase();
  if (!cleanProvider || !isKnownProvider(cleanProvider)) {
    const err = new Error(`Unknown provider: ${cleanProvider || "(empty)"}`);
    err.code = "UNKNOWN_PROVIDER";
    throw err;
  }
  const cleanLabel = String(label ?? "").trim();
  if (!cleanLabel) {
    const err = new Error("Profile label is required");
    err.code = "LABEL_REQUIRED";
    throw err;
  }

  let id = String(profile_id ?? "").trim();
  const existing = listProfiles(db);
  const existingIds = existing.map((p) => p.profile_id);
  if (!id) id = generateProfileId();

  setDiabeticProviderSetting(db, profileNamespace(id), "label", cleanLabel);
  setDiabeticProviderSetting(db, profileNamespace(id), "provider_id", cleanProvider);
  setDiabeticProviderSetting(db, profileNamespace(id), "base_url", String(base_url ?? "").trim());
  setDiabeticProviderSetting(db, profileNamespace(id), "model", String(model ?? "").trim());
  setDiabeticProviderSetting(db, profileNamespace(id), "image_model", String(image_model ?? "").trim());
  // api_key is sensitive but explicitly settable here (set "" to clear).
  setDiabeticProviderSetting(db, profileNamespace(id), "api_key", String(api_key ?? "").trim());

  if (!existingIds.includes(id)) {
    writeProfileIndex(db, [...existingIds, id]);
  }
  return id;
}

function deleteProfile(db, profileId) {
  const id = String(profileId ?? "").trim();
  if (!id) return false;
  const ns = profileNamespace(id);
  for (const key of ["label", "provider_id", "base_url", "model", "image_model", "api_key"]) {
    setDiabeticProviderSetting(db, ns, key, ""); // empty value deletes the row
  }
  const remaining = listProfiles(db).filter((p) => p.profile_id !== id).map((p) => p.profile_id);
  writeProfileIndex(db, remaining);
  if (getActiveProfileId(db) === id) {
    setDiabeticProviderSetting(db, "app", "active_profile_id", "");
  }
  return true;
}

function setActiveProfile(db, profileId) {
  const id = String(profileId ?? "").trim();
  if (id) {
    const exists = listProfiles(db).some((p) => p.profile_id === id);
    if (!exists) {
      const err = new Error(`Unknown profile: ${id}`);
      err.code = "UNKNOWN_PROFILE";
      throw err;
    }
  }
  setDiabeticProviderSetting(db, "app", "active_profile_id", id);
}

// Resolve effective config for a given provider, merging env > saved > default.
function resolveProviderOverrides(db, providerId) {
  const def = PROVIDER_CATALOG[providerId];
  if (!def) {
    return { apiKey: "", model: "", baseUrl: "", imageModel: "", meta: { env: {}, saved: {} } };
  }

  const envApiKey = def.fields.api_key ? readEnvFirst(def.env.api_key ?? []) : "";
  const envModel = def.fields.model ? readEnvFirst(def.env.model ?? []) : "";
  const envBaseUrl = def.fields.base_url ? readEnvFirst(def.env.base_url ?? []) : "";
  const envImageModel = def.fields.image_model ? readEnvFirst(def.env.image_model ?? []) : "";

  const savedApiKeyRaw = def.fields.api_key ? String(getDiabeticProviderSetting(db, providerId, "api_key", { includeSensitive: true }) ?? "").trim() : "";
  const savedModelRaw = def.fields.model ? String(getDiabeticProviderSetting(db, providerId, "model", { includeSensitive: true }) ?? "").trim() : "";
  const savedBaseUrlRaw = def.fields.base_url ? String(getDiabeticProviderSetting(db, providerId, "base_url", { includeSensitive: true }) ?? "").trim() : "";
  const savedImageModelRaw = def.fields.image_model ? String(getDiabeticProviderSetting(db, providerId, "image_model", { includeSensitive: true }) ?? "").trim() : "";

  // Env wins. Otherwise saved. Otherwise the runner-side defaults handle it.
  const runnerReadsEnvApiKey = providerId === "openai" || providerId === "openai_chat" || providerId === "anthropic" || providerId === "gemini";
  const apiKey = envApiKey
    ? (runnerReadsEnvApiKey ? "" : envApiKey)
    : savedApiKeyRaw;
  const model = envModel || savedModelRaw || def.defaults.model || "";
  const baseUrl = envBaseUrl || savedBaseUrlRaw || def.defaults.base_url || "";
  const imageModel = envImageModel || savedImageModelRaw || "";

  return {
    apiKey,
    model,
    baseUrl,
    imageModel,
    meta: {
      env: {
        api_key: Boolean(envApiKey),
        model: envModel || null,
        base_url: envBaseUrl || null,
        image_model: envImageModel || null
      },
      saved: {
        api_key: Boolean(savedApiKeyRaw),
        model: Boolean(savedModelRaw),
        base_url: Boolean(savedBaseUrlRaw),
        image_model: Boolean(savedImageModelRaw)
      },
      defaults: { ...def.defaults }
    }
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(res, allowedMethod) {
  res.writeHead(405, { Allow: allowedMethod });
  res.end();
}

function requireMethod(req, res, method) {
  if (req.method !== method) {
    sendMethodNotAllowed(res, method);
    return false;
  }
  return true;
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

// Legacy helper: kept only for the image pipeline which still calls it directly.
function resolveOpenAiOverrides(db) {
  const envApiKey = resolveOpenAiApiKeyFromEnv();
  const storedApiKey = getDiabeticProviderSetting(db, "openai", "api_key", { includeSensitive: true });
  const apiKey = envApiKey ? "" : String(storedApiKey ?? "").trim();

  const envModel = String(process.env.DIABETICSPACE_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "").trim();
  const storedModel = getDiabeticProviderSetting(db, "openai", "model", { includeSensitive: true });
  const model = envModel ? "" : String(storedModel ?? "").trim();

  const envImageModel = String(process.env.DIABETICSPACE_IMAGE_MODEL ?? "").trim();
  const storedImageModel = getDiabeticProviderSetting(db, "openai", "image_model", { includeSensitive: true });
  const imageModel = envImageModel ? "" : String(storedImageModel ?? "").trim();

  return {
    apiKey,
    model,
    imageModel,
    meta: {
      env: {
        api_key: Boolean(envApiKey),
        model: envModel || null,
        image_model: envImageModel || null
      },
      saved: {
        api_key: Boolean(String(storedApiKey ?? "").trim()),
        model: Boolean(String(storedModel ?? "").trim()),
        image_model: Boolean(String(storedImageModel ?? "").trim())
      }
    }
  };
}

const DEFAULT_TEXT_PROVIDER = "openai";
const DEFAULT_IMAGE_PROVIDER = "openai";

function normalizeProviderId(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || fallback;
}

function resolveActiveProviderId(db, kind) {
  const envKey = kind === "image" ? "DIABETICSPACE_IMAGE_PROVIDER" : "DIABETICSPACE_TEXT_PROVIDER";
  const envValue = normalizeProviderId(process.env[envKey], "");
  const savedKey = kind === "image" ? "active_image_provider" : "active_text_provider";
  const savedValue = normalizeProviderId(getDiabeticProviderSetting(db, "app", savedKey, { includeSensitive: true }), "");

  const candidate = envValue || savedValue || (kind === "image" ? DEFAULT_IMAGE_PROVIDER : DEFAULT_TEXT_PROVIDER);

  if (kind === "image") {
    return candidate === "none" ? "none" : "openai";
  }

  if (isKnownProvider(candidate)) return candidate;
  return DEFAULT_TEXT_PROVIDER;
}

function resolveOpenAiChatOverrides(db) {
  const envApiKey = resolveOpenAiApiKeyFromEnv();
  const storedApiKey = getDiabeticProviderSetting(db, "openai_chat", "api_key", { includeSensitive: true });
  const apiKey = envApiKey ? "" : String(storedApiKey ?? "").trim();

  const envModel = String(process.env.DIABETICSPACE_OPENAI_CHAT_MODEL ?? "").trim();
  const storedModel = getDiabeticProviderSetting(db, "openai_chat", "model", { includeSensitive: true });
  const model = envModel || String(storedModel ?? "").trim();

  const envBaseUrl = String(process.env.DIABETICSPACE_OPENAI_CHAT_BASE_URL ?? "").trim();
  const storedBaseUrl = getDiabeticProviderSetting(db, "openai_chat", "base_url", { includeSensitive: true });
  const baseUrl = envBaseUrl || String(storedBaseUrl ?? "").trim();

  return {
    apiKey,
    model,
    baseUrl,
    meta: {
      env: {
        api_key: Boolean(envApiKey),
        model: envModel || null,
        base_url: envBaseUrl || null
      },
      saved: {
        api_key: Boolean(String(storedApiKey ?? "").trim()),
        model: Boolean(String(storedModel ?? "").trim()),
        base_url: Boolean(String(storedBaseUrl ?? "").trim())
      }
    }
  };
}

function resolveOllamaOverrides(db) {
  const envModel = String(process.env.DIABETICSPACE_OLLAMA_MODEL ?? "").trim();
  const storedModel = getDiabeticProviderSetting(db, "ollama", "model", { includeSensitive: true });
  const model = envModel || String(storedModel ?? "").trim();

  const envBaseUrl = String(process.env.DIABETICSPACE_OLLAMA_BASE_URL ?? "").trim();
  const storedBaseUrl = getDiabeticProviderSetting(db, "ollama", "base_url", { includeSensitive: true });
  const baseUrl = envBaseUrl || String(storedBaseUrl ?? "").trim();

  return {
    model,
    baseUrl,
    meta: {
      env: {
        model: envModel || null,
        base_url: envBaseUrl || null
      },
      saved: {
        model: Boolean(String(storedModel ?? "").trim()),
        base_url: Boolean(String(storedBaseUrl ?? "").trim())
      }
    }
  };
}

function resolveTextProviderConfig(db) {
  // If an active named profile is set, it overrides the per-provider default.
  const activeProfileId = getActiveProfileId(db);
  if (activeProfileId) {
    const profile = listProfiles(db).find((p) => p.profile_id === activeProfileId) ?? null;
    if (profile) {
      const def = PROVIDER_CATALOG[profile.provider_id] ?? PROVIDER_CATALOG.openai;
      const envApiKey = def.fields.api_key ? readEnvFirst(def.env.api_key ?? []) : "";
      const envModel = def.fields.model ? readEnvFirst(def.env.model ?? []) : "";
      const envBaseUrl = def.fields.base_url ? readEnvFirst(def.env.base_url ?? []) : "";
      const profileApiKey = String(readProfileSetting(db, profile.profile_id, "api_key", { sensitive: true }) ?? "").trim();
      return {
        provider_id: profile.provider_id,
        // Env wins for API keys; otherwise use the profile's saved key.
        apiKey: envApiKey ? "" : profileApiKey,
        model: envModel || profile.model || def.defaults.model || "",
        baseUrl: envBaseUrl || profile.base_url || def.defaults.base_url || "",
        meta: {
          env: { api_key: Boolean(envApiKey), model: envModel || null, base_url: envBaseUrl || null },
          saved: { api_key: Boolean(profileApiKey), model: Boolean(profile.model), base_url: Boolean(profile.base_url) },
          profile: { id: profile.profile_id, label: profile.label }
        }
      };
    }
  }

  const provider_id = resolveActiveProviderId(db, "text");
  if (provider_id === "none") {
    return { provider_id: "none", apiKey: "", model: "", baseUrl: "", meta: { env: {}, saved: {} } };
  }
  const overrides = resolveProviderOverrides(db, provider_id);
  return {
    provider_id,
    apiKey: overrides.apiKey,
    model: overrides.model,
    baseUrl: overrides.baseUrl,
    meta: overrides.meta
  };
}

function resolveImageProviderConfig(db) {
  const provider_id = resolveActiveProviderId(db, "image");
  if (provider_id !== "openai") {
    return { provider_id: "none" };
  }
  const openai = resolveOpenAiOverrides(db);
  return {
    provider_id: "openai",
    apiKey: openai.apiKey,
    model: openai.imageModel,
    meta: openai.meta
  };
}

async function ensureDiabeticRecipeImage(db, recipe, dataDir) {
  if (!recipe) {
    return { recipe: null, image: null };
  }

  if (recipe.image_url) {
    return { recipe, image: null };
  }

  const outputDir = String(process.env.DIABETICSPACE_IMAGE_DIR ?? "").trim() || join(dataDir, "diabetic-images");

  try {
    const provider = resolveImageProviderConfig(db);
    if (provider.provider_id !== "openai") {
      return { recipe, image: null };
    }
    const result = await generateDiabeticRecipeImageToFile(recipe, { outputDir, apiKey: provider.apiKey, model: provider.model || undefined });
    if (result?.image_url) {
      const updated = setDiabeticRecipeImage(db, recipe.recipe_id, result.image_url) ?? recipe;
      return {
        recipe: updated,
        image: {
          provider: provider.provider_id,
          model: result.model ?? null,
          latencyMs: result.latencyMs ?? null,
          imageUrl: result.image_url
        }
      };
    }
  } catch (error) {
    if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
      return { recipe, image: null };
    }
  }

  return { recipe, image: null };
}

function sanitizeRecipeImageBasename(value) {
  const safe = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return safe || `recipe-${Date.now().toString(36)}`;
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl ?? "").trim();
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = String(match[1] ?? "").trim().toLowerCase();
  const b64 = String(match[2] ?? "").trim();
  if (!contentType || !b64) return null;
  return { contentType, b64 };
}

export async function handleDiabeticApiRoutes(req, res, url, db, { dataDir } = {}) {
  if (!url?.pathname?.startsWith("/api/diabetic/")) {
    return false;
  }

  const resolvedDataDir = String(dataDir ?? "").trim();
  if (!resolvedDataDir) {
    sendJson(res, 500, { error: "Server misconfigured (dataDir missing)" });
    return true;
  }

  if (url.pathname === "/api/diabetic/recipes") {
    if (!requireMethod(req, res, "GET")) return true;

    const mealType = String(url.searchParams.get("meal_type") ?? "").trim();
    sendJson(res, 200, {
      ok: true,
      recipes: listDiabeticRecipes(db, mealType)
    });
    return true;
  }

  if (url.pathname === "/api/diabetic/favorites") {
    if (!requireMethod(req, res, "GET")) return true;

    const mealType = String(url.searchParams.get("meal_type") ?? "").trim();
    sendJson(res, 200, {
      ok: true,
      recipes: listFavoriteDiabeticRecipes(db, mealType)
    });
    return true;
  }

  if (url.pathname === "/api/diabetic/recipe") {
    if (!requireMethod(req, res, "GET")) return true;

    const recipeId = String(url.searchParams.get("recipe_id") ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return true;
    }

    const recipe = getDiabeticRecipeById(db, recipeId);
    if (!recipe) {
      sendJson(res, 404, { error: "Recipe not found" });
      return true;
    }

    sendJson(res, 200, { ok: true, recipe });
    return true;
  }

  if (url.pathname === "/api/diabetic/meal-plans") {
    if (!requireMethod(req, res, "GET")) return true;
    sendJson(res, 200, { ok: true, plans: listMealPlans(db) });
    return true;
  }

  if (url.pathname === "/api/diabetic/meal-plan") {
    if (!requireMethod(req, res, "GET")) return true;
    const planId = String(url.searchParams.get("plan_id") ?? "").trim();
    if (!planId) {
      sendJson(res, 400, { error: "plan_id is required" });
      return true;
    }
    const plan = getWeeklyMealPlan(db, planId);
    if (!plan) {
      sendJson(res, 404, { error: "Meal plan not found" });
      return true;
    }
    sendJson(res, 200, { ok: true, plan });
    return true;
  }

  if (url.pathname === "/api/diabetic/meal-plan/week") {
    if (!requireMethod(req, res, "GET")) return true;
    const weekStart = String(url.searchParams.get("week_start") ?? "").trim();
    if (!weekStart) {
      sendJson(res, 400, { error: "week_start is required" });
      return true;
    }
    const plan = getMealPlanByWeek(db, weekStart);
    if (!plan) {
      sendJson(res, 404, { error: "Meal plan not found" });
      return true;
    }
    sendJson(res, 200, { ok: true, plan });
    return true;
  }

  if (url.pathname === "/api/diabetic/meal-plan/create") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    try {
      const plan = createWeeklyMealPlan(db, payload);
      sendJson(res, 200, { ok: true, plan });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/meal-plan/add") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    try {
      const item = addRecipeToMealPlan(db, payload);
      sendJson(res, 200, { ok: true, item });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/meal-plan/remove") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const itemId = payload.item_id ?? payload.itemId ?? payload.id;
    const removed = removeMealPlanItem(db, itemId);
    sendJson(res, 200, { ok: true, removed });
    return true;
  }

  if (url.pathname === "/api/diabetic/meal-plan/update") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const itemId = payload.item_id ?? payload.itemId ?? payload.id;
    try {
      const item = updateMealPlanItem(db, itemId, payload.updates ?? payload.update ?? {});
      sendJson(res, 200, { ok: true, item });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/shopping-lists") {
    if (!requireMethod(req, res, "GET")) return true;
    sendJson(res, 200, { ok: true, lists: listShoppingLists(db) });
    return true;
  }

  if (url.pathname === "/api/diabetic/shopping-list") {
    if (!requireMethod(req, res, "GET")) return true;
    const listId = String(url.searchParams.get("list_id") ?? "").trim();
    if (!listId) {
      sendJson(res, 400, { error: "list_id is required" });
      return true;
    }
    const list = getShoppingList(db, listId);
    if (!list) {
      sendJson(res, 404, { error: "Shopping list not found" });
      return true;
    }
    sendJson(res, 200, { ok: true, list });
    return true;
  }

  if (url.pathname === "/api/diabetic/shopping-list/create") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    try {
      const list = createShoppingList(db, payload);
      sendJson(res, 200, { ok: true, list });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/shopping-list/from-meal-plan") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const planId = String(payload.plan_id ?? payload.planId ?? "").trim();
    if (!planId) {
      sendJson(res, 400, { error: "plan_id is required" });
      return true;
    }
    try {
      const list = generateShoppingListFromMealPlan(db, planId);
      sendJson(res, 200, { ok: true, list });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/shopping-list/from-recipes") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const recipeIds = Array.isArray(payload.recipe_ids) ? payload.recipe_ids : (Array.isArray(payload.recipeIds) ? payload.recipeIds : []);
    try {
      const list = generateShoppingListFromRecipes(db, recipeIds, payload);
      sendJson(res, 200, { ok: true, list });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/shopping-list/item/add") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const listId = String(payload.list_id ?? payload.listId ?? "").trim();
    if (!listId) {
      sendJson(res, 400, { error: "list_id is required" });
      return true;
    }
    try {
      const item = addShoppingListItem(db, listId, payload.item ?? payload);
      sendJson(res, 200, { ok: true, item });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/shopping-list/item/update") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const itemId = payload.item_id ?? payload.itemId ?? payload.id;
    try {
      const item = updateShoppingListItem(db, itemId, payload.updates ?? payload.update ?? payload);
      sendJson(res, 200, { ok: true, item });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/shopping-list/item/check") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const itemId = payload.item_id ?? payload.itemId ?? payload.id;
    try {
      const item = checkShoppingListItem(db, itemId, payload.checked);
      sendJson(res, 200, { ok: true, item });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/shopping-list/item/delete") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const itemId = payload.item_id ?? payload.itemId ?? payload.id;
    const deleted = deleteShoppingListItem(db, itemId);
    sendJson(res, 200, { ok: true, deleted });
    return true;
  }

  if (url.pathname === "/api/diabetic/export") {
    if (!requireMethod(req, res, "GET")) return true;
    sendJson(res, 200, exportDiabeticBackup(db));
    return true;
  }

  if (url.pathname === "/api/diabetic/import") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const options = payload.options && typeof payload.options === "object" ? payload.options : payload;
    const overwrite = Boolean(options.overwrite);
    const dry_run = Boolean(options.dry_run ?? options.dryRun);
    const backup = payload.backup && typeof payload.backup === "object" ? payload.backup : payload;

    try {
      const summary = importDiabeticBackup(db, backup, { overwrite, dry_run });
      sendJson(res, 200, { ok: true, summary });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/provider-settings") {
    if (req.method === "GET") {
      const providerId = String(url.searchParams.get("provider_id") ?? "").trim();
      if (!providerId) {
        sendJson(res, 400, { error: "provider_id is required" });
        return true;
      }

      try {
        const rows = listDiabeticProviderSettings(db, providerId);
        const byKey = new Map(rows.map((row) => [row.key, row]));

        const def = PROVIDER_CATALOG[providerId];
        const knownKeys = def
          ? Object.entries(def.fields).filter(([, on]) => on).map(([k]) => k)
          : providerId === "app"
            ? ["active_text_provider", "active_image_provider", "active_profile_id", "profile_index"]
            : [];
        for (const key of knownKeys) {
          if (byKey.has(key)) continue;
          const sensitive = key.includes("key") || key.includes("token") || key.includes("secret") || key.includes("password");
          byKey.set(key, {
            provider_id: providerId,
            key,
            sensitive,
            has_value: false,
            value: null,
            updated_at: null
          });
        }

        const settings = Array.from(byKey.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
        const meta = def
          ? resolveProviderOverrides(db, providerId).meta
          : { env: {}, saved: {} };
        sendJson(res, 200, { ok: true, provider_id: providerId, settings, meta });
        return true;
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        return true;
      }
    }

    if (req.method === "POST") {
      let payload = {};
      try {
        payload = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      const providerId = String(payload.provider_id ?? payload.providerId ?? "").trim();
      const key = String(payload.key ?? "").trim();
      const value = payload.value ?? null;
      if (!providerId) {
        sendJson(res, 400, { error: "provider_id is required" });
        return true;
      }
      if (!key) {
        sendJson(res, 400, { error: "key is required" });
        return true;
      }

      try {
        const setting = setDiabeticProviderSetting(db, providerId, key, value);
        sendJson(res, 200, { ok: true, setting });
        return true;
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        return true;
      }
    }

    sendMethodNotAllowed(res, "GET, POST");
    return true;
  }

  // ---- Provider catalog ---------------------------------------------------
  // Lists every provider the server knows about, with the field schema and
  // env-var hints. The frontend uses this to render its provider picker
  // dynamically — adding a provider on the server side is enough to surface
  // it in the UI.
  if (url.pathname === "/api/diabetic/provider-catalog") {
    if (!requireMethod(req, res, "GET")) return true;
    sendJson(res, 200, { ok: true, providers: listKnownProviders() });
    return true;
  }

  // ---- Profiles -----------------------------------------------------------
  // Named LLM configurations the user can save and switch between. Stored on
  // top of the existing KV settings table under provider_id="profile:<id>".
  if (url.pathname === "/api/diabetic/profiles") {
    if (req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        profiles: listProfiles(db),
        active_profile_id: getActiveProfileId(db) || null
      });
      return true;
    }
    if (req.method === "POST") {
      let payload = {};
      try { payload = await readJsonBody(req); } catch { sendJson(res, 400, { error: "Invalid JSON body" }); return true; }
      try {
        const id = createOrUpdateProfile(db, payload);
        if (payload.set_active) setActiveProfile(db, id);
        sendJson(res, 200, { ok: true, profile_id: id });
        return true;
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), code: error?.code ?? null });
        return true;
      }
    }
    if (req.method === "DELETE") {
      const profileId = String(url.searchParams.get("profile_id") ?? "").trim();
      if (!profileId) { sendJson(res, 400, { error: "profile_id is required" }); return true; }
      deleteProfile(db, profileId);
      sendJson(res, 200, { ok: true, deleted: profileId });
      return true;
    }
    sendMethodNotAllowed(res, "GET, POST, DELETE");
    return true;
  }

  if (url.pathname === "/api/diabetic/profiles/active") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try { payload = await readJsonBody(req); } catch { sendJson(res, 400, { error: "Invalid JSON body" }); return true; }
    try {
      setActiveProfile(db, payload.profile_id ?? "");
      sendJson(res, 200, { ok: true, active_profile_id: getActiveProfileId(db) || null });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), code: error?.code ?? null });
      return true;
    }
  }

  // ---- Test connection ----------------------------------------------------
  // Fires a tiny JSON-only request against the configured provider/model and
  // returns latency + error so the user can verify a key/model before relying
  // on it. Accepts either { profile_id } or an explicit { provider_id, ... }
  // override (used when the user is editing a draft they haven't saved yet).
  if (url.pathname === "/api/diabetic/provider-test") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try { payload = await readJsonBody(req); } catch { sendJson(res, 400, { error: "Invalid JSON body" }); return true; }

    let providerId = String(payload.provider_id ?? "").trim().toLowerCase();
    let apiKey = String(payload.api_key ?? "").trim();
    let model = String(payload.model ?? "").trim();
    let baseUrl = String(payload.base_url ?? "").trim();

    if (payload.profile_id) {
      const profile = listProfiles(db).find((p) => p.profile_id === String(payload.profile_id).trim()) ?? null;
      if (!profile) { sendJson(res, 404, { error: "Profile not found" }); return true; }
      providerId = profile.provider_id;
      const savedKey = String(readProfileSetting(db, profile.profile_id, "api_key", { sensitive: true }) ?? "").trim();
      if (!apiKey) apiKey = savedKey;
      if (!model) model = profile.model;
      if (!baseUrl) baseUrl = profile.base_url;
    } else if (!providerId) {
      // Fall through to whatever resolveTextProviderConfig says is active.
      const cfg = resolveTextProviderConfig(db);
      providerId = cfg.provider_id;
      if (!apiKey) apiKey = cfg.apiKey;
      if (!model) model = cfg.model;
      if (!baseUrl) baseUrl = cfg.baseUrl;
    }

    if (!isKnownProvider(providerId)) {
      sendJson(res, 400, { error: `Unknown provider: ${providerId || "(empty)"}` });
      return true;
    }
    if (providerId === "none") {
      sendJson(res, 400, { error: "AI is disabled. Pick a provider first." });
      return true;
    }

    // If the editor didn't supply an api_key, fall back to the saved one for
    // that provider (env vars are read inside the runner regardless).
    const def = PROVIDER_CATALOG[providerId];
    const overrides = def ? resolveProviderOverrides(db, providerId) : null;
    if (def?.fields?.api_key && !apiKey) {
      apiKey = String(overrides?.apiKey ?? "").trim();
    }
    if (def?.fields?.model && !model) {
      model = String(overrides?.model ?? "").trim();
    }
    if (def?.fields?.base_url && !baseUrl) {
      baseUrl = String(overrides?.baseUrl ?? "").trim();
    }

    const result = await testProviderConnection({ provider: providerId, apiKey, model, baseUrl });
    sendJson(res, result.ok ? 200 : 502, result);
    return true;
  }

  if (url.pathname === "/api/diabetic/share/recipe") {
    if (!requireMethod(req, res, "GET")) return true;
    const recipeId = String(url.searchParams.get("recipe_id") ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return true;
    }

    try {
      const author_name = url.searchParams.get("author_name");
      const notes = url.searchParams.get("notes");
      const pkg = createRecipeSharePackage(db, recipeId, { author_name, notes });
      sendJson(res, 200, { ok: true, package: pkg });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/share/status") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const recipeId = String(payload.recipe_id ?? payload.recipeId ?? "").trim();
    const status = payload.status ?? payload.share_status ?? payload.shareStatus ?? "";
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return true;
    }

    try {
      const recipe = setRecipeShareStatus(db, recipeId, status);
      sendJson(res, 200, { ok: true, recipe });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/share/import") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const overwrite = Boolean(payload.overwrite);
    const packageJson = payload.packageJson ?? payload.package ?? payload;

    try {
      const result = importRecipeSharePackage(db, packageJson, { overwrite });
      sendJson(res, 200, { ok: true, ...result });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/users") {
    if (!requireMethod(req, res, "GET")) return true;
    sendJson(res, 200, { ok: true, users: listLocalUsers(db) });
    return true;
  }

  if (url.pathname === "/api/diabetic/user/create") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    try {
      const user = createLocalUser(db, {
        display_name: payload.display_name ?? payload.displayName ?? "",
        pin: payload.pin ?? null
      });
      sendJson(res, 200, { ok: true, user });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/user/verify-pin") {
    if (!requireMethod(req, res, "POST")) return true;
    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    try {
      const userId = String(payload.user_id ?? payload.userId ?? "").trim();
      const verified = verifyLocalPin(db, userId, payload.pin ?? "");
      sendJson(res, 200, { ok: true, user_id: userId, verified });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/settings") {
    if (req.method === "GET") {
      const userId = String(url.searchParams.get("user_id") ?? "").trim();
      if (!userId) {
        sendJson(res, 400, { error: "user_id is required" });
        return true;
      }

      const user = getLocalUser(db, userId);
      if (!user) {
        sendJson(res, 404, { error: "User not found" });
        return true;
      }

      const key = String(url.searchParams.get("key") ?? "").trim();
      if (key) {
        sendJson(res, 200, { ok: true, user_id: userId, key, value: getUserSetting(db, userId, key) });
        return true;
      }

      sendJson(res, 200, { ok: true, user_id: userId, settings: listUserSettings(db, userId) });
      return true;
    }

    if (req.method === "POST") {
      let payload = {};
      try {
        payload = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      try {
        const userId = String(payload.user_id ?? payload.userId ?? "").trim();
        const key = String(payload.key ?? "").trim();
        const value = setUserSetting(db, userId, key, payload.value);
        sendJson(res, 200, { ok: true, user_id: userId, key, value });
        return true;
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        return true;
      }
    }

    sendMethodNotAllowed(res, "GET, POST");
    return true;
  }

  if (url.pathname === "/api/diabetic/rate") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const recipeId = String(payload.recipe_id ?? payload.recipeId ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return true;
    }

    const recipe = getDiabeticRecipeById(db, recipeId);
    if (!recipe) {
      sendJson(res, 404, { error: "Recipe not found" });
      return true;
    }

    try {
      const updated = rateDiabeticRecipe(db, recipeId, payload.rating);
      sendJson(res, 200, { ok: true, recipe: updated });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/favorite") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const recipeId = String(payload.recipe_id ?? payload.recipeId ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return true;
    }

    const recipe = getDiabeticRecipeById(db, recipeId);
    if (!recipe) {
      sendJson(res, 404, { error: "Recipe not found" });
      return true;
    }

    try {
      const updated = setDiabeticRecipeFavorite(db, recipeId, payload.favorite);
      sendJson(res, 200, { ok: true, recipe: updated });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/ensure-image") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const recipeId = String(payload.recipe_id ?? payload.recipeId ?? "").trim();
    const force = Boolean(payload.force);
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return true;
    }

    const recipe = getDiabeticRecipeById(db, recipeId);
    if (!recipe) {
      sendJson(res, 404, { error: "Recipe not found" });
      return true;
    }

    if (recipe.image_url && !force) {
      sendJson(res, 200, {
        ok: true,
        created: false,
        recipe,
        metrics: {
          local: null,
          llm: null,
          image: null
        }
      });
      return true;
    }

    const outputDir = String(process.env.DIABETICSPACE_IMAGE_DIR ?? "").trim() || join(resolvedDataDir, "diabetic-images");
    const provider = resolveImageProviderConfig(db);
    if (provider.provider_id !== "openai") {
      sendJson(res, 503, { error: "Image provider disabled", route: "api_unavailable" });
      return true;
    }

    try {
      const result = await generateDiabeticRecipeImageToFile(recipe, { outputDir, force, apiKey: provider.apiKey, model: provider.model || undefined });
      const updated = setDiabeticRecipeImage(db, recipe.recipe_id, result.image_url) ?? recipe;
      sendJson(res, 200, {
        ok: true,
        created: true,
        recipe: updated,
        metrics: {
          local: null,
          llm: null,
          image: {
            provider: provider.provider_id,
            model: result.model ?? null,
            latencyMs: result.latencyMs ?? null,
            imageUrl: result.image_url
          }
        }
      });
      return true;
    } catch (error) {
      if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
        sendJson(res, 503, { error: "OPENAI_API_KEY not configured", route: "api_unavailable" });
        return true;
      }

      if (String(error?.code ?? "") === "IMAGE_TOO_LARGE") {
        sendJson(res, 413, { error: "Generated image exceeded the 1.8MB limit. Try uploading your own image instead.", route: "image_too_large" });
        return true;
      }

      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error), route: "image_failed" });
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/recipe-image/upload") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const recipeId = String(payload.recipe_id ?? payload.recipeId ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return true;
    }

    const recipe = getDiabeticRecipeById(db, recipeId);
    if (!recipe) {
      sendJson(res, 404, { error: "Recipe not found" });
      return true;
    }

    const parsed = parseDataUrl(payload.data_url ?? payload.dataUrl ?? "");
    if (!parsed) {
      sendJson(res, 400, { error: "data_url must be a base64 data URL" });
      return true;
    }

    const allowed = new Map([
      ["image/png", ".png"],
      ["image/jpeg", ".jpg"],
      ["image/webp", ".webp"]
    ]);
    const extension = allowed.get(parsed.contentType);
    if (!extension) {
      sendJson(res, 400, { error: "Unsupported image type. Use PNG, JPEG, or WEBP." });
      return true;
    }

    let bytes;
    try {
      bytes = Buffer.from(parsed.b64, "base64");
    } catch {
      sendJson(res, 400, { error: "Invalid base64 data" });
      return true;
    }

    if (!bytes?.length) {
      sendJson(res, 400, { error: "Image data was empty" });
      return true;
    }

    if (bytes.length > 1_800_000) {
      sendJson(res, 413, { error: "Image must be 1.8MB or smaller" });
      return true;
    }

    const outputDir = String(process.env.DIABETICSPACE_IMAGE_DIR ?? "").trim() || join(resolvedDataDir, "diabetic-images");
    await mkdir(outputDir, { recursive: true });

    const filename = `${sanitizeRecipeImageBasename(recipeId)}-upload${extension}`;
    const filePath = join(outputDir, filename);
    await writeFile(filePath, bytes);

    const updated = setDiabeticRecipeImage(db, recipeId, `diabetic-images/${filename}`) ?? recipe;
    sendJson(res, 200, { ok: true, recipe: updated, image_url: updated.image_url });
    return true;
  }

  if (url.pathname === "/api/diabetic/search") {
    if (!requireMethod(req, res, "GET")) return true;

    const query = String(url.searchParams.get("q") ?? "").trim();
    if (!query) {
      sendJson(res, 400, { error: "q is required" });
      return true;
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
    return true;
  }

  if (url.pathname === "/api/diabetic/search-create") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const query = String(payload.query ?? "").trim();
    const use_ai = Boolean(payload.use_ai);
    const mealType = String(payload.meal_type ?? "").trim();

    if (!query) {
      sendJson(res, 400, { error: "query is required" });
      return true;
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
      return true;
    }

    const bestMatchRecipe = matches.length ? getDiabeticRecipeById(db, matches[0].recipe_id) : null;

    try {
      const provider = resolveTextProviderConfig(db);
      const generated = await generateDiabeticRecipe(query, bestMatchRecipe, {
        provider: provider.provider_id,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl
      });
      let saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
      const ensured = await ensureDiabeticRecipeImage(db, saved, resolvedDataDir);
      saved = ensured.recipe;
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
          image: ensured.image ?? null
        }
      });
      return true;
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
        return true;
      }

      if (String(error?.code ?? "") === "LLM_DISABLED") {
        sendJson(res, 503, {
          error: "LLM provider disabled",
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
        return true;
      }

      if (String(error?.code ?? "") === "OLLAMA_UNAVAILABLE") {
        sendJson(res, 503, {
          error: "Ollama server not reachable",
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
        return true;
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
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/chat") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const message = String(payload.message ?? "").trim();
    if (!message) {
      sendJson(res, 400, { error: "message is required" });
      return true;
    }

    const started = performance.now();
    const recalled = recallDiabeticRecipe(db, message);
    const latency_ms = toLatencyMs(performance.now() - started);
    const provider = resolveTextProviderConfig(db);

    if (recalled) {
      const recall_count = Number(recalled.recall_count ?? 0);
      if (recall_count >= 2) {
        const ensured = await ensureDiabeticRecipeImage(db, recalled, resolvedDataDir);
        sendJson(res, 200, {
          route: "local_recall",
          recipe: ensured.recipe,
          recall_count,
          latency_ms,
          metrics: {
            local: {
              kind: "chat-recall",
              latencyMs: latency_ms
            },
            llm: null,
            image: ensured.image ?? null
          }
        });
        return true;
      }

      try {
        const generated = await generateDiabeticRecipe(message, recalled, {
          provider: provider.provider_id,
          apiKey: provider.apiKey,
          model: provider.model,
          baseUrl: provider.baseUrl
        });
        let saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
        const ensured = await ensureDiabeticRecipeImage(db, saved, resolvedDataDir);
        saved = ensured.recipe;
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
            image: ensured.image ?? null
          }
        });
        return true;
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
          return true;
        }

        if (String(error?.code ?? "") === "LLM_DISABLED") {
          sendJson(res, 503, {
            error: "LLM provider disabled",
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
          return true;
        }

        if (String(error?.code ?? "") === "OLLAMA_UNAVAILABLE") {
          sendJson(res, 503, {
            error: "Ollama server not reachable",
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
          return true;
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
        return true;
      }
    }

    try {
      const generated = await generateDiabeticRecipe(message, null, {
        provider: provider.provider_id,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl
      });
      let saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
      const ensured = await ensureDiabeticRecipeImage(db, saved, resolvedDataDir);
      saved = ensured.recipe;
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
          image: ensured.image ?? null
        }
      });
      return true;
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
        return true;
      }

      if (String(error?.code ?? "") === "LLM_DISABLED") {
        sendJson(res, 503, {
          error: "LLM provider disabled",
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
        return true;
      }

      if (String(error?.code ?? "") === "OLLAMA_UNAVAILABLE") {
        sendJson(res, 503, {
          error: "Ollama server not reachable",
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
        return true;
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
      return true;
    }
  }

  if (url.pathname === "/api/diabetic/save") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const localSave = measureSync(() => saveDiabeticRecipe(db, payload));
    let saved = localSave.result;
    const ensured = await ensureDiabeticRecipeImage(db, saved, resolvedDataDir);
    saved = ensured.recipe;
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
        image: ensured.image ?? null
      }
    });
    return true;
  }

  if (url.pathname === "/api/diabetic/adapt") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const recipeId = String(payload.recipe_id ?? "").trim();
    const change = String(payload.change ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return true;
    }
    if (!change) {
      sendJson(res, 400, { error: "change is required" });
      return true;
    }

    const original = getDiabeticRecipeById(db, recipeId);
    if (!original) {
      sendJson(res, 404, { error: "Recipe not found" });
      return true;
    }

    let adapted;
    let llm = null;
    try {
      const provider = resolveTextProviderConfig(db);
      const result = await adaptDiabeticRecipe(change, original, {
        provider: provider.provider_id,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl
      });
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
        return true;
      }
      if (String(error?.code ?? "") === "LLM_DISABLED") {
        sendJson(res, 503, {
          error: "LLM provider disabled",
          route: "api_unavailable",
          metrics: {
            local: null,
            llm: null,
            image: null
          }
        });
        return true;
      }
      if (String(error?.code ?? "") === "OLLAMA_UNAVAILABLE") {
        sendJson(res, 503, {
          error: "Ollama server not reachable",
          route: "api_unavailable",
          metrics: {
            local: null,
            llm: null,
            image: null
          }
        });
        return true;
      }
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }

    let candidateId = `${original.recipe_id}-adapted`;
    let suffix = 1;
    while (getDiabeticRecipeById(db, candidateId)) {
      suffix += 1;
      candidateId = `${original.recipe_id}-adapted-${suffix}`;
      if (suffix > 25) {
        sendJson(res, 409, { error: "Unable to allocate unique adapted recipe_id" });
        return true;
      }
    }

    let saved = saveDiabeticRecipe(db, { ...adapted, recipe_id: candidateId, source: "ai" });
    const ensured = await ensureDiabeticRecipeImage(db, saved, resolvedDataDir);
    saved = ensured.recipe;
    sendJson(res, 200, {
      route: "api_expand",
      recipe: saved,
      saved: true,
      metrics: {
        local: null,
        llm,
        image: ensured.image ?? null
      }
    });
    return true;
  }

  if (url.pathname === "/api/diabetic/builder/start") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
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
    return true;
  }

  if (url.pathname === "/api/diabetic/builder/next") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const session_id = String(payload.session_id ?? "").trim();
    const answer = String(payload.answer ?? "").trim();
    if (!session_id) {
      sendJson(res, 400, { error: "session_id is required" });
      return true;
    }
    if (!answer) {
      sendJson(res, 400, { error: "answer is required" });
      return true;
    }

    const session = getDiabeticBuilderSession(db, session_id);
    if (!session) {
      sendJson(res, 404, { error: "Session not found" });
      return true;
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
        return true;
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
          return true;
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
        return true;
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
      return true;
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
        return true;
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
      return true;
    }

    sendJson(res, 200, {
      session_id,
      stage: nextStage,
      prompt: promptsByStage[nextStage] ?? "Answer the next question.",
      session: saved
    });
    return true;
  }

  if (url.pathname === "/api/diabetic/builder/complete") {
    if (!requireMethod(req, res, "POST")) return true;

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const session_id = String(payload.session_id ?? "").trim();
    if (!session_id) {
      sendJson(res, 400, { error: "session_id is required" });
      return true;
    }

    const session = getDiabeticBuilderSession(db, session_id);
    if (!session) {
      sendJson(res, 404, { error: "Session not found" });
      return true;
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
    const provider = resolveTextProviderConfig(db);
    if (recalled) {
      const recall_count = Number(recalled.recall_count ?? 0);
      if (recall_count >= 2) {
        const ensured = await ensureDiabeticRecipeImage(db, recalled, resolvedDataDir);
        deleteDiabeticBuilderSession(db, session_id);
        sendJson(res, 200, {
          route: "local_recall",
          recipe: ensured.recipe,
          recall_count,
          session_id,
          completed: true,
          metrics: {
            local: {
              kind: "builder-recall",
              latencyMs: localRecall.latencyMs
            },
            llm: null,
            image: ensured.image ?? null
          }
        });
        return true;
      }

      try {
        const generated = await generateFromBuilderSession(session, recalled, {
          provider: provider.provider_id,
          apiKey: provider.apiKey,
          model: provider.model,
          baseUrl: provider.baseUrl
        });
        let saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
        const ensured = await ensureDiabeticRecipeImage(db, saved, resolvedDataDir);
        saved = ensured.recipe;
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
            image: ensured.image ?? null
          }
        });
        return true;
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
          return true;
        }
        if (String(error?.code ?? "") === "LLM_DISABLED") {
          sendJson(res, 503, {
            error: "LLM provider disabled",
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
          return true;
        }
        if (String(error?.code ?? "") === "OLLAMA_UNAVAILABLE") {
          sendJson(res, 503, {
            error: "Ollama server not reachable",
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
          return true;
        }
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        return true;
      }
    }

    try {
      const generated = await generateFromBuilderSession(session, null, {
        provider: provider.provider_id,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl
      });
      let saved = saveDiabeticRecipe(db, { ...generated.recipe, source: "ai" });
      const ensured = await ensureDiabeticRecipeImage(db, saved, resolvedDataDir);
      saved = ensured.recipe;
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
          image: ensured.image ?? null
        }
      });
      return true;
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
        return true;
      }
      if (String(error?.code ?? "") === "LLM_DISABLED") {
        sendJson(res, 503, {
          error: "LLM provider disabled",
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
        return true;
      }
      if (String(error?.code ?? "") === "OLLAMA_UNAVAILABLE") {
        sendJson(res, 503, {
          error: "Ollama server not reachable",
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
        return true;
      }
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  return false;
}
