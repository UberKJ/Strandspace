// DiabeticSpace weekly meal planning.
// Plans are local-first, stored in SQLite, and can be printed/exported later.

import { initDiabeticDb } from "./schema.js";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SLOTS = ["breakfast", "lunch", "dinner", "snack", "dessert"];

const DAY_INDEX = new Map(DAYS.map((day, index) => [day, index]));
const SLOT_INDEX = new Map(SLOTS.map((slot, index) => [slot, index]));

function normalizeWeekStart(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return text;
}

function normalizeDay(value) {
  const day = String(value ?? "").trim().toLowerCase();
  return DAY_INDEX.has(day) ? day : "";
}

function normalizeSlot(value) {
  const slot = String(value ?? "").trim().toLowerCase();
  return SLOT_INDEX.has(slot) ? slot : "";
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeServings(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

function planSummaryRow(row) {
  if (!row) return null;
  return {
    plan_id: String(row.plan_id ?? "").trim(),
    week_start: String(row.week_start ?? "").trim(),
    title: String(row.title ?? "").trim() || null,
    notes: String(row.notes ?? "").trim() || null,
    created_at: String(row.created_at ?? "").trim() || null,
    updated_at: String(row.updated_at ?? "").trim() || null
  };
}

function planItemRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id ?? 0),
    plan_id: String(row.plan_id ?? "").trim(),
    recipe_id: String(row.recipe_id ?? "").trim() || null,
    recipe_title: String(row.recipe_title ?? "").trim() || null,
    day_of_week: String(row.day_of_week ?? "").trim() || null,
    meal_slot: String(row.meal_slot ?? "").trim() || null,
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    notes: String(row.notes ?? "").trim() || null,
    position: Number(row.position ?? 0),
    created_at: String(row.created_at ?? "").trim() || null
  };
}

function touchMealPlan(db, planId) {
  db.prepare("UPDATE diabetic_meal_plans SET updated_at = datetime('now') WHERE plan_id = ?").run(String(planId));
}

export function createWeeklyMealPlan(db, { week_start, title = "", notes = "" } = {}) {
  initDiabeticDb(db);
  const normalizedWeek = normalizeWeekStart(week_start);
  if (!normalizedWeek) {
    throw new Error("week_start must be in YYYY-MM-DD format");
  }

  const plan_id = `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(`
    INSERT INTO diabetic_meal_plans (plan_id, week_start, title, notes)
    VALUES (?, ?, ?, ?)
  `).run(
    plan_id,
    normalizedWeek,
    normalizeOptionalText(title),
    normalizeOptionalText(notes)
  );

  return getWeeklyMealPlan(db, plan_id);
}

export function listMealPlans(db) {
  initDiabeticDb(db);
  const rows = db.prepare("SELECT * FROM diabetic_meal_plans ORDER BY updated_at DESC, created_at DESC").all();
  return rows.map(planSummaryRow).filter(Boolean);
}

export function getMealPlanByWeek(db, weekStart) {
  initDiabeticDb(db);
  const normalizedWeek = normalizeWeekStart(weekStart);
  if (!normalizedWeek) return null;
  const row = db.prepare("SELECT * FROM diabetic_meal_plans WHERE week_start = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1").get(normalizedWeek);
  const plan = planSummaryRow(row);
  if (!plan?.plan_id) return null;
  return getWeeklyMealPlan(db, plan.plan_id);
}

export function getWeeklyMealPlan(db, planId) {
  initDiabeticDb(db);
  const plan_id = String(planId ?? "").trim();
  if (!plan_id) return null;

  const planRow = db.prepare("SELECT * FROM diabetic_meal_plans WHERE plan_id = ?").get(plan_id);
  const plan = planSummaryRow(planRow);
  if (!plan) return null;

  const itemRows = db.prepare(`
    SELECT i.*, r.title as recipe_title
    FROM diabetic_meal_plan_items i
    LEFT JOIN diabetic_recipes r ON r.recipe_id = i.recipe_id
    WHERE i.plan_id = ?
  `).all(plan_id);

  const items = itemRows
    .map(planItemRow)
    .filter(Boolean)
    .sort((a, b) => {
      const dayDiff = (DAY_INDEX.get(a.day_of_week) ?? 99) - (DAY_INDEX.get(b.day_of_week) ?? 99);
      if (dayDiff) return dayDiff;
      const slotDiff = (SLOT_INDEX.get(a.meal_slot) ?? 99) - (SLOT_INDEX.get(b.meal_slot) ?? 99);
      if (slotDiff) return slotDiff;
      if ((a.position ?? 0) !== (b.position ?? 0)) return (a.position ?? 0) - (b.position ?? 0);
      return (a.id ?? 0) - (b.id ?? 0);
    });

  return { ...plan, items };
}

export function addRecipeToMealPlan(db, {
  plan_id,
  recipe_id = null,
  day_of_week,
  meal_slot,
  servings = null,
  notes = ""
} = {}) {
  initDiabeticDb(db);
  const id = String(plan_id ?? "").trim();
  if (!id) {
    throw new Error("plan_id is required");
  }
  const day = normalizeDay(day_of_week);
  if (!day) {
    throw new Error("day_of_week is invalid");
  }
  const slot = normalizeSlot(meal_slot);
  if (!slot) {
    throw new Error("meal_slot is invalid");
  }

  const planRow = db.prepare("SELECT plan_id FROM diabetic_meal_plans WHERE plan_id = ?").get(id);
  if (!planRow) {
    throw new Error("Meal plan not found");
  }

  const normalizedRecipeId = String(recipe_id ?? "").trim() || null;
  const nextPositionRow = db.prepare("SELECT COALESCE(MAX(position), -1) AS max_pos FROM diabetic_meal_plan_items WHERE plan_id = ? AND day_of_week = ? AND meal_slot = ?").get(id, day, slot);
  const position = Number(nextPositionRow?.max_pos ?? -1) + 1;

  db.prepare(`
    INSERT INTO diabetic_meal_plan_items (plan_id, recipe_id, day_of_week, meal_slot, servings, notes, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedRecipeId,
    day,
    slot,
    normalizeServings(servings),
    normalizeOptionalText(notes),
    position
  );

  touchMealPlan(db, id);
  const created = db.prepare("SELECT id FROM diabetic_meal_plan_items WHERE plan_id = ? ORDER BY id DESC LIMIT 1").get(id);
  return created?.id ? getMealPlanItem(db, created.id) : null;
}

