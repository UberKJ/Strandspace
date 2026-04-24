// DiabeticSpace recipe persistence.
// Handles CRUD-style reads/writes for `diabetic_recipes`.

import { initDiabeticDb } from "./schema.js";
import { normalizeRecipeInput, safeJsonParse } from "./normalize.js";

function parseRecipeRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id ?? 0),
    recipe_id: String(row.recipe_id ?? "").trim(),
    title: String(row.title ?? "").trim(),
    meal_type: String(row.meal_type ?? "").trim() || null,
    description: String(row.description ?? "").trim() || null,
    ingredients: safeJsonParse(row.ingredients, []),
    substitutes: safeJsonParse(row.substitutes, []),
    instructions: safeJsonParse(row.instructions, []),
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    serving_notes: String(row.serving_notes ?? "").trim() || null,
    tags: safeJsonParse(row.tags, []),
    gi_notes: String(row.gi_notes ?? "").trim() || null,
    trigger_words: safeJsonParse(row.trigger_words, []),
    image_url: String(row.image_url ?? "").trim() || null,
    source: String(row.source ?? "").trim() || null,
    recall_count: Number(row.recall_count ?? 0),
    rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : 0,
    favorite: Number(row.favorite ?? 0) ? 1 : 0,
    last_cooked_at: String(row.last_cooked_at ?? "").trim() || null,
    updated_at: String(row.updated_at ?? "").trim() || null,
    created_at: String(row.created_at ?? "").trim() || null
  };
}

export function getDiabeticRecipeById(db, recipeId) {
  initDiabeticDb(db);
  const recipe_id = String(recipeId ?? "").trim();
  if (!recipe_id) return null;
  const row = db.prepare("SELECT * FROM diabetic_recipes WHERE recipe_id = ?").get(recipe_id);
  return parseRecipeRow(row);
}

export function listDiabeticRecipes(db, mealType = "") {
  initDiabeticDb(db);
  const meal_type = String(mealType ?? "").trim().toLowerCase();
  const rows = meal_type
    ? db.prepare("SELECT recipe_id, title, meal_type, servings, tags, rating, favorite, last_cooked_at, updated_at FROM diabetic_recipes WHERE lower(meal_type) = ? ORDER BY created_at DESC, title ASC").all(meal_type)
    : db.prepare("SELECT recipe_id, title, meal_type, servings, tags, rating, favorite, last_cooked_at, updated_at FROM diabetic_recipes ORDER BY created_at DESC, title ASC").all();
  return rows.map((row) => ({
    recipe_id: String(row.recipe_id ?? "").trim(),
    title: String(row.title ?? "").trim(),
    meal_type: String(row.meal_type ?? "").trim() || null,
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    tags: safeJsonParse(row.tags, []),
    rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : 0,
    favorite: Number(row.favorite ?? 0) ? 1 : 0,
    last_cooked_at: String(row.last_cooked_at ?? "").trim() || null,
    updated_at: String(row.updated_at ?? "").trim() || null
  }));
}

