// DiabeticSpace shopping lists.
// Lists can be created manually or generated from recipes/meal plans.

import { initDiabeticDb } from "./schema.js";
import { normalizeToken } from "./normalize.js";
import { getDiabeticRecipeById } from "./recipes.js";
import { getWeeklyMealPlan } from "./meal-plans.js";

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeChecked(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric ? 1 : 0;
}

function normalizePosition(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
}

function shoppingListRow(row) {
  if (!row) return null;
  return {
    list_id: String(row.list_id ?? "").trim(),
    source_type: String(row.source_type ?? "").trim() || null,
    source_id: String(row.source_id ?? "").trim() || null,
    title: String(row.title ?? "").trim(),
    created_at: String(row.created_at ?? "").trim() || null,
    updated_at: String(row.updated_at ?? "").trim() || null
  };
}

function shoppingItemRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id ?? 0),
    list_id: String(row.list_id ?? "").trim(),
    name: String(row.name ?? "").trim(),
    amount: String(row.amount ?? "").trim() || null,
    unit: String(row.unit ?? "").trim() || null,
    category: String(row.category ?? "").trim() || null,
    checked: Number(row.checked ?? 0) ? 1 : 0,
    recipe_id: String(row.recipe_id ?? "").trim() || null,
    notes: String(row.notes ?? "").trim() || null,
    position: Number(row.position ?? 0),
    created_at: String(row.created_at ?? "").trim() || null
  };
}

function touchList(db, listId) {
  db.prepare("UPDATE diabetic_shopping_lists SET updated_at = datetime('now') WHERE list_id = ?").run(String(listId));
}

export function createShoppingList(db, { title, source_type = null, source_id = null } = {}) {
  initDiabeticDb(db);
  const finalTitle = String(title ?? "").trim();
  if (!finalTitle) {
    throw new Error("title is required");
  }

  const list_id = `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(`
    INSERT INTO diabetic_shopping_lists (list_id, source_type, source_id, title)
    VALUES (?, ?, ?, ?)
  `).run(
    list_id,
    normalizeOptionalText(source_type),
    normalizeOptionalText(source_id),
    finalTitle
  );

  return getShoppingList(db, list_id);
}

export function listShoppingLists(db) {
  initDiabeticDb(db);
  const rows = db.prepare("SELECT * FROM diabetic_shopping_lists ORDER BY updated_at DESC, created_at DESC").all();
  return rows.map(shoppingListRow).filter(Boolean);
}

export function getShoppingList(db, listId) {
  initDiabeticDb(db);
  const list_id = String(listId ?? "").trim();
  if (!list_id) return null;

  const row = db.prepare("SELECT * FROM diabetic_shopping_lists WHERE list_id = ?").get(list_id);
  const list = shoppingListRow(row);
  if (!list) return null;

  const itemRows = db.prepare("SELECT * FROM diabetic_shopping_list_items WHERE list_id = ?").all(list_id);
  const items = itemRows
    .map(shoppingItemRow)
    .filter(Boolean)
    .sort((a, b) => {
      if ((a.checked ?? 0) !== (b.checked ?? 0)) return (a.checked ?? 0) - (b.checked ?? 0);
      if ((a.position ?? 0) !== (b.position ?? 0)) return (a.position ?? 0) - (b.position ?? 0);
      return (a.id ?? 0) - (b.id ?? 0);
    });

  return { ...list, items };
}

export function addShoppingListItem(db, listId, item = {}) {
  initDiabeticDb(db);
  const list_id = String(listId ?? "").trim();
  if (!list_id) {
    throw new Error("listId is required");
  }

  const existingList = db.prepare("SELECT list_id FROM diabetic_shopping_lists WHERE list_id = ?").get(list_id);
  if (!existingList) {
    throw new Error("Shopping list not found");
  }

  const name = String(item.name ?? "").trim();
  if (!name) {
    throw new Error("name is required");
  }

  const nextPosRow = db.prepare("SELECT COALESCE(MAX(position), -1) AS max_pos FROM diabetic_shopping_list_items WHERE list_id = ?").get(list_id);
  const position = Number(nextPosRow?.max_pos ?? -1) + 1;

  db.prepare(`
    INSERT INTO diabetic_shopping_list_items (list_id, name, amount, unit, category, checked, recipe_id, notes, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    list_id,
    name,
    normalizeOptionalText(item.amount),
    normalizeOptionalText(item.unit),
    normalizeOptionalText(item.category),
    normalizeChecked(item.checked),
    normalizeOptionalText(item.recipe_id),
    normalizeOptionalText(item.notes),
    position
  );

  touchList(db, list_id);
  const created = db.prepare("SELECT id FROM diabetic_shopping_list_items WHERE list_id = ? ORDER BY id DESC LIMIT 1").get(list_id);
  return created?.id ? getShoppingListItem(db, created.id) : null;
}