export function getMealPlanItem(db, itemId) {
  initDiabeticDb(db);
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const row = db.prepare(`
    SELECT i.*, r.title as recipe_title
    FROM diabetic_meal_plan_items i
    LEFT JOIN diabetic_recipes r ON r.recipe_id = i.recipe_id
    WHERE i.id = ?
  `).get(id);
  return planItemRow(row);
}

export function removeMealPlanItem(db, itemId) {
  initDiabeticDb(db);
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const row = db.prepare("SELECT plan_id FROM diabetic_meal_plan_items WHERE id = ?").get(id);
  if (!row?.plan_id) return false;

  db.prepare("DELETE FROM diabetic_meal_plan_items WHERE id = ?").run(id);
  touchMealPlan(db, row.plan_id);
  return true;
}

export function updateMealPlanItem(db, itemId, updates = {}) {
  initDiabeticDb(db);
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("itemId is required");
  }

  const existing = db.prepare("SELECT * FROM diabetic_meal_plan_items WHERE id = ?").get(id);
  if (!existing) {
    throw new Error("Meal plan item not found");
  }

  const day = updates.day_of_week !== undefined ? normalizeDay(updates.day_of_week) : String(existing.day_of_week ?? "").trim().toLowerCase();
  if (!day) {
    throw new Error("day_of_week is invalid");
  }
  const slot = updates.meal_slot !== undefined ? normalizeSlot(updates.meal_slot) : String(existing.meal_slot ?? "").trim().toLowerCase();
  if (!slot) {
    throw new Error("meal_slot is invalid");
  }

  const recipe_id = updates.recipe_id !== undefined ? (String(updates.recipe_id ?? "").trim() || null) : (String(existing.recipe_id ?? "").trim() || null);
  const servings = updates.servings !== undefined ? normalizeServings(updates.servings) : (existing.servings === null || existing.servings === undefined ? null : Number(existing.servings));
  const notes = updates.notes !== undefined ? normalizeOptionalText(updates.notes) : (String(existing.notes ?? "").trim() || null);
  const position = updates.position !== undefined
    ? (Number.isFinite(Number(updates.position)) ? Math.max(0, Math.round(Number(updates.position))) : Number(existing.position ?? 0))
    : Number(existing.position ?? 0);

  db.prepare(`
    UPDATE diabetic_meal_plan_items
    SET recipe_id = ?,
        day_of_week = ?,
        meal_slot = ?,
        servings = ?,
        notes = ?,
        position = ?
    WHERE id = ?
  `).run(recipe_id, day, slot, servings, notes, position, id);

  touchMealPlan(db, existing.plan_id);
  return getMealPlanItem(db, id);
}

export { DAYS as DIABETIC_MEAL_PLAN_DAYS, SLOTS as DIABETIC_MEAL_PLAN_SLOTS };