export function saveDiabeticRecipe(db, recipeObj = {}) {
  initDiabeticDb(db);
  const normalized = normalizeRecipeInput(recipeObj);
  const existing = db.prepare("SELECT id, recall_count, created_at, image_url FROM diabetic_recipes WHERE recipe_id = ?").get(normalized.recipe_id);
  const finalImageUrl = normalized.image_url ?? (String(existing?.image_url ?? "").trim() || null);

  if (existing?.id) {
    db.prepare(`
      UPDATE diabetic_recipes
      SET title = ?,
          meal_type = ?,
          description = ?,
          ingredients = ?,
          substitutes = ?,
          instructions = ?,
          servings = ?,
          serving_notes = ?,
          tags = ?,
          gi_notes = ?,
          trigger_words = ?,
          image_url = ?,
          source = ?,
          updated_at = datetime('now')
      WHERE recipe_id = ?
    `).run(
      normalized.title,
      normalized.meal_type,
      normalized.description,
      JSON.stringify(normalized.ingredients ?? []),
      JSON.stringify(normalized.substitutes ?? []),
      JSON.stringify(normalized.instructions ?? []),
      normalized.servings,
      normalized.serving_notes,
      JSON.stringify(normalized.tags ?? []),
      normalized.gi_notes,
      JSON.stringify(normalized.trigger_words ?? []),
      finalImageUrl,
      normalized.source,
      normalized.recipe_id
    );
  } else {
    db.prepare(`
      INSERT INTO diabetic_recipes (
        recipe_id, title, meal_type, description, ingredients, substitutes, instructions,
        servings, serving_notes, tags, gi_notes, trigger_words, image_url, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.recipe_id,
      normalized.title,
      normalized.meal_type,
      normalized.description,
      JSON.stringify(normalized.ingredients ?? []),
      JSON.stringify(normalized.substitutes ?? []),
      JSON.stringify(normalized.instructions ?? []),
      normalized.servings,
      normalized.serving_notes,
      JSON.stringify(normalized.tags ?? []),
      normalized.gi_notes,
      JSON.stringify(normalized.trigger_words ?? []),
      finalImageUrl,
      normalized.source
    );
  }

  return getDiabeticRecipeById(db, normalized.recipe_id);
}

export function setDiabeticRecipeImage(db, recipeId, imageUrl) {
  initDiabeticDb(db);
  const recipe_id = String(recipeId ?? "").trim();
  if (!recipe_id) return null;
  const image_url = String(imageUrl ?? "").trim() || null;
  db.prepare("UPDATE diabetic_recipes SET image_url = ?, updated_at = datetime('now') WHERE recipe_id = ?").run(image_url, recipe_id);
  return getDiabeticRecipeById(db, recipe_id);
}

function normalizeBoolean01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric ? 1 : 0;
}

function normalizeRating(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < 0 || rounded > 5) return null;
  return rounded;
}

export function rateDiabeticRecipe(db, recipeId, ratingValue) {
  initDiabeticDb(db);
  const recipe_id = String(recipeId ?? "").trim();
  if (!recipe_id) {
    throw new Error("recipe_id is required");
  }
  const rating = normalizeRating(ratingValue);
  if (rating === null) {
    throw new Error("rating must be an integer from 0 through 5");
  }
  db.prepare("UPDATE diabetic_recipes SET rating = ?, updated_at = datetime('now') WHERE recipe_id = ?").run(rating, recipe_id);
  return getDiabeticRecipeById(db, recipe_id);
}

export function setDiabeticRecipeFavorite(db, recipeId, favoriteValue) {
  initDiabeticDb(db);
  const recipe_id = String(recipeId ?? "").trim();
  if (!recipe_id) {
    throw new Error("recipe_id is required");
  }
  const favorite = normalizeBoolean01(favoriteValue);
  if (favorite === null) {
    throw new Error("favorite must be 0 or 1");
  }
  db.prepare("UPDATE diabetic_recipes SET favorite = ?, updated_at = datetime('now') WHERE recipe_id = ?").run(favorite, recipe_id);
  return getDiabeticRecipeById(db, recipe_id);
}

export function markDiabeticRecipeCooked(db, recipeId, cookedAt) {
  initDiabeticDb(db);
  const recipe_id = String(recipeId ?? "").trim();
  if (!recipe_id) {
    throw new Error("recipe_id is required");
  }
  const last_cooked_at = String(cookedAt ?? "").trim() || new Date().toISOString();
  db.prepare("UPDATE diabetic_recipes SET last_cooked_at = ?, updated_at = datetime('now') WHERE recipe_id = ?").run(last_cooked_at, recipe_id);
  return getDiabeticRecipeById(db, recipe_id);
}

export function listFavoriteDiabeticRecipes(db, mealType = "") {
  initDiabeticDb(db);
  const meal_type = String(mealType ?? "").trim().toLowerCase();
  const rows = meal_type
    ? db.prepare("SELECT recipe_id, title, meal_type, servings, tags, rating, favorite, last_cooked_at, updated_at FROM diabetic_recipes WHERE favorite = 1 AND lower(meal_type) = ? ORDER BY updated_at DESC, created_at DESC, title ASC").all(meal_type)
    : db.prepare("SELECT recipe_id, title, meal_type, servings, tags, rating, favorite, last_cooked_at, updated_at FROM diabetic_recipes WHERE favorite = 1 ORDER BY updated_at DESC, created_at DESC, title ASC").all();
  return rows.map((row) => ({
    recipe_id: String(row.recipe_id ?? "").trim(),
    title: String(row.title ?? "").trim(),
    meal_type: String(row.meal_type ?? "").trim() || null,
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    tags: safeJsonParse(row.tags, []),
    rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : 0,
    favorite: Number(row.favorite ?? 0) ? 1 : 0,
    last_cooked_at: String(row.last_cooked_at ?? "").trim() || null,
    updated_at: String(row.updated_at ?? "").trim() || null
  }));
}

export { parseRecipeRow };
