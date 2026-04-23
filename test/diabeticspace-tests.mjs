import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  initDiabeticDb,
  seedDiabeticRecipes,
  listDiabeticRecipes,
  recallDiabeticRecipe,
  saveDiabeticRecipe,
  getDiabeticRecipeById,
  getDiabeticBuilderSession
} from "../strandspace/diabeticspace.js";
import { __setDiabeticAssistMock } from "../strandspace/diabetic-assist.js";

function buildMockRecipe({
  recipe_id = "mock-recipe",
  title = "Mock Recipe",
  meal_type = "dinner"
} = {}) {
  return {
    recipe_id,
    title,
    meal_type,
    description: "A mock diabetic-friendly recipe for tests.",
    ingredients: [
      { name: "chicken", amount: 8, unit: "oz", note: "" },
      { name: "broccoli", amount: 2, unit: "cups", note: "" },
      { name: "olive oil", amount: 1, unit: "tbsp", note: "" },
      { name: "garlic", amount: 2, unit: "cloves", note: "" },
      { name: "salt", amount: 0.25, unit: "tsp", note: "" }
    ],
    substitutes: [],
    instructions: [
      "Cook the chicken.",
      "Add broccoli and season.",
      "Serve."
    ],
    servings: 2,
    serving_notes: "Test-only.",
    tags: ["test", "low-carb"],
    gi_notes: "Low GI because it's mostly protein + non-starchy veg."
  };
}

