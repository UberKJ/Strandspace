import { randomBytes } from "node:crypto";

import { initDiabeticDb } from "./schema.js";
import { normalizeRecipeInput } from "./normalize.js";
import { getDiabeticRecipeById, saveDiabeticRecipe } from "./recipes.js";

const SHARE_STATUSES = new Set(["private", "exportable", "shared"]);

function makeShareId() {
  return `share_${randomBytes(9).toString("hex")}`;
}

function normalizeStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();
  return SHARE_STATUSES.has(status) ? status : null;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function recipeExists(db, recipeId) {
  const recipe_id = String(recipeId ?? "").trim();
  if (!recipe_id) return false;
  const row = db.prepare("SELECT 1 as ok FROM diabetic_recipes WHERE recipe_id = ?").get(recipe_id);
  return Boolean(row?.ok);
}

function makeSafeImportedRecipeId(db, baseId) {
  const base = String(baseId ?? "").trim() || `shared-${Date.now().toString(36)}`;
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || `shared-${Date.now().toString(36)}`;

  let candidate = cleaned;
  if (!recipeExists(db, candidate)) return candidate;
  candidate = `${cleaned}-shared`;
  if (!recipeExists(db, candidate)) return candidate;
  for (let i = 2; i <= 99; i += 1) {
    const next = `${cleaned}-shared-${i}`;
    if (!recipeExists(db, next)) return next;
  }
  return `${cleaned}-shared-${Date.now().toString(36)}`;
}

function pickRecipeFields(recipe) {
  if (!recipe) return null;
  return {
    recipe_id: String(recipe.recipe_id ?? "").trim(),
    title: String(recipe.title ?? "").trim(),
    meal_type: normalizeText(recipe.meal_type),
    description: normalizeText(recipe.description),
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    substitutes: Array.isArray(recipe.substitutes) ? recipe.substitutes : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    servings: recipe.servings === null || recipe.servings === undefined ? null : Number(recipe.servings),
    serving_notes: normalizeText(recipe.serving_notes),
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    gi_notes: normalizeText(recipe.gi_notes),
    image_url: normalizeText(recipe.image_url),
    public_share_id: normalizeText(recipe.public_share_id),
    share_status: normalizeStatus(recipe.share_status) ?? "private",
    license_note: normalizeText(recipe.license_note),
    author_name: normalizeText(recipe.author_name)
  };
}

export function setRecipeShareStatus(db, recipeId, statusValue) {
  initDiabeticDb(db);
  const recipe_id = String(recipeId ?? "").trim();
  if (!recipe_id) {
    throw new Error("recipe_id is required");
  }
  const status = normalizeStatus(statusValue);
  if (!status) {
    throw new Error("status must be private, exportable, or shared");
  }

  const recipe = getDiabeticRecipeById(db, recipe_id);
  if (!recipe) {
    throw new Error("Recipe not found");
  }

  let public_share_id = normalizeText(recipe.public_share_id);
  if (status === "private") {
    public_share_id = null;
  } else if (!public_share_id) {
    public_share_id = makeShareId();
  }

  db.prepare(`
    UPDATE diabetic_recipes
    SET share_status = ?,
        public_share_id = ?,
        updated_at = datetime('now')
    WHERE recipe_id = ?
  `).run(status, public_share_id, recipe_id);

  return getDiabeticRecipeById(db, recipe_id);
}

export function createRecipeSharePackage(db, recipeId, { author_name, notes } = {}) {
  initDiabeticDb(db);
  const recipe_id = String(recipeId ?? "").trim();
  if (!recipe_id) {
    throw new Error("recipe_id is required");
  }

  const recipe = getDiabeticRecipeById(db, recipe_id);
  if (!recipe) {
    throw new Error("Recipe not found");
  }

  const packagedRecipe = pickRecipeFields(recipe);
  if (!packagedRecipe) {
    throw new Error("Recipe unavailable");
  }

  return {
    app: "DiabeticSpace",
    type: "recipe_share",
    version: 1,
    recipe: packagedRecipe,
    created_at: new Date().toISOString(),
    author_name: normalizeText(author_name) ?? packagedRecipe.author_name,
    notes: normalizeText(notes)
  };
}

export function importRecipeSharePackage(db, packageJson, { overwrite = false } = {}) {
  initDiabeticDb(db);

  const payload = packageJson && typeof packageJson === "object" ? packageJson : null;
  if (!payload) {
    throw new Error("packageJson is required");
  }
  if (payload.app !== "DiabeticSpace") {
    throw new Error("Unsupported package app");
  }
  if (payload.type !== "recipe_share" || Number(payload.version) !== 1) {
    throw new Error("Unsupported package type/version");
  }

  const recipe = payload.recipe && typeof payload.recipe === "object" ? payload.recipe : null;
  if (!recipe) {
    throw new Error("Package missing recipe");
  }

  const importedCore = normalizeRecipeInput({
    recipe_id: String(recipe.recipe_id ?? "").trim() || `shared-${Date.now().toString(36)}`,
    title: String(recipe.title ?? "").trim(),
    meal_type: recipe.meal_type ?? null,
    description: recipe.description ?? null,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    substitutes: Array.isArray(recipe.substitutes) ? recipe.substitutes : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    servings: recipe.servings ?? null,
    serving_notes: recipe.serving_notes ?? null,
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    gi_notes: recipe.gi_notes ?? null,
    image_url: recipe.image_url ?? null,
    source: "shared"
  });

  const desiredId = importedCore.recipe_id;
  const exists = recipeExists(db, desiredId);
  const recipe_id = exists && !overwrite ? makeSafeImportedRecipeId(db, desiredId) : desiredId;

  const saved = saveDiabeticRecipe(db, { ...importedCore, recipe_id, source: "shared" });
  if (!saved) {
    throw new Error("Failed to save imported recipe");
  }

  const share_status = "private";
  const public_share_id = normalizeText(recipe.public_share_id) ?? null;
  const license_note = normalizeText(recipe.license_note) ?? null;
  const author_name = normalizeText(recipe.author_name) ?? normalizeText(payload.author_name) ?? null;

  db.prepare(`
    UPDATE diabetic_recipes
    SET share_status = ?,
        public_share_id = ?,
        license_note = ?,
        author_name = ?,
        source = 'shared',
        updated_at = datetime('now')
    WHERE recipe_id = ?
  `).run(share_status, public_share_id, license_note, author_name, recipe_id);

  return {
    recipe: getDiabeticRecipeById(db, recipe_id),
    imported_as: recipe_id,
    duplicated: exists && recipe_id !== desiredId
  };
}

