// DiabeticSpace normalization utilities.
// Keeps input shapes stable for DB storage + search scoring.

function safeJsonParse(text, fallback) {
  if (text === null || text === undefined) {
    return fallback;
  }
  if (typeof text !== "string") {
    return fallback;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

function normalizeToken(token) {
  return String(token ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function tokenizeWords(text = "") {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueStrings(list = [], limit = 48) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const token = normalizeToken(item);
    if (!token) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= limit) break;
  }
  return out;
}

const SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "make",
  "me",
  "my",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "recipe",
  "recipes",
  "the",
  "this",
  "to",
  "want",
  "we",
  "with",
  "without",
  "you",
  "your",
  "food"
]);

function tokenizeSearchQuery(text = "") {
  const tokens = tokenizeWords(text)
    .map(normalizeToken)
    .filter((token) => token && token.length >= 3 && !SEARCH_STOPWORDS.has(token));
  return uniqueStrings(tokens, 32);
}

function normalizeRecipeInput(recipeObj = {}) {
  const recipe_id = String(recipeObj.recipe_id ?? "").trim();
  const title = String(recipeObj.title ?? "").trim();
  if (!recipe_id) {
    throw new Error("recipe_id is required");
  }
  if (!title) {
    throw new Error("title is required");
  }

  const meal_type = String(recipeObj.meal_type ?? "").trim() || null;
  const description = String(recipeObj.description ?? "").trim() || null;
  const servings = Number.isFinite(Number(recipeObj.servings)) ? Math.max(1, Math.round(Number(recipeObj.servings))) : null;
  const serving_notes = String(recipeObj.serving_notes ?? "").trim() || null;
  const gi_notes = String(recipeObj.gi_notes ?? "").trim() || null;
  const image_url = String(recipeObj.image_url ?? recipeObj.imageUrl ?? "").trim() || null;
  const source = String(recipeObj.source ?? "").trim() || null;

  const ingredients = Array.isArray(recipeObj.ingredients) ? recipeObj.ingredients : [];
  const substitutes = Array.isArray(recipeObj.substitutes) ? recipeObj.substitutes : [];
  const instructions = Array.isArray(recipeObj.instructions) ? recipeObj.instructions : [];
  const tags = uniqueStrings(Array.isArray(recipeObj.tags) ? recipeObj.tags : [], 24);

  const triggerFromInput = Array.isArray(recipeObj.trigger_words)
    ? recipeObj.trigger_words
    : (typeof recipeObj.trigger_words === "string" ? tokenizeWords(recipeObj.trigger_words) : []);

  const derivedTriggerWords = uniqueStrings([
    ...tokenizeWords(title),
    ...tokenizeWords(meal_type ?? ""),
    ...tags
  ], 64);

  const trigger_words = uniqueStrings(triggerFromInput.length ? triggerFromInput : derivedTriggerWords, 64);

  return {
    recipe_id,
    title,
    meal_type,
    description,
    ingredients: ingredients.map((item) => ({
      name: String(item?.name ?? "").trim(),
      amount: (() => {
        const value = item?.amount;
        if (value === null || value === undefined) return null;
        if (typeof value === "number" && Number.isFinite(value)) return value;
        const text = String(value).trim();
        return text ? text : null;
      })(),
      unit: String(item?.unit ?? "").trim() || null,
      note: String(item?.note ?? "").trim() || null
    })).filter((item) => item.name),
    substitutes: substitutes.map((item) => ({
      original: String(item?.original ?? "").trim(),
      substitute: String(item?.substitute ?? "").trim(),
      reason: String(item?.reason ?? "").trim() || null
    })).filter((item) => item.original && item.substitute),
    instructions: instructions.map((step) => String(step ?? "").trim()).filter(Boolean),
    servings,
    serving_notes,
    tags,
    gi_notes,
    trigger_words,
    image_url,
    source
  };
}

export {
  normalizeRecipeInput,
  normalizeToken,
  safeJsonParse,
  tokenizeSearchQuery,
  tokenizeWords,
  uniqueStrings
};