export async function registerDiabeticspaceTests({
  check,
  withServer,
  postJson,
  tempDatabasePath
} = {}) {
  if (typeof check !== "function" || typeof withServer !== "function") {
    throw new Error("registerDiabeticspaceTests requires { check, withServer }");
  }

  await check("seedDiabeticRecipes creates seeds", async () => {
    const db = new DatabaseSync(tempDatabasePath);
    initDiabeticDb(db);
    seedDiabeticRecipes(db);
    const recipes = listDiabeticRecipes(db, "");
    assert.ok(recipes.length >= 6);
    assert.ok(recipes.some((r) => r.recipe_id === "cauliflower-fried-rice"));
    db.close();
  });

  await check("running seedDiabeticRecipes twice does not duplicate rows", async () => {
    const db = new DatabaseSync(tempDatabasePath);
    initDiabeticDb(db);
    seedDiabeticRecipes(db);
    seedDiabeticRecipes(db);
    const recipes = listDiabeticRecipes(db, "");
    const ids = new Set(recipes.map((r) => r.recipe_id));
    assert.equal(ids.size, recipes.length);
    db.close();
  });

  await check("GET /api/diabetic/recipes returns seeded recipes", async () => {
    await withServer(async (address) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipes`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
      assert.ok(recipes.length >= 6);
      assert.ok(recipes.some((r) => r.recipe_id === "almond-flour-pancakes"));
    });
  });

  await check("GET /api/diabetic/recipes?meal_type=dinner returns only dinner recipes", async () => {
    await withServer(async (address) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipes?meal_type=dinner`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
      assert.ok(recipes.length >= 1);
      assert.ok(recipes.every((r) => String(r.meal_type ?? "").toLowerCase() === "dinner"));
    });
  });

  await check("GET /api/diabetic/search?q=salmon returns matches array and count", async () => {
    await withServer(async (address) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/search?q=salmon`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.query, "salmon");
      assert.ok(Array.isArray(payload.matches));
      assert.equal(payload.count, payload.matches.length);
      assert.ok(payload.matches.length >= 1);
    });
  });

  await check("GET /api/diabetic/search returns ordered likely matches", async () => {
    await withServer(async (address) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/search?q=salmon%20dinner`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      const matches = Array.isArray(payload.matches) ? payload.matches : [];
      assert.ok(matches.length >= 1);
      assert.equal(matches[0].recipe_id, "baked-lemon-herb-salmon");
      assert.ok(Number(matches[0].match_score) > 0);
    });
  });

  await check("GET /api/diabetic/search with no good matches returns empty array", async () => {
    await withServer(async (address) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/search?q=zxqv-not-a-food`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.ok(Array.isArray(payload.matches));
      assert.equal(payload.matches.length, 0);
      assert.equal(payload.count, 0);
    });
  });

  await check("POST /api/diabetic/search-create with use_ai=false returns local matches and recipe=null", async () => {
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/search-create`, {
        query: "salmon",
        use_ai: false
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ai_used, false);
      assert.equal(payload.recipe, null);
      assert.ok(Array.isArray(payload.matches));
      assert.ok(payload.matches.length >= 1);
    });
  });

  await check("POST /api/diabetic/search-create with use_ai=true and OPENAI_API_KEY missing returns 503 plus local matches", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.DIABETICSPACE_DISABLE_USER_ENV_LOOKUP = "1";
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/search-create`, {
        query: "salmon",
        use_ai: true
      });
      assert.equal(response.status, 503);
      const payload = await response.json();
      assert.equal(payload.route, "api_unavailable");
      assert.equal(payload.query, "salmon");
      assert.ok(Array.isArray(payload.matches));
      assert.ok(payload.matches.length >= 1);
    });
    delete process.env.DIABETICSPACE_DISABLE_USER_ENV_LOOKUP;
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    }
  });

  await check("POST /api/diabetic/search-create with use_ai=true uses best local match as context", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let capturedInput = "";
    __setDiabeticAssistMock(({ input }) => {
      capturedInput = String(input ?? "");
      return buildMockRecipe({ recipe_id: `search-ai-${Date.now()}`, title: "Search AI Recipe", meal_type: "dinner" });
    });
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/search-create`, {
        query: "salmon dinner",
        use_ai: true
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ai_used, true);
      assert.ok(payload.recipe);
      assert.ok(Array.isArray(payload.matches));
      assert.ok(payload.matches.length >= 1);
      assert.match(capturedInput, /baked-lemon-herb-salmon/);
    });
    __setDiabeticAssistMock(null);
    delete process.env.OPENAI_API_KEY;
  });

  await check("POST /api/diabetic/save stores recipe and returns saved: true", async () => {
    await withServer(async (address) => {
      const recipe = buildMockRecipe({ recipe_id: `test-save-${Date.now()}` });
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, recipe);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.saved, true);
      assert.equal(payload.recipe_id, recipe.recipe_id);

      const getResponse = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipe?recipe_id=${encodeURIComponent(recipe.recipe_id)}`);
      assert.equal(getResponse.status, 200);
      const got = await getResponse.json();
      assert.equal(got.recipe.recipe_id, recipe.recipe_id);
    });
  });

  await check("recallDiabeticRecipe finds seeded recipe from matching query", async () => {
    const db = new DatabaseSync(tempDatabasePath);
    initDiabeticDb(db);
    seedDiabeticRecipes(db);
    const recalled = recallDiabeticRecipe(db, "fried rice low carb dinner");
    assert.ok(recalled);
    assert.equal(recalled.recipe_id, "cauliflower-fried-rice");
    assert.ok(Number(recalled.recall_count) >= 1);
    db.close();
  });

  await check("POST /api/diabetic/chat reaches local_recall after enough recall hits", async () => {
    const db = new DatabaseSync(tempDatabasePath);
    initDiabeticDb(db);
    seedDiabeticRecipes(db);
    db.prepare("UPDATE diabetic_recipes SET recall_count = 0 WHERE recipe_id = ?").run("cauliflower-fried-rice");
    db.close();

    __setDiabeticAssistMock(() => buildMockRecipe({ recipe_id: "cauliflower-fried-rice", title: "Validated Fried Rice" }));
    await withServer(async (address) => {
      const first = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/chat`, { message: "cauliflower fried rice" });
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.route, "api_validate");
      assert.ok(firstPayload.recipe);

      const second = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/chat`, { message: "cauliflower fried rice" });
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.route, "local_recall");
      assert.ok(Number(secondPayload.recall_count) >= 2);
    });
    __setDiabeticAssistMock(null);
  });

  await check("POST /api/diabetic/chat unknown recipe routes api_expand with OpenAI available", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    __setDiabeticAssistMock(() => buildMockRecipe({ recipe_id: `ai-expand-${Date.now()}`, title: "AI Expand Recipe" }));
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/chat`, { message: "zxqv jnptl qwrp lmx" });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.route, "api_expand");
      assert.ok(payload.recipe.recipe_id.startsWith("ai-expand-"));
    });
    __setDiabeticAssistMock(null);
    delete process.env.OPENAI_API_KEY;
  });

  await check("POST /api/diabetic/chat returns 503 api_unavailable when OpenAI key missing", async () => {
    __setDiabeticAssistMock(null);
    delete process.env.OPENAI_API_KEY;
    process.env.DIABETICSPACE_DISABLE_USER_ENV_LOOKUP = "1";
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/chat`, { message: "zxqv new recipe please" });
      assert.equal(response.status, 503);
      const payload = await response.json();
      assert.equal(payload.route, "api_unavailable");
    });
    delete process.env.DIABETICSPACE_DISABLE_USER_ENV_LOOKUP;
  });

  await check("POST /api/diabetic/adapt returns recipe_id ending in -adapted or -adapted-N", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    __setDiabeticAssistMock(() => buildMockRecipe({ recipe_id: "ignored", title: "Adapted Recipe" }));
    await withServer(async (address) => {
      const first = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/adapt`, {
        recipe_id: "almond-flour-pancakes",
        change: "make it dairy-free"
      });
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.match(String(firstPayload.recipe.recipe_id), /almond-flour-pancakes-adapted(?:-\d+)?$/);

      const second = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/adapt`, {
        recipe_id: "almond-flour-pancakes",
        change: "make it kid-friendly"
      });
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.match(String(secondPayload.recipe.recipe_id), /almond-flour-pancakes-adapted-(\d+)$/);
    });
    __setDiabeticAssistMock(null);
    delete process.env.OPENAI_API_KEY;
  });

  await check("POST /api/diabetic/builder/start returns stage meal_type", async () => {
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/start`, {});
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.stage, "meal_type");
      assert.ok(payload.session_id);
      assert.match(String(payload.prompt ?? ""), /What kind of meal/i);
    });
  });

  await check("POST /api/diabetic/builder/next advances correctly", async () => {
    await withServer(async (address) => {
      const start = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/start`, {});
      const started = await start.json();
      const session_id = started.session_id;

      const step1 = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "dinner" });
      const p1 = await step1.json();
      assert.equal(p1.stage, "goal");

      const step2 = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "high-protein" });
      const p2 = await step2.json();
      assert.equal(p2.stage, "include_items");

      const step3 = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "chicken, broccoli" });
      const p3 = await step3.json();
      assert.equal(p3.stage, "avoid_items");

      const step4 = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "sugar, white flour" });
      const p4 = await step4.json();
      assert.equal(p4.stage, "servings");
    });
  });

  await check("POST /api/diabetic/builder/complete returns completed: true", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    __setDiabeticAssistMock(() => buildMockRecipe({ recipe_id: `builder-ai-${Date.now()}`, title: "Builder AI Recipe", meal_type: "dinner" }));
    await withServer(async (address) => {
      const start = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/start`, {});
      const started = await start.json();
      const session_id = started.session_id;

      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "dinner" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "low-carb" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "chicken, broccoli" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "sugar" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "2" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "one-pan" });

      const complete = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/complete`, { session_id });
      assert.equal(complete.status, 200);
      const payload = await complete.json();
      assert.equal(payload.completed, true);
      assert.ok(payload.recipe);

      const db = new DatabaseSync(tempDatabasePath);
      const session = getDiabeticBuilderSession(db, session_id);
      assert.equal(session, null);
      db.close();
    });
    __setDiabeticAssistMock(null);
    delete process.env.OPENAI_API_KEY;
  });

  await check("missing OPENAI_API_KEY does not crash builder completion when LLM is needed", async () => {
    __setDiabeticAssistMock(null);
    delete process.env.OPENAI_API_KEY;
    process.env.DIABETICSPACE_DISABLE_USER_ENV_LOOKUP = "1";
    await withServer(async (address) => {
      const start = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/start`, {});
      const started = await start.json();
      const session_id = started.session_id;

      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "dessert" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "low-sugar" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "cocoa" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "sugar" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "2" });
      await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/next`, { session_id, answer: "quick" });

      const complete = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/builder/complete`, { session_id });
      assert.equal(complete.status, 503);
      const payload = await complete.json();
      assert.equal(payload.route, "api_unavailable");
    });
    delete process.env.DIABETICSPACE_DISABLE_USER_ENV_LOOKUP;
  });
}
