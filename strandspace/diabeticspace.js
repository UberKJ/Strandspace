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
    source
  };
}

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
    source: String(row.source ?? "").trim() || null,
    recall_count: Number(row.recall_count ?? 0),
    created_at: String(row.created_at ?? "").trim() || null
  };
}

function parseSessionRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id ?? 0),
    session_id: String(row.session_id ?? "").trim(),
    stage: String(row.stage ?? "").trim(),
    meal_type: String(row.meal_type ?? "").trim() || null,
    goal: String(row.goal ?? "").trim() || null,
    include_items: safeJsonParse(row.include_items, []),
    avoid_items: safeJsonParse(row.avoid_items, []),
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    extra_notes: String(row.extra_notes ?? "").trim() || null,
    original_query: String(row.original_query ?? "").trim() || null,
    created_at: String(row.created_at ?? "").trim() || null,
    updated_at: String(row.updated_at ?? "").trim() || null
  };
}

export function initDiabeticDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diabetic_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      meal_type TEXT,
      description TEXT,
      ingredients TEXT,
      substitutes TEXT,
      instructions TEXT,
      servings INTEGER,
      serving_notes TEXT,
      tags TEXT,
      gi_notes TEXT,
      trigger_words TEXT,
      source TEXT,
      recall_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_meal_type ON diabetic_recipes(meal_type);
    CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_recall_count ON diabetic_recipes(recall_count DESC);
    CREATE TABLE IF NOT EXISTS diabetic_builder_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      stage TEXT NOT NULL,
      meal_type TEXT,
      goal TEXT,
      include_items TEXT,
      avoid_items TEXT,
      servings INTEGER,
      extra_notes TEXT,
      original_query TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_diabetic_builder_sessions_updated ON diabetic_builder_sessions(updated_at DESC);
  `);
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
    ? db.prepare("SELECT recipe_id, title, meal_type, servings, tags FROM diabetic_recipes WHERE lower(meal_type) = ? ORDER BY created_at DESC, title ASC").all(meal_type)
    : db.prepare("SELECT recipe_id, title, meal_type, servings, tags FROM diabetic_recipes ORDER BY created_at DESC, title ASC").all();
  return rows.map((row) => ({
    recipe_id: String(row.recipe_id ?? "").trim(),
    title: String(row.title ?? "").trim(),
    meal_type: String(row.meal_type ?? "").trim() || null,
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    tags: safeJsonParse(row.tags, [])
  }));
}

export function saveDiabeticRecipe(db, recipeObj = {}) {
  initDiabeticDb(db);
  const normalized = normalizeRecipeInput(recipeObj);
  const existing = db.prepare("SELECT id, recall_count, created_at FROM diabetic_recipes WHERE recipe_id = ?").get(normalized.recipe_id);

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
          source = ?
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
      normalized.source,
      normalized.recipe_id
    );
  } else {
    db.prepare(`
      INSERT INTO diabetic_recipes (
        recipe_id, title, meal_type, description, ingredients, substitutes, instructions,
        servings, serving_notes, tags, gi_notes, trigger_words, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      normalized.source
    );
  }

  return getDiabeticRecipeById(db, normalized.recipe_id);
}

