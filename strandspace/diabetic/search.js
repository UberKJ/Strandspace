// DiabeticSpace search + recall.
// Provides deterministic local matching for offline-first behavior.

import { initDiabeticDb } from "./schema.js";
import { normalizeToken, tokenizeSearchQuery, tokenizeWords, uniqueStrings } from "./normalize.js";
import { getDiabeticRecipeById, parseRecipeRow } from "./recipes.js";

function scoreRecipe(recipe, queryTokens) {
  const trigger = new Set(Array.isArray(recipe.trigger_words) ? recipe.trigger_words.map(normalizeToken).filter(Boolean) : []);
  const tags = new Set(Array.isArray(recipe.tags) ? recipe.tags.map(normalizeToken).filter(Boolean) : []);
  const titleTokens = new Set(tokenizeWords(recipe.title));
  const mealToken = normalizeToken(recipe.meal_type ?? "");

  let score = 0;
  let triggerHits = 0;
  let titleHits = 0;
  let tagHits = 0;

  for (const token of queryTokens) {
    if (trigger.has(token)) {
      triggerHits += 1;
    }
    if (titleTokens.has(token)) {
      titleHits += 1;
    }
    if (tags.has(token)) {
      tagHits += 1;
    }
    if (mealToken && token === mealToken) {
      score += 2;
    }
  }

  score += triggerHits * 6;
  score += titleHits * 4;
  score += tagHits * 2;

  if (recipe.meal_type && queryTokens.includes(normalizeToken(recipe.meal_type))) {
    score += 3;
  }

  return score;
}

function scoreRecipeSearchMatch(recipe, queryTokens, queryText) {
  const normalizedQuery = String(queryText ?? "").toLowerCase();
  const title = String(recipe.title ?? "").toLowerCase();
  const description = String(recipe.description ?? "").toLowerCase();

  let score = scoreRecipe(recipe, queryTokens);
  if (title.includes(normalizedQuery)) score += 12;
  if (description.includes(normalizedQuery)) score += 5;

  const titleTokens = new Set(tokenizeWords(title));
  let titleTokenHits = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) titleTokenHits += 1;
  }
  score += titleTokenHits * 6;

  return score;
}

export function recallDiabeticRecipe(db, query = "") {
  initDiabeticDb(db);
  const q = String(query ?? "").trim();
  if (!q) return null;

  const queryTokens = uniqueStrings(tokenizeWords(q), 32);
  if (!queryTokens.length) return null;

  const rows = db.prepare("SELECT * FROM diabetic_recipes").all();
  let best = null;
  let bestScore = 0;

  for (const row of rows) {
    const recipe = parseRecipeRow(row);
    if (!recipe) continue;
    const score = scoreRecipe(recipe, queryTokens);
    if (score > bestScore) {
      best = recipe;
      bestScore = score;
    }
  }

  if (!best || bestScore <= 0) {
    return null;
  }

  db.prepare("UPDATE diabetic_recipes SET recall_count = recall_count + 1 WHERE recipe_id = ?").run(best.recipe_id);
  return getDiabeticRecipeById(db, best.recipe_id);
}

export function searchDiabeticRecipes(db, query = "", { mealType = "" } = {}) {
  initDiabeticDb(db);
  const q = String(query ?? "").trim();
  if (!q) return [];

  const queryTokens = tokenizeSearchQuery(q);
  if (!queryTokens.length) return [];

  const meal_type = String(mealType ?? "").trim().toLowerCase();
  const rows = db.prepare("SELECT * FROM diabetic_recipes").all();
  const matches = [];

  for (const row of rows) {
    const recipe = parseRecipeRow(row);
    if (!recipe) continue;
    if (meal_type && String(recipe.meal_type ?? "").trim().toLowerCase() !== meal_type) continue;
    const match_score = scoreRecipeSearchMatch(recipe, queryTokens, q);
    if (match_score <= 0) continue;
    matches.push({
      recipe_id: recipe.recipe_id,
      title: recipe.title,
      meal_type: recipe.meal_type,
      description: recipe.description,
      servings: recipe.servings,
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
      gi_notes: recipe.gi_notes,
      recall_count: Number(recipe.recall_count ?? 0),
      match_score
    });
  }

  matches.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    if ((b.recall_count ?? 0) !== (a.recall_count ?? 0)) return (b.recall_count ?? 0) - (a.recall_count ?? 0);
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });

  return matches.slice(0, 10);
}

