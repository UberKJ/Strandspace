import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
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
import { __setDiabeticAssistMock, __setDiabeticImageMock } from "../strandspace/diabetic-assist.js";

function clearImageEnv() {
  delete process.env.DIABETICSPACE_IMAGE_PROVIDER;
  delete process.env.DIABETICSPACE_XAI_IMAGE_MODEL;
  delete process.env.DIABETICSPACE_IMAGE_DAILY_LIMIT;
  delete process.env.DIABETICSPACE_AUTOGENERATE_IMAGES;
  delete process.env.XAI_API_KEY;
}

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

  await check("GET /api/diabetic/search respects meal_type filter", async () => {
    await withServer(async (address) => {
      const dinner = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/search?q=salmon&meal_type=dinner`);
      assert.equal(dinner.status, 200);
      const dinnerPayload = await dinner.json();
      assert.ok(Array.isArray(dinnerPayload.matches));
      assert.ok(dinnerPayload.matches.length >= 1);
      assert.ok(dinnerPayload.matches.every((m) => String(m.meal_type ?? "").toLowerCase() === "dinner"));

      const snack = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/search?q=salmon&meal_type=snack`);
      assert.equal(snack.status, 200);
      const snackPayload = await snack.json();
      assert.ok(Array.isArray(snackPayload.matches));
      assert.equal(snackPayload.matches.length, 0);
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
        meal_type: "dinner",
        use_ai: false
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ai_used, false);
      assert.equal(payload.recipe, null);
      assert.ok(Array.isArray(payload.matches));
      assert.ok(payload.matches.length >= 1);
      assert.ok(payload.matches.every((m) => String(m.meal_type ?? "").toLowerCase() === "dinner"));
    });
  });

  await check("POST /api/diabetic/search-create with use_ai=true and OPENAI_API_KEY missing returns 503 plus local matches", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.DIABETICSPACE_DISABLE_USER_ENV_LOOKUP = "1";
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/search-create`, {
        query: "salmon",
        meal_type: "dinner",
        use_ai: true
      });
      assert.equal(response.status, 503);
      const payload = await response.json();
      assert.equal(payload.route, "api_unavailable");
      assert.equal(payload.query, "salmon");
      assert.ok(Array.isArray(payload.matches));
      assert.ok(payload.matches.length >= 1);
      assert.ok(payload.matches.every((m) => String(m.meal_type ?? "").toLowerCase() === "dinner"));
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
    let imageCalls = 0;
    __setDiabeticImageMock(() => {
      imageCalls += 1;
      return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=",
      "base64"
      );
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
      assert.equal(payload.recipe.image_url, null);
      assert.equal(imageCalls, 0);
      assert.ok(Array.isArray(payload.matches));
      assert.ok(payload.matches.length >= 1);
      assert.match(capturedInput, /baked-lemon-herb-salmon/);
    });
    __setDiabeticAssistMock(null);
    __setDiabeticImageMock(null);
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

  await check("POST /api/diabetic/delete removes a saved recipe", async () => {
    await withServer(async (address) => {
      const recipe = buildMockRecipe({ recipe_id: `test-delete-${Date.now()}` });
      const saveResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, recipe);
      assert.equal(saveResponse.status, 200);

      const deleteResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/delete`, {
        recipe_id: recipe.recipe_id
      });
      assert.equal(deleteResponse.status, 200);
      const deleted = await deleteResponse.json();
      assert.equal(deleted.ok, true);
      assert.equal(deleted.deleted, true);

      const getResponse = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipe?recipe_id=${encodeURIComponent(recipe.recipe_id)}`);
      assert.equal(getResponse.status, 404);
    });
  });

  await check("POST /api/diabetic/upload-image saves an uploaded image", async () => {
    await withServer(async (address) => {
      const recipe = buildMockRecipe({ recipe_id: `test-upload-${Date.now()}` });
      const saveResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, recipe);
      assert.equal(saveResponse.status, 200);

      const dataUrl = "data:image/png;base64,"
        + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=";
      const uploadResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/upload-image`, {
        recipe_id: recipe.recipe_id,
        data_url: dataUrl
      });
      assert.equal(uploadResponse.status, 200);
      const payload = await uploadResponse.json();
      assert.equal(payload.ok, true);
      assert.ok(payload.image_url);

      const filename = String(payload.image_url).split("/").pop();
      const dir = String(process.env.DIABETICSPACE_IMAGE_DIR ?? "");
      assert.ok(dir);
      await access(join(dir, filename));

      const getResponse = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipe?recipe_id=${encodeURIComponent(recipe.recipe_id)}`);
      assert.equal(getResponse.status, 200);
      const got = await getResponse.json();
      assert.ok(String(got.recipe.image_url ?? "").includes(filename));
    });
  });
  await check("GET /api/diabetic/image/status defaults images off", async () => {
    clearImageEnv();
    await withServer(async (address) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/image/status`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.enabled, false);
      assert.equal(payload.provider, "none");
      assert.equal(payload.cache_enabled, true);
    });
  });

  await check("POST /api/diabetic/image with provider=none never calls image API", async () => {
    let imageCalls = 0;
    __setDiabeticImageMock(() => {
      imageCalls += 1;
      return Buffer.from("not-used");
    });

    const recipeId = `image-none-${Date.now()}`;
    const db = new DatabaseSync(tempDatabasePath);
    saveDiabeticRecipe(db, { ...buildMockRecipe({ recipe_id: recipeId, title: "No Image Recipe", meal_type: "dinner" }), source: "seed" });
    db.close();

    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/image`, { recipe_id: recipeId, provider: "none" });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.created, false);
      assert.equal(payload.provider, "none");
      assert.equal(payload.recipe.image_url, null);
      assert.equal(imageCalls, 0);
    });

    __setDiabeticImageMock(null);
  });

  await check("POST /api/diabetic/image generates, caches, and force regenerates", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let imageCalls = 0;
    __setDiabeticImageMock(() => {
      imageCalls += 1;
      return Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=",
        "base64"
      );
    });

    const recipeId = `image-cache-${Date.now()}`;
    const db = new DatabaseSync(tempDatabasePath);
    saveDiabeticRecipe(db, { ...buildMockRecipe({ recipe_id: recipeId, title: "Ensure Image Recipe", meal_type: "dinner" }), source: "seed" });
    db.close();

    await withServer(async (address) => {
      const first = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/image`, { recipe_id: recipeId, provider: "openai" });
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.created, true);
      assert.ok(firstPayload.recipe?.image_url);
      assert.equal(firstPayload.image.image_provider, "openai");
      assert.equal(imageCalls, 1);

      const second = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/image`, { recipe_id: recipeId, provider: "openai" });
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.cached, true);
      assert.equal(imageCalls, 1);

      const forced = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/image`, { recipe_id: recipeId, provider: "openai", force_regenerate: true });
      assert.equal(forced.status, 200);
      const forcedPayload = await forced.json();
      assert.equal(forcedPayload.created, true);
      assert.equal(imageCalls, 2);

      const filename = String(forcedPayload.recipe.image_url).split("/").pop();
      const dir = String(process.env.DIABETICSPACE_IMAGE_DIR ?? "");
      assert.ok(dir);
      await access(join(dir, filename));
    });

    __setDiabeticImageMock(null);
    delete process.env.OPENAI_API_KEY;
  });

  await check("POST /api/diabetic/image missing xAI key returns clean JSON", async () => {
    clearImageEnv();
    process.env.DIABETICSPACE_XAI_IMAGE_MODEL = "test-xai-image";
    delete process.env.XAI_API_KEY;
    __setDiabeticImageMock(null);

    const recipeId = `image-xai-missing-${Date.now()}`;
    const db = new DatabaseSync(tempDatabasePath);
    saveDiabeticRecipe(db, { ...buildMockRecipe({ recipe_id: recipeId, title: "xAI Missing Recipe", meal_type: "dinner" }), source: "seed" });
    db.close();

    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/image`, { recipe_id: recipeId, provider: "xai" });
      assert.equal(response.status, 503);
      const payload = await response.json();
      assert.equal(payload.route, "api_unavailable");
      assert.match(payload.error, /XAI_API_KEY/);
    });

    clearImageEnv();
  });

  await check("daily image limit blocks generation without blocking text recipes", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.DIABETICSPACE_IMAGE_DAILY_LIMIT = "1";
    let imageCalls = 0;
    __setDiabeticImageMock(() => {
      imageCalls += 1;
      return Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=",
        "base64"
      );
    });
    __setDiabeticAssistMock(() => buildMockRecipe({ recipe_id: `text-after-image-fail-${Date.now()}`, title: "Text Still Works" }));

    const firstRecipeId = `image-limit-a-${Date.now()}`;
    const secondRecipeId = `image-limit-b-${Date.now()}`;
    const db = new DatabaseSync(tempDatabasePath);
    initDiabeticDb(db);
    db.exec("DELETE FROM diabetic_image_generations;");
    saveDiabeticRecipe(db, { ...buildMockRecipe({ recipe_id: firstRecipeId, title: "Limit A", meal_type: "dinner" }), source: "seed" });
    saveDiabeticRecipe(db, { ...buildMockRecipe({ recipe_id: secondRecipeId, title: "Limit B", meal_type: "dinner" }), source: "seed" });
    db.close();

    await withServer(async (address) => {
      const first = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/image`, { recipe_id: firstRecipeId, provider: "openai" });
      assert.equal(first.status, 200);
      const blocked = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/image`, { recipe_id: secondRecipeId, provider: "openai" });
      assert.equal(blocked.status, 429);
      const blockedPayload = await blocked.json();
      assert.equal(blockedPayload.route, "image_daily_limit");
      assert.equal(imageCalls, 1);

      const chat = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/chat`, { message: "brand new low carb dinner idea" });
      assert.equal(chat.status, 200);
      const chatPayload = await chat.json();
      assert.ok(chatPayload.recipe);
      assert.equal(chatPayload.recipe.image_url, null);
    });

    __setDiabeticAssistMock(null);
    __setDiabeticImageMock(null);
    delete process.env.OPENAI_API_KEY;
    clearImageEnv();
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
    __setDiabeticImageMock(() => Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=",
      "base64"
    ));
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
    __setDiabeticImageMock(null);
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
    __setDiabeticImageMock(() => Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=",
      "base64"
    ));
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
    __setDiabeticImageMock(null);
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
