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
    __setDiabeticImageMock(() => Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=",
      "base64"
    ));
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

  await check("rating rejects values below 0 or above 5", async () => {
    await withServer(async (address) => {
      const recipeId = `test-rate-${Date.now()}`;
      const recipe = buildMockRecipe({ recipe_id: recipeId });
      const saveResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, recipe);
      assert.equal(saveResponse.status, 200);

      const tooHigh = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/rate`, {
        recipe_id: recipeId,
        rating: 6
      });
      assert.equal(tooHigh.status, 400);

      const tooLow = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/rate`, {
        recipe_id: recipeId,
        rating: -1
      });
      assert.equal(tooLow.status, 400);
    });
  });

  await check("favorite can be set and removed; favorites endpoint returns only favorites", async () => {
    await withServer(async (address) => {
      const oneId = `test-fav-one-${Date.now()}`;
      const twoId = `test-fav-two-${Date.now()}`;
      assert.equal((await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, buildMockRecipe({ recipe_id: oneId }))).status, 200);
      assert.equal((await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, buildMockRecipe({ recipe_id: twoId, title: "Second Recipe" }))).status, 200);

      const favoriteResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/favorite`, {
        recipe_id: oneId,
        favorite: 1
      });
      assert.equal(favoriteResponse.status, 200);
      const favored = await favoriteResponse.json();
      assert.equal(favored.ok, true);
      assert.equal(Number(favored.recipe.favorite ?? 0), 1);

      const favoritesList = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/favorites`);
      assert.equal(favoritesList.status, 200);
      const favoritesPayload = await favoritesList.json();
      const favorites = Array.isArray(favoritesPayload.recipes) ? favoritesPayload.recipes : [];
      assert.ok(favorites.some((r) => r.recipe_id === oneId));
      assert.ok(!favorites.some((r) => r.recipe_id === twoId));

      const unfavoriteResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/favorite`, {
        recipe_id: oneId,
        favorite: 0
      });
      assert.equal(unfavoriteResponse.status, 200);
      const unfavored = await unfavoriteResponse.json();
      assert.equal(Number(unfavored.recipe.favorite ?? 1), 0);
    });
  });

  await check("recipe detail includes rating and favorite fields", async () => {
    await withServer(async (address) => {
      const recipeId = `test-detail-rating-${Date.now()}`;
      assert.equal((await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, buildMockRecipe({ recipe_id: recipeId }))).status, 200);

      const rateResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/rate`, {
        recipe_id: recipeId,
        rating: 4
      });
      assert.equal(rateResponse.status, 200);

      const favoriteResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/favorite`, {
        recipe_id: recipeId,
        favorite: 1
      });
      assert.equal(favoriteResponse.status, 200);

      const getResponse = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipe?recipe_id=${encodeURIComponent(recipeId)}`);
      assert.equal(getResponse.status, 200);
      const payload = await getResponse.json();
      assert.equal(payload.recipe.recipe_id, recipeId);
      assert.equal(Number(payload.recipe.rating ?? 0), 4);
      assert.equal(Number(payload.recipe.favorite ?? 0), 1);
      assert.ok("updated_at" in payload.recipe);
      assert.ok("last_cooked_at" in payload.recipe);
    });
  });

  await check("meal plans: create plan, add recipe, fetch week plan, remove item, reject invalid day/slot", async () => {
    await withServer(async (address) => {
      const weekStart = "2026-01-05";
      const createResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/meal-plan/create`, {
        week_start: weekStart,
        title: "Test plan"
      });
      assert.equal(createResponse.status, 200);
      const created = await createResponse.json();
      assert.equal(created.ok, true);
      assert.ok(created.plan?.plan_id);

      const addResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/meal-plan/add`, {
        plan_id: created.plan.plan_id,
        recipe_id: "cauliflower-fried-rice",
        day_of_week: "monday",
        meal_slot: "dinner",
        servings: 2,
        notes: "Dinner test"
      });
      assert.equal(addResponse.status, 200);
      const added = await addResponse.json();
      assert.equal(added.ok, true);
      assert.ok(Number(added.item?.id ?? 0) > 0);
      assert.equal(added.item.recipe_id, "cauliflower-fried-rice");

      const weekResponse = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/meal-plan/week?week_start=${encodeURIComponent(weekStart)}`);
      assert.equal(weekResponse.status, 200);
      const weekPayload = await weekResponse.json();
      assert.equal(weekPayload.ok, true);
      assert.equal(weekPayload.plan.week_start, weekStart);
      assert.ok(Array.isArray(weekPayload.plan.items));
      assert.ok(weekPayload.plan.items.some((item) => item.recipe_id === "cauliflower-fried-rice" && item.day_of_week === "monday" && item.meal_slot === "dinner"));

      const removeResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/meal-plan/remove`, {
        item_id: added.item.id
      });
      assert.equal(removeResponse.status, 200);
      const removed = await removeResponse.json();
      assert.equal(removed.ok, true);
      assert.equal(removed.removed, true);

      const invalidDay = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/meal-plan/add`, {
        plan_id: created.plan.plan_id,
        recipe_id: "cauliflower-fried-rice",
        day_of_week: "nonday",
        meal_slot: "dinner"
      });
      assert.equal(invalidDay.status, 400);

      const invalidSlot = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/meal-plan/add`, {
        plan_id: created.plan.plan_id,
        recipe_id: "cauliflower-fried-rice",
        day_of_week: "monday",
        meal_slot: "brunch"
      });
      assert.equal(invalidSlot.status, 400);
    });
  });

  await check("shopping lists: generate from meal plan, manual add, checking persists, ingredient grouping works", async () => {
    await withServer(async (address) => {
      const weekStart = "2026-02-02";
      const createPlan = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/meal-plan/create`, {
        week_start: weekStart,
        title: "Plan for shopping"
      });
      assert.equal(createPlan.status, 200);
      const planPayload = await createPlan.json();
      const planId = planPayload.plan.plan_id;

      const addToPlan = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/meal-plan/add`, {
        plan_id: planId,
        recipe_id: "baked-lemon-herb-salmon",
        day_of_week: "monday",
        meal_slot: "dinner"
      });
      assert.equal(addToPlan.status, 200);

      const genResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/shopping-list/from-meal-plan`, {
        plan_id: planId
      });
      assert.equal(genResponse.status, 200);
      const genPayload = await genResponse.json();
      assert.equal(genPayload.ok, true);
      assert.ok(genPayload.list?.list_id);
      assert.ok(Array.isArray(genPayload.list.items));
      assert.ok(genPayload.list.items.length >= 1);

      const listId = genPayload.list.list_id;
      const firstItem = genPayload.list.items[0];
      const checkResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/shopping-list/item/check`, {
        item_id: firstItem.id,
        checked: 1
      });
      assert.equal(checkResponse.status, 200);

      const getResponse = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/shopping-list?list_id=${encodeURIComponent(listId)}`);
      assert.equal(getResponse.status, 200);
      const got = await getResponse.json();
      assert.equal(got.ok, true);
      assert.ok(got.list.items.some((item) => item.id === firstItem.id && Number(item.checked ?? 0) === 1));

      const manualListResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/shopping-list/create`, { title: "Manual list" });
      assert.equal(manualListResponse.status, 200);
      const manual = await manualListResponse.json();
      assert.ok(manual.list?.list_id);
      const manualListId = manual.list.list_id;

      const addManual = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/shopping-list/item/add`, {
        list_id: manualListId,
        item: { name: "spinach", amount: "2", unit: "bags" }
      });
      assert.equal(addManual.status, 200);

      const manualGet = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/shopping-list?list_id=${encodeURIComponent(manualListId)}`);
      assert.equal(manualGet.status, 200);
      const manualPayload = await manualGet.json();
      assert.ok(manualPayload.list.items.some((item) => item.name === "spinach"));

      const r1 = buildMockRecipe({ recipe_id: `group-a-${Date.now()}`, title: "Group A" });
      r1.ingredients = [{ name: "broccoli", amount: 1, unit: "cups", note: "" }];
      const r2 = buildMockRecipe({ recipe_id: `group-b-${Date.now()}`, title: "Group B" });
      r2.ingredients = [{ name: "broccoli", amount: 2, unit: "cups", note: "" }];
      assert.equal((await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, r1)).status, 200);
      assert.equal((await postJson(`http://127.0.0.1:${address.port}/api/diabetic/save`, r2)).status, 200);

      const groupedResponse = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/shopping-list/from-recipes`, {
        recipe_ids: [r1.recipe_id, r2.recipe_id],
        title: "Grouped"
      });
      assert.equal(groupedResponse.status, 200);
      const grouped = await groupedResponse.json();
      const broccoli = grouped.list.items.find((item) => item.name.toLowerCase() === "broccoli" && String(item.unit ?? "").toLowerCase() === "cups");
      assert.ok(broccoli);
      assert.equal(String(broccoli.amount ?? ""), "3");
    });
  });

  await check("POST /api/diabetic/ensure-image generates and persists image_url", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    __setDiabeticImageMock(() => Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=",
      "base64"
    ));

    const recipeId = `ensure-image-${Date.now()}`;
    const db = new DatabaseSync(tempDatabasePath);
    saveDiabeticRecipe(db, { ...buildMockRecipe({ recipe_id: recipeId, title: "Ensure Image Recipe", meal_type: "dinner" }), source: "seed" });
    db.close();

    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/ensure-image`, { recipe_id: recipeId });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.ok(payload.recipe?.image_url);

      const filename = String(payload.recipe.image_url).split("/").pop();
      const dir = String(process.env.DIABETICSPACE_IMAGE_DIR ?? "");
      assert.ok(dir);
      await access(join(dir, filename));

      const followup = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipe?recipe_id=${encodeURIComponent(recipeId)}`);
      assert.equal(followup.status, 200);
      const followupPayload = await followup.json();
      assert.equal(followupPayload.recipe.recipe_id, recipeId);
      assert.equal(followupPayload.recipe.image_url, payload.recipe.image_url);
    });

    __setDiabeticImageMock(null);
    delete process.env.OPENAI_API_KEY;
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
    __setDiabeticImageMock(() => Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xo2YAAAAASUVORK5CYII=",
      "base64"
    ));
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/chat`, { message: "zxqv jnptl qwrp lmx" });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.route, "api_expand");
      assert.ok(payload.recipe.recipe_id.startsWith("ai-expand-"));
      assert.ok(payload.recipe.image_url);
      assert.match(String(payload.recipe.image_url), /^(?:\/)?diabetic-images\/.+\.png$/);

      const filename = String(payload.recipe.image_url).split("/").pop();
      const dir = String(process.env.DIABETICSPACE_IMAGE_DIR ?? "");
      assert.ok(dir);
      await access(join(dir, filename));
    });
    __setDiabeticAssistMock(null);
    __setDiabeticImageMock(null);
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

  await check("GET /api/diabetic/export returns valid backup JSON", async () => {
    await withServer(async (address) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/export`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.app, "DiabeticSpace");
      assert.equal(payload.version, 1);
      assert.ok(payload.exported_at);
      assert.ok(Array.isArray(payload.recipes));
      assert.ok(payload.recipes.length >= 1);
      assert.ok(payload.settings && typeof payload.settings === "object");
    });
  });

  await check("POST /api/diabetic/import dry_run reports counts and import is safe by default", async () => {
    await withServer(async (address) => {
      const exportResponse = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/export`);
      assert.equal(exportResponse.status, 200);
      const backup = await exportResponse.json();

      const newRecipeId = `imported-${Date.now()}`;
      backup.recipes = Array.isArray(backup.recipes) ? backup.recipes : [];
      backup.recipes.push(buildMockRecipe({ recipe_id: newRecipeId, title: "Imported Recipe" }));

      const dryRun = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/import`, {
        backup,
        dry_run: true,
        overwrite: false
      });
      assert.equal(dryRun.status, 200);
      const dryPayload = await dryRun.json();
      assert.equal(dryPayload.ok, true);
      assert.ok(dryPayload.summary?.recipes);
      assert.ok(Number(dryPayload.summary.recipes.added ?? 0) >= 1);

      const shouldNotExist = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipe?recipe_id=${encodeURIComponent(newRecipeId)}`);
      assert.equal(shouldNotExist.status, 404);

      const apply = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/import`, {
        backup,
        dry_run: false,
        overwrite: false
      });
      assert.equal(apply.status, 200);
      const applyPayload = await apply.json();
      assert.equal(applyPayload.ok, true);
      assert.ok(Number(applyPayload.summary?.recipes?.added ?? 0) >= 1);

      const nowExists = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/recipe?recipe_id=${encodeURIComponent(newRecipeId)}`);
      assert.equal(nowExists.status, 200);
      const nowPayload = await nowExists.json();
      assert.equal(nowPayload.recipe.recipe_id, newRecipeId);
    });
  });

  await check("local users: create, verify pin, and persist settings", async () => {
    await withServer(async (address) => {
      const create = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/user/create`, {
        display_name: "Test User",
        pin: "1234"
      });
      assert.equal(create.status, 200);
      const created = await create.json();
      assert.equal(created.ok, true);
      assert.ok(created.user?.user_id);
      assert.equal(created.user.display_name, "Test User");

      const userId = created.user.user_id;

      const wrong = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/user/verify-pin`, {
        user_id: userId,
        pin: "9999"
      });
      assert.equal(wrong.status, 200);
      const wrongPayload = await wrong.json();
      assert.equal(wrongPayload.verified, false);

      const good = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/user/verify-pin`, {
        user_id: userId,
        pin: "1234"
      });
      assert.equal(good.status, 200);
      const goodPayload = await good.json();
      assert.equal(goodPayload.verified, true);

      const set = await postJson(`http://127.0.0.1:${address.port}/api/diabetic/settings`, {
        user_id: userId,
        key: "pin_lock_enabled",
        value: "1"
      });
      assert.equal(set.status, 200);
      const setPayload = await set.json();
      assert.equal(setPayload.ok, true);
      assert.equal(String(setPayload.value ?? ""), "1");

      const get = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/settings?user_id=${encodeURIComponent(userId)}&key=pin_lock_enabled`);
      assert.equal(get.status, 200);
      const getPayload = await get.json();
      assert.equal(getPayload.ok, true);
      assert.equal(String(getPayload.value ?? ""), "1");

      const usersList = await fetch(`http://127.0.0.1:${address.port}/api/diabetic/users`);
      assert.equal(usersList.status, 200);
      const usersPayload = await usersList.json();
      assert.ok(Array.isArray(usersPayload.users));
      assert.ok(usersPayload.users.some((u) => u.user_id === userId));
    });
  });
}