function scoreRecipe(recipe, queryTokens, queryText) {
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
  score += titleHits * 3;
  score += tagHits * 4;

  const normalizedQuery = String(queryText ?? "").toLowerCase().trim();
  if (normalizedQuery && recipe.title.toLowerCase().includes(normalizedQuery.slice(0, Math.min(18, normalizedQuery.length)))) {
    score += 4;
  }

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
    const score = scoreRecipe(recipe, queryTokens, q);
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

export function saveDiabeticBuilderSession(db, sessionObj = {}) {
  initDiabeticDb(db);
  const session_id = String(sessionObj.session_id ?? "").trim();
  const stage = String(sessionObj.stage ?? "").trim();
  if (!session_id) {
    throw new Error("session_id is required");
  }
  if (!stage) {
    throw new Error("stage is required");
  }

  const include_items = uniqueStrings(Array.isArray(sessionObj.include_items) ? sessionObj.include_items : [], 40);
  const avoid_items = uniqueStrings(Array.isArray(sessionObj.avoid_items) ? sessionObj.avoid_items : [], 40);

  db.prepare(`
    INSERT INTO diabetic_builder_sessions (
      session_id, stage, meal_type, goal, include_items, avoid_items, servings, extra_notes, original_query
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      stage = excluded.stage,
      meal_type = excluded.meal_type,
      goal = excluded.goal,
      include_items = excluded.include_items,
      avoid_items = excluded.avoid_items,
      servings = excluded.servings,
      extra_notes = excluded.extra_notes,
      original_query = excluded.original_query,
      updated_at = datetime('now')
  `).run(
    session_id,
    stage,
    String(sessionObj.meal_type ?? "").trim() || null,
    String(sessionObj.goal ?? "").trim() || null,
    JSON.stringify(include_items),
    JSON.stringify(avoid_items),
    Number.isFinite(Number(sessionObj.servings)) ? Math.max(1, Math.round(Number(sessionObj.servings))) : null,
    String(sessionObj.extra_notes ?? "").trim() || null,
    String(sessionObj.original_query ?? "").trim() || null
  );

  return getDiabeticBuilderSession(db, session_id);
}

export function getDiabeticBuilderSession(db, sessionId = "") {
  initDiabeticDb(db);
  const session_id = String(sessionId ?? "").trim();
  if (!session_id) return null;
  const row = db.prepare("SELECT * FROM diabetic_builder_sessions WHERE session_id = ?").get(session_id);
  return parseSessionRow(row);
}

export function deleteDiabeticBuilderSession(db, sessionId = "") {
  initDiabeticDb(db);
  const session_id = String(sessionId ?? "").trim();
  if (!session_id) return false;
  db.prepare("DELETE FROM diabetic_builder_sessions WHERE session_id = ?").run(session_id);
  return true;
}

export function seedDiabeticRecipes(db) {
  initDiabeticDb(db);

  const seeds = [
    {
      recipe_id: "cauliflower-fried-rice",
      title: "Cauliflower Fried Rice (Diabetic-Friendly)",
      meal_type: "dinner",
      description: "A fast, low-carb fried rice swap using cauliflower rice and plenty of protein-friendly add-ins.",
      ingredients: [
        { name: "cauliflower rice", amount: 4, unit: "cups", note: "fresh or frozen, thawed and patted dry" },
        { name: "eggs", amount: 2, unit: "large", note: "beaten" },
        { name: "chicken breast", amount: 8, unit: "oz", note: "diced" },
        { name: "mixed vegetables", amount: 1, unit: "cup", note: "peas/carrots blend or chopped stir-fry veg" },
        { name: "green onions", amount: 3, unit: "stalks", note: "sliced" },
        { name: "soy sauce", amount: 2, unit: "tbsp", note: "or coconut aminos" },
        { name: "sesame oil", amount: 1, unit: "tsp", note: "optional, for aroma" }
      ],
      substitutes: [
        { original: "soy sauce", substitute: "coconut aminos", reason: "lower sodium option with similar savory flavor" }
      ],
      instructions: [
        "Heat a large skillet over medium-high heat. Add a little oil, then scramble the eggs until just set. Remove to a plate.",
        "In the same skillet, cook diced chicken until browned and cooked through.",
        "Add mixed vegetables and cook 2–3 minutes until tender-crisp.",
        "Add cauliflower rice and stir-fry 4–5 minutes, letting moisture cook off.",
        "Stir in soy sauce and sesame oil, then fold the eggs back in.",
        "Top with green onions and serve hot."
      ],
      servings: 3,
      serving_notes: "Pair with a side salad if you want extra volume without extra carbs.",
      tags: ["low-carb", "dinner", "stir-fry", "high-protein"],
      gi_notes: "Cauliflower rice keeps the meal low GI and reduces post-meal glucose spikes versus white rice.",
      source: "seed"
    },
    {
      recipe_id: "almond-flour-pancakes",
      title: "Almond Flour Pancakes",
      meal_type: "breakfast",
      description: "Fluffy pancakes with almond flour for a lower-carb, higher-protein breakfast.",
      ingredients: [
        { name: "almond flour", amount: 1, unit: "cup", note: "fine blanched" },
        { name: "eggs", amount: 2, unit: "large", note: "" },
        { name: "baking powder", amount: 1.5, unit: "tsp", note: "" },
        { name: "unsweetened almond milk", amount: 0.33, unit: "cup", note: "add a splash more if batter is too thick" },
        { name: "vanilla extract", amount: 1, unit: "tsp", note: "" },
        { name: "cinnamon", amount: 0.5, unit: "tsp", note: "optional" },
        { name: "butter or neutral oil", amount: 1, unit: "tsp", note: "for the pan" }
      ],
      substitutes: [
        { original: "almond milk", substitute: "unsweetened soy milk", reason: "similar carb profile with a bit more protein" }
      ],
      instructions: [
        "Whisk almond flour, baking powder, and cinnamon in a bowl.",
        "Whisk eggs, almond milk, and vanilla in a separate bowl, then combine with dry ingredients.",
        "Let batter rest 2 minutes to thicken slightly.",
        "Heat a nonstick pan over medium heat and lightly grease.",
        "Cook pancakes 2–3 minutes per side until golden and set.",
        "Serve with berries or a sugar-free syrup if desired."
      ],
      servings: 2,
      serving_notes: "Top with berries and a dollop of Greek yogurt for more protein.",
      tags: ["breakfast", "low-carb", "gluten-free", "meal-prep"],
      gi_notes: "Almond flour is low GI; keep toppings low sugar to maintain blood-sugar friendliness.",
      source: "seed"
    },
    {
      recipe_id: "greek-yogurt-berry-parfait",
      title: "Greek Yogurt Berry Parfait",
      meal_type: "snack",
      description: "A quick high-protein snack with berries and crunchy seeds for steady energy.",
      ingredients: [
        { name: "plain Greek yogurt", amount: 1, unit: "cup", note: "unsweetened" },
        { name: "mixed berries", amount: 0.5, unit: "cup", note: "fresh or frozen (thawed)" },
        { name: "chia seeds", amount: 1, unit: "tbsp", note: "" },
        { name: "walnuts", amount: 2, unit: "tbsp", note: "chopped" },
        { name: "cinnamon", amount: 0.25, unit: "tsp", note: "optional" },
        { name: "vanilla extract", amount: 0.25, unit: "tsp", note: "optional" }
      ],
      substitutes: [
        { original: "walnuts", substitute: "pumpkin seeds", reason: "nut-free crunch option" }
      ],
      instructions: [
        "Stir vanilla and cinnamon into the Greek yogurt.",
        "Layer yogurt and berries in a bowl or jar.",
        "Sprinkle chia seeds and walnuts on top.",
        "Let sit 5 minutes if you want a thicker texture.",
        "Serve immediately or refrigerate up to 24 hours."
      ],
      servings: 1,
      serving_notes: "If using frozen berries, drain extra liquid to avoid a watery parfait.",
      tags: ["snack", "high-protein", "quick", "no-cook"],
      gi_notes: "Berries are generally lower GI; Greek yogurt adds protein to blunt glucose response.",
      source: "seed"
    },
    {
      recipe_id: "baked-lemon-herb-salmon",
      title: "Baked Lemon Herb Salmon",
      meal_type: "dinner",
      description: "Simple baked salmon with lemon, herbs, and a side of roasted vegetables.",
      ingredients: [
        { name: "salmon fillets", amount: 2, unit: "fillets", note: "about 6 oz each" },
        { name: "lemon", amount: 1, unit: "whole", note: "zest + juice" },
        { name: "olive oil", amount: 1, unit: "tbsp", note: "" },
        { name: "garlic", amount: 2, unit: "cloves", note: "minced" },
        { name: "dried dill", amount: 1, unit: "tsp", note: "or fresh dill" },
        { name: "salt", amount: 0.25, unit: "tsp", note: "to taste" },
        { name: "black pepper", amount: 0.25, unit: "tsp", note: "to taste" }
      ],
      substitutes: [
        { original: "salmon", substitute: "cod or halibut", reason: "similar bake method with a milder flavor" }
      ],
      instructions: [
        "Heat oven to 400°F (205°C). Line a baking sheet with foil or parchment.",
        "Place salmon on the sheet. Mix olive oil, lemon juice, zest, garlic, dill, salt, and pepper.",
        "Brush lemon-herb mixture over salmon.",
        "Bake 10–14 minutes until salmon flakes easily.",
        "Rest 2 minutes, then serve with non-starchy vegetables."
      ],
      servings: 2,
      serving_notes: "Add a side of roasted broccoli or asparagus for a low-carb plate.",
      tags: ["dinner", "high-protein", "low-carb", "one-pan"],
      gi_notes: "Fish + non-starchy vegetables is typically low GI and supports stable post-meal glucose.",
      source: "seed"
    },
    {
      recipe_id: "dark-chocolate-avocado-mousse",
      title: "Dark Chocolate Avocado Mousse",
      meal_type: "dessert",
      description: "Creamy chocolate mousse sweetened lightly, using avocado for healthy fats and texture.",
      ingredients: [
        { name: "ripe avocado", amount: 1, unit: "large", note: "pitted" },
        { name: "unsweetened cocoa powder", amount: 3, unit: "tbsp", note: "" },
        { name: "unsweetened almond milk", amount: 2, unit: "tbsp", note: "add as needed" },
        { name: "vanilla extract", amount: 0.5, unit: "tsp", note: "" },
        { name: "salt", amount: 1, unit: "pinch", note: "" },
        { name: "monk fruit sweetener", amount: 1, unit: "tbsp", note: "adjust to taste" },
        { name: "dark chocolate", amount: 1, unit: "tbsp", note: "85%+, grated (optional)" }
      ],
      substitutes: [
        { original: "monk fruit sweetener", substitute: "erythritol", reason: "another low-glycemic sweetener option" }
      ],
      instructions: [
        "Blend avocado, cocoa, sweetener, vanilla, salt, and almond milk until smooth.",
        "Taste and adjust sweetness; add a splash more almond milk for a lighter mousse.",
        "Spoon into small bowls and chill 20–30 minutes.",
        "Top with grated dark chocolate or a few berries if desired."
      ],
      servings: 2,
      serving_notes: "Keep portions modest; even low-sugar desserts can affect blood sugar depending on total carbs.",
      tags: ["dessert", "low-sugar", "low-carb", "no-bake"],
      gi_notes: "Uses low-glycemic sweetener; avocado fat can help slow glucose absorption compared to sugar-based desserts.",
      source: "seed"
    },
    {
      recipe_id: "zucchini-turkey-meatballs",
      title: "Zucchini Turkey Meatballs",
      meal_type: "lunch",
      description: "Juicy turkey meatballs with grated zucchini for moisture, great for meal prep.",
      ingredients: [
        { name: "ground turkey", amount: 1, unit: "lb", note: "" },
        { name: "zucchini", amount: 1, unit: "cup", note: "grated and squeezed dry" },
        { name: "egg", amount: 1, unit: "large", note: "" },
        { name: "parmesan cheese", amount: 0.25, unit: "cup", note: "optional" },
        { name: "garlic powder", amount: 1, unit: "tsp", note: "" },
        { name: "Italian seasoning", amount: 1, unit: "tsp", note: "" },
        { name: "salt", amount: 0.25, unit: "tsp", note: "to taste" }
      ],
      substitutes: [
        { original: "parmesan", substitute: "nutritional yeast", reason: "dairy-free savory flavor option" }
      ],
      instructions: [
        "Heat oven to 400°F (205°C). Line a baking sheet with parchment.",
        "Mix ground turkey, grated zucchini, egg, seasonings, and parmesan until just combined.",
        "Form into 12 meatballs and place on the sheet.",
        "Bake 15–18 minutes until cooked through.",
        "Serve with marinara over zucchini noodles or alongside a salad."
      ],
      servings: 4,
      serving_notes: "For a lower-carb plate, serve with zucchini noodles instead of pasta.",
      tags: ["lunch", "meal-prep", "high-protein", "low-carb"],
      gi_notes: "High-protein meatballs paired with non-starchy sides keeps the meal lower GI than pasta-based combos.",
      source: "seed"
    }
  ];

  for (const seed of seeds) {
    const existing = db.prepare("SELECT id FROM diabetic_recipes WHERE recipe_id = ?").get(String(seed.recipe_id));
    if (existing) {
      continue;
    }
    saveDiabeticRecipe(db, seed);
  }
}