export function getShoppingListItem(db, itemId) {
  initDiabeticDb(db);
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const row = db.prepare("SELECT * FROM diabetic_shopping_list_items WHERE id = ?").get(id);
  return shoppingItemRow(row);
}

export function updateShoppingListItem(db, itemId, updates = {}) {
  initDiabeticDb(db);
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("itemId is required");
  }

  const existing = db.prepare("SELECT * FROM diabetic_shopping_list_items WHERE id = ?").get(id);
  if (!existing) {
    throw new Error("Shopping list item not found");
  }

  const name = updates.name !== undefined ? String(updates.name ?? "").trim() : String(existing.name ?? "").trim();
  if (!name) {
    throw new Error("name is required");
  }

  const amount = updates.amount !== undefined ? normalizeOptionalText(updates.amount) : (String(existing.amount ?? "").trim() || null);
  const unit = updates.unit !== undefined ? normalizeOptionalText(updates.unit) : (String(existing.unit ?? "").trim() || null);
  const category = updates.category !== undefined ? normalizeOptionalText(updates.category) : (String(existing.category ?? "").trim() || null);
  const notes = updates.notes !== undefined ? normalizeOptionalText(updates.notes) : (String(existing.notes ?? "").trim() || null);
  const checked = updates.checked !== undefined ? normalizeChecked(updates.checked) : (Number(existing.checked ?? 0) ? 1 : 0);
  const position = updates.position !== undefined ? normalizePosition(updates.position) : Number(existing.position ?? 0);

  db.prepare(`
    UPDATE diabetic_shopping_list_items
    SET name = ?,
        amount = ?,
        unit = ?,
        category = ?,
        notes = ?,
        checked = ?,
        position = ?
    WHERE id = ?
  `).run(name, amount, unit, category, notes, checked, position, id);

  touchList(db, existing.list_id);
  return getShoppingListItem(db, id);
}

export function checkShoppingListItem(db, itemId, checked) {
  return updateShoppingListItem(db, itemId, { checked: normalizeChecked(checked) });
}

export function deleteShoppingListItem(db, itemId) {
  initDiabeticDb(db);
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const existing = db.prepare("SELECT list_id FROM diabetic_shopping_list_items WHERE id = ?").get(id);
  if (!existing?.list_id) return false;

  db.prepare("DELETE FROM diabetic_shopping_list_items WHERE id = ?").run(id);
  touchList(db, existing.list_id);
  return true;
}

function formatAmount(value) {
  if (!Number.isFinite(Number(value))) return "";
  const numeric = Number(value);
  if (Number.isInteger(numeric)) return String(numeric);
  const trimmed = Number(numeric.toFixed(3));
  return String(trimmed);
}

