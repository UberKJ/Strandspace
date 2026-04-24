// DiabeticSpace backup export/import (local-first).
// Produces a versioned JSON payload that can be restored safely.

import { initDiabeticDb } from "./schema.js";
import { safeJsonParse } from "./normalize.js";

function isSensitiveSettingKey(key) {
  const text = String(key ?? "").toLowerCase();
  return text.includes("key") || text.includes("token") || text.includes("secret") || text.includes("password");
}

function parseRecipeRowForBackup(row) {
  if (!row) return null;
  return {
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
    public_share_id: String(row.public_share_id ?? "").trim() || null,
    share_status: String(row.share_status ?? "").trim() || "private",
    license_note: String(row.license_note ?? "").trim() || null,
    author_name: String(row.author_name ?? "").trim() || null,
    updated_at: String(row.updated_at ?? "").trim() || null,
    created_at: String(row.created_at ?? "").trim() || null
  };
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeBoolean(value) {
  return Boolean(value);
}

export function exportDiabeticBackup(db) {
  initDiabeticDb(db);

  const recipes = db.prepare("SELECT * FROM diabetic_recipes ORDER BY created_at ASC").all()
    .map(parseRecipeRowForBackup)
    .filter(Boolean);

  const mealPlans = db.prepare("SELECT * FROM diabetic_meal_plans ORDER BY week_start ASC, created_at ASC").all().map((row) => ({
    plan_id: String(row.plan_id ?? "").trim(),
    week_start: String(row.week_start ?? "").trim(),
    title: normalizeText(row.title),
    notes: normalizeText(row.notes),
    created_at: normalizeText(row.created_at),
    updated_at: normalizeText(row.updated_at)
  }));
  const mealPlanItems = db.prepare("SELECT * FROM diabetic_meal_plan_items ORDER BY plan_id ASC, id ASC").all().map((row) => ({
    id: Number(row.id ?? 0),
    plan_id: String(row.plan_id ?? "").trim(),
    recipe_id: normalizeText(row.recipe_id),
    day_of_week: String(row.day_of_week ?? "").trim(),
    meal_slot: String(row.meal_slot ?? "").trim(),
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    notes: normalizeText(row.notes),
    position: Number(row.position ?? 0),
    created_at: normalizeText(row.created_at)
  }));

  const shoppingLists = db.prepare("SELECT * FROM diabetic_shopping_lists ORDER BY created_at ASC").all().map((row) => ({
    list_id: String(row.list_id ?? "").trim(),
    source_type: normalizeText(row.source_type),
    source_id: normalizeText(row.source_id),
    title: String(row.title ?? "").trim(),
    created_at: normalizeText(row.created_at),
    updated_at: normalizeText(row.updated_at)
  }));
  const shoppingItems = db.prepare("SELECT * FROM diabetic_shopping_list_items ORDER BY list_id ASC, id ASC").all().map((row) => ({
    id: Number(row.id ?? 0),
    list_id: String(row.list_id ?? "").trim(),
    name: String(row.name ?? "").trim(),
    amount: normalizeText(row.amount),
    unit: normalizeText(row.unit),
    category: normalizeText(row.category),
    checked: Number(row.checked ?? 0) ? 1 : 0,
    recipe_id: normalizeText(row.recipe_id),
    notes: normalizeText(row.notes),
    position: Number(row.position ?? 0),
    created_at: normalizeText(row.created_at)
  }));

  const users = db.prepare("SELECT user_id, display_name, role, created_at, updated_at FROM diabetic_users ORDER BY created_at ASC").all().map((row) => ({
    user_id: String(row.user_id ?? "").trim(),
    display_name: String(row.display_name ?? "").trim(),
    role: normalizeText(row.role) || "owner",
    created_at: normalizeText(row.created_at),
    updated_at: normalizeText(row.updated_at)
  }));

  const userSettings = db.prepare("SELECT user_id, key, value, updated_at FROM diabetic_user_settings ORDER BY user_id ASC, key ASC").all().map((row) => ({
    user_id: String(row.user_id ?? "").trim(),
    key: String(row.key ?? "").trim(),
    value: normalizeText(row.value),
    updated_at: normalizeText(row.updated_at)
  }));

  const providerSettingsRows = db.prepare("SELECT provider_id, key, value, updated_at FROM diabetic_llm_provider_settings ORDER BY provider_id ASC, key ASC").all();
  const providerSettings = providerSettingsRows
    .filter((row) => !isSensitiveSettingKey(row.key))
    .map((row) => ({
      provider_id: String(row.provider_id ?? "").trim(),
      key: String(row.key ?? "").trim(),
      value: normalizeText(row.value),
      updated_at: normalizeText(row.updated_at)
    }));

  return {
    app: "DiabeticSpace",
    version: 1,
    exported_at: new Date().toISOString(),
    recipes,
    meal_plans: mealPlans,
    meal_plan_items: mealPlanItems,
    shopping_lists: shoppingLists,
    shopping_list_items: shoppingItems,
    settings: {
      users,
      user_settings: userSettings,
      provider_settings: providerSettings
    }
  };
}

export function importDiabeticBackup(db, backup = {}, { overwrite = false, dry_run = false } = {}) {
  initDiabeticDb(db);

  const payload = backup && typeof backup === "object" ? backup : {};
  if (String(payload.app ?? "") !== "DiabeticSpace") {
    throw new Error("Invalid backup: app must be DiabeticSpace");
  }
  if (Number(payload.version ?? 0) !== 1) {
    throw new Error("Invalid backup: unsupported version");
  }

  const summary = {
    dry_run: normalizeBoolean(dry_run),
    overwrite: normalizeBoolean(overwrite),
    recipes: { added: 0, updated: 0, skipped: 0 },
    meal_plans: { added: 0, updated: 0, skipped: 0, items_added: 0, items_deleted: 0 },
    shopping_lists: { added: 0, updated: 0, skipped: 0, items_added: 0, items_deleted: 0 },
    users: { added: 0, updated: 0, skipped: 0 },
    user_settings: { added: 0, updated: 0, skipped: 0 },
    provider_settings: { added: 0, updated: 0, skipped: 0 }
  };

  const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
  for (const recipe of recipes) {
    const recipe_id = String(recipe?.recipe_id ?? "").trim();
    const title = String(recipe?.title ?? "").trim();
    if (!recipe_id || !title) continue;
    const existing = db.prepare("SELECT id FROM diabetic_recipes WHERE recipe_id = ?").get(recipe_id);
    if (existing?.id) {
      if (!overwrite) {
        summary.recipes.skipped += 1;
        continue;
      }
      summary.recipes.updated += 1;
    } else {
      summary.recipes.added += 1;
    }

    if (!dry_run) {
      db.prepare(`
        INSERT INTO diabetic_recipes (
          recipe_id, title, meal_type, description, ingredients, substitutes, instructions,
          servings, serving_notes, tags, gi_notes, trigger_words, image_url, source,
          recall_count, rating, favorite, last_cooked_at,
          public_share_id, share_status, license_note, author_name,
          updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(recipe_id) DO UPDATE SET
          title = excluded.title,
          meal_type = excluded.meal_type,
          description = excluded.description,
          ingredients = excluded.ingredients,
          substitutes = excluded.substitutes,
          instructions = excluded.instructions,
          servings = excluded.servings,
          serving_notes = excluded.serving_notes,
          tags = excluded.tags,
          gi_notes = excluded.gi_notes,
          trigger_words = excluded.trigger_words,
          image_url = excluded.image_url,
          source = excluded.source,
          recall_count = excluded.recall_count,
          rating = excluded.rating,
          favorite = excluded.favorite,
          last_cooked_at = excluded.last_cooked_at,
          public_share_id = excluded.public_share_id,
          share_status = excluded.share_status,
          license_note = excluded.license_note,
          author_name = excluded.author_name,
          updated_at = excluded.updated_at
      `).run(
        recipe_id,
        title,
        normalizeText(recipe.meal_type),
        normalizeText(recipe.description),
        JSON.stringify(Array.isArray(recipe.ingredients) ? recipe.ingredients : []),
        JSON.stringify(Array.isArray(recipe.substitutes) ? recipe.substitutes : []),
        JSON.stringify(Array.isArray(recipe.instructions) ? recipe.instructions : []),
        recipe.servings === null || recipe.servings === undefined ? null : Number(recipe.servings),
        normalizeText(recipe.serving_notes),
        JSON.stringify(Array.isArray(recipe.tags) ? recipe.tags : []),
        normalizeText(recipe.gi_notes),
        JSON.stringify(Array.isArray(recipe.trigger_words) ? recipe.trigger_words : []),
        normalizeText(recipe.image_url),
        normalizeText(recipe.source),
        Number(recipe.recall_count ?? 0),
        Number(recipe.rating ?? 0),
        Number(recipe.favorite ?? 0) ? 1 : 0,
        normalizeText(recipe.last_cooked_at),
        normalizeText(recipe.public_share_id),
        normalizeText(recipe.share_status) || "private",
        normalizeText(recipe.license_note),
        normalizeText(recipe.author_name),
        normalizeText(recipe.updated_at) ?? new Date().toISOString(),
        normalizeText(recipe.created_at)
      );
    }
  }

  const plans = Array.isArray(payload.meal_plans) ? payload.meal_plans : [];
  const items = Array.isArray(payload.meal_plan_items) ? payload.meal_plan_items : [];
  for (const plan of plans) {
    const plan_id = String(plan?.plan_id ?? "").trim();
    const week_start = String(plan?.week_start ?? "").trim();
    if (!plan_id || !week_start) continue;
    const existing = db.prepare("SELECT id FROM diabetic_meal_plans WHERE plan_id = ?").get(plan_id);
    if (existing?.id) {
      if (!overwrite) {
        summary.meal_plans.skipped += 1;
        continue;
      }
      summary.meal_plans.updated += 1;
    } else {
      summary.meal_plans.added += 1;
    }

    if (!dry_run) {
      db.prepare(`
        INSERT INTO diabetic_meal_plans (plan_id, week_start, title, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
        ON CONFLICT(plan_id) DO UPDATE SET
          week_start = excluded.week_start,
          title = excluded.title,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `).run(
        plan_id,
        week_start,
        normalizeText(plan.title),
        normalizeText(plan.notes),
        normalizeText(plan.created_at),
        normalizeText(plan.updated_at) ?? new Date().toISOString()
      );

      if (existing?.id && overwrite) {
        const deleted = db.prepare("DELETE FROM diabetic_meal_plan_items WHERE plan_id = ?").run(plan_id);
        summary.meal_plans.items_deleted += Number(deleted.changes ?? 0);
      }
    }

    const planItems = items.filter((item) => String(item?.plan_id ?? "").trim() === plan_id);
    summary.meal_plans.items_added += planItems.length;
    if (!dry_run) {
      for (const item of planItems) {
        db.prepare(`
          INSERT INTO diabetic_meal_plan_items (plan_id, recipe_id, day_of_week, meal_slot, servings, notes, position, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `).run(
          plan_id,
          normalizeText(item.recipe_id),
          String(item.day_of_week ?? "").trim(),
          String(item.meal_slot ?? "").trim(),
          item.servings === null || item.servings === undefined ? null : Number(item.servings),
          normalizeText(item.notes),
          Number(item.position ?? 0),
          normalizeText(item.created_at)
        );
      }
    }
  }

  const lists = Array.isArray(payload.shopping_lists) ? payload.shopping_lists : [];
  const listItems = Array.isArray(payload.shopping_list_items) ? payload.shopping_list_items : [];
  for (const list of lists) {
    const list_id = String(list?.list_id ?? "").trim();
    const title = String(list?.title ?? "").trim();
    if (!list_id || !title) continue;
    const existing = db.prepare("SELECT id FROM diabetic_shopping_lists WHERE list_id = ?").get(list_id);
    if (existing?.id) {
      if (!overwrite) {
        summary.shopping_lists.skipped += 1;
        continue;
      }
      summary.shopping_lists.updated += 1;
    } else {
      summary.shopping_lists.added += 1;
    }

    if (!dry_run) {
      db.prepare(`
        INSERT INTO diabetic_shopping_lists (list_id, source_type, source_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
        ON CONFLICT(list_id) DO UPDATE SET
          source_type = excluded.source_type,
          source_id = excluded.source_id,
          title = excluded.title,
          updated_at = excluded.updated_at
      `).run(
        list_id,
        normalizeText(list.source_type),
        normalizeText(list.source_id),
        title,
        normalizeText(list.created_at),
        normalizeText(list.updated_at) ?? new Date().toISOString()
      );

      if (existing?.id && overwrite) {
        const deleted = db.prepare("DELETE FROM diabetic_shopping_list_items WHERE list_id = ?").run(list_id);
        summary.shopping_lists.items_deleted += Number(deleted.changes ?? 0);
      }
    }

    const itemsForList = listItems.filter((item) => String(item?.list_id ?? "").trim() === list_id);
    summary.shopping_lists.items_added += itemsForList.length;
    if (!dry_run) {
      for (const item of itemsForList) {
        db.prepare(`
          INSERT INTO diabetic_shopping_list_items (list_id, name, amount, unit, category, checked, recipe_id, notes, position, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `).run(
          list_id,
          String(item.name ?? "").trim(),
          normalizeText(item.amount),
          normalizeText(item.unit),
          normalizeText(item.category),
          Number(item.checked ?? 0) ? 1 : 0,
          normalizeText(item.recipe_id),
          normalizeText(item.notes),
          Number(item.position ?? 0),
          normalizeText(item.created_at)
        );
      }
    }
  }

  const settings = payload.settings && typeof payload.settings === "object" ? payload.settings : {};

  const users = Array.isArray(settings.users) ? settings.users : [];
  for (const user of users) {
    const user_id = String(user?.user_id ?? "").trim();
    const display_name = String(user?.display_name ?? "").trim();
    if (!user_id || !display_name) continue;
    const existing = db.prepare("SELECT id FROM diabetic_users WHERE user_id = ?").get(user_id);
    if (existing?.id) {
      if (!overwrite) {
        summary.users.skipped += 1;
        continue;
      }
      summary.users.updated += 1;
    } else {
      summary.users.added += 1;
    }
    if (!dry_run) {
      db.prepare(`
        INSERT INTO diabetic_users (user_id, display_name, role, created_at, updated_at)
        VALUES (?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
        ON CONFLICT(user_id) DO UPDATE SET
          display_name = excluded.display_name,
          role = excluded.role,
          updated_at = excluded.updated_at
      `).run(
        user_id,
        display_name,
        normalizeText(user.role) || "owner",
        normalizeText(user.created_at),
        normalizeText(user.updated_at) ?? new Date().toISOString()
      );
    }
  }

  const userSettings = Array.isArray(settings.user_settings) ? settings.user_settings : [];
  for (const setting of userSettings) {
    const user_id = String(setting?.user_id ?? "").trim();
    const key = String(setting?.key ?? "").trim();
    if (!user_id || !key) continue;
    const existing = db.prepare("SELECT id FROM diabetic_user_settings WHERE user_id = ? AND key = ?").get(user_id, key);
    if (existing?.id) {
      if (!overwrite) {
        summary.user_settings.skipped += 1;
        continue;
      }
      summary.user_settings.updated += 1;
    } else {
      summary.user_settings.added += 1;
    }
    if (!dry_run) {
      db.prepare(`
        INSERT INTO diabetic_user_settings (user_id, key, value, updated_at)
        VALUES (?, ?, ?, COALESCE(?, datetime('now')))
        ON CONFLICT(user_id, key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(
        user_id,
        key,
        normalizeText(setting.value),
        normalizeText(setting.updated_at) ?? new Date().toISOString()
      );
    }
  }

  const providerSettings = Array.isArray(settings.provider_settings) ? settings.provider_settings : [];
  for (const setting of providerSettings) {
    const provider_id = String(setting?.provider_id ?? "").trim();
    const key = String(setting?.key ?? "").trim();
    if (!provider_id || !key) continue;
    if (isSensitiveSettingKey(key)) continue;
    const existing = db.prepare("SELECT id FROM diabetic_llm_provider_settings WHERE provider_id = ? AND key = ?").get(provider_id, key);
    if (existing?.id) {
      if (!overwrite) {
        summary.provider_settings.skipped += 1;
        continue;
      }
      summary.provider_settings.updated += 1;
    } else {
      summary.provider_settings.added += 1;
    }
    if (!dry_run) {
      db.prepare(`
        INSERT INTO diabetic_llm_provider_settings (provider_id, key, value, updated_at)
        VALUES (?, ?, ?, COALESCE(?, datetime('now')))
        ON CONFLICT(provider_id, key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(
        provider_id,
        key,
        normalizeText(setting.value),
        normalizeText(setting.updated_at) ?? new Date().toISOString()
      );
    }
  }

  return summary;
}
