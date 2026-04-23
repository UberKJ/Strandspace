import OpenAI from "openai";
import { execFileSync } from "node:child_process";

const DEFAULT_MODEL = process.env.DIABETICSPACE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";

let client = null;
let mock = null;
let resolvedApiKey = null;
let resolvedApiKeyLoaded = false;

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
    return mock({ systemPrompt, input, routeLabel });
  }

  const openai = getClient();
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

  return parseJsonOrThrow(response.output_text, routeLabel);
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