function collectRecipeIngredients(recipe) {
  const items = [];
  for (const ing of Array.isArray(recipe?.ingredients) ? recipe.ingredients : []) {
    const name = String(ing?.name ?? "").trim();
    if (!name) continue;
    const unit = String(ing?.unit ?? "").trim() || null;
    const amount = ing?.amount;
    items.push({
      name,
      unit,
      amount,
      recipe_id: recipe.recipe_id
    });
  }
  return items;
}

function groupIngredients(ingredients = []) {
  const buckets = new Map();

  for (const ing of Array.isArray(ingredients) ? ingredients : []) {
    const name = String(ing.name ?? "").trim();
    if (!name) continue;
    const unit = String(ing.unit ?? "").trim().toLowerCase();
    const key = `${normalizeToken(name)}|${unit}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        name,
        unit: unit || null,
        numericSum: null,
        hadNumeric: false,
        hadText: false,
        texts: []
      });
    }
    const bucket = buckets.get(key);

    if (typeof ing.amount === "number" && Number.isFinite(ing.amount)) {
      bucket.hadNumeric = true;
      bucket.numericSum = (bucket.numericSum ?? 0) + ing.amount;
    } else if (ing.amount === null || ing.amount === undefined || ing.amount === "") {
      bucket.hadText = true;
      bucket.texts.push("");
    } else {
      bucket.hadText = true;
      bucket.texts.push(String(ing.amount));
    }
  }

  const out = [];
  for (const bucket of buckets.values()) {
    const name = bucket.name;
    const unit = bucket.unit;
    if (bucket.hadNumeric && !bucket.hadText) {
      out.push({ name, unit, amount: formatAmount(bucket.numericSum ?? 0) });
      continue;
    }
    if (bucket.hadNumeric) {
      out.push({ name, unit, amount: formatAmount(bucket.numericSum ?? 0) });
    }
    for (const text of bucket.texts) {
      out.push({ name, unit, amount: String(text ?? "").trim() || null });
    }
  }

  return out;
}

export function generateShoppingListFromRecipes(db, recipeIds = [], { title = "", source_type = "recipes", source_id = "" } = {}) {
  initDiabeticDb(db);
  const ids = (() => {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(recipeIds) ? recipeIds : []) {
      const id = String(raw ?? "").trim();
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= 200) break;
    }
    return out;
  })();
  if (!ids.length) {
    throw new Error("recipeIds is required");
  }

  const recipes = [];
  for (const id of ids) {
    const recipe = getDiabeticRecipeById(db, id);
    if (recipe) recipes.push(recipe);
  }
  if (!recipes.length) {
    throw new Error("No recipes found");
  }

  const ingredients = recipes.flatMap(collectRecipeIngredients);
  const grouped = groupIngredients(ingredients);

  const list = createShoppingList(db, {
    title: String(title ?? "").trim() || `Shopping list (${recipes.length} recipe${recipes.length === 1 ? "" : "s"})`,
    source_type,
    source_id: source_id || ids.join(",")
  });

  for (const entry of grouped) {
    addShoppingListItem(db, list.list_id, {
      name: entry.name,
      amount: entry.amount,
      unit: entry.unit,
      category: null,
      checked: 0,
      recipe_id: null,
      notes: null
    });
  }

  return getShoppingList(db, list.list_id);
}

export function generateShoppingListFromMealPlan(db, planId) {
  initDiabeticDb(db);
  const plan = getWeeklyMealPlan(db, planId);
  if (!plan?.plan_id) {
    throw new Error("Meal plan not found");
  }

  const recipeIds = Array.from(new Set(
    (Array.isArray(plan.items) ? plan.items : [])
      .map((item) => String(item.recipe_id ?? "").trim())
      .filter(Boolean)
  ));

  if (!recipeIds.length) {
    throw new Error("Meal plan has no recipes yet");
  }

  return generateShoppingListFromRecipes(db, recipeIds, {
    title: `Shopping list (week of ${plan.week_start})`,
    source_type: "meal_plan",
    source_id: String(plan.plan_id)
  });
}
