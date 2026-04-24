# DiabeticSpace API (local)

DiabeticSpace runs on the Strandspace server and exposes a local JSON API under `/api/diabetic/*`.

Notes:

- Most endpoints return `{ ok: true, ... }` on success.
- AI-backed endpoints return `503 { route: "api_unavailable" }` when no provider key is configured.
- Images saved locally are served from `/diabetic-images/<file>`.

## Recipes

- `GET /api/diabetic/recipes?meal_type=...`
- `GET /api/diabetic/favorites?meal_type=...`
- `GET /api/diabetic/recipe?recipe_id=...`
- `POST /api/diabetic/save` (recipe JSON payload)
- `POST /api/diabetic/rate` `{ recipe_id, rating }`
- `POST /api/diabetic/favorite` `{ recipe_id, favorite }`
- `POST /api/diabetic/ensure-image` `{ recipe_id, force? }`
- `POST /api/diabetic/recipe-image/upload` `{ recipe_id, data_url }` (base64 data URL; <= 1MB)

## Search + AI

- `GET /api/diabetic/search?q=...&meal_type=...`
- `POST /api/diabetic/search-create` `{ query, use_ai, meal_type? }`
- `POST /api/diabetic/chat` `{ message }`
- `POST /api/diabetic/adapt` `{ recipe_id, change }`

## Guided builder

- `POST /api/diabetic/builder/start` `{ session_id? }`
- `POST /api/diabetic/builder/next` `{ session_id, answer }`
- `POST /api/diabetic/builder/complete` `{ session_id }`

## Weekly meal plans

- `GET /api/diabetic/meal-plans`
- `GET /api/diabetic/meal-plan?plan_id=...`
- `GET /api/diabetic/meal-plan/week?week_start=YYYY-MM-DD`
- `POST /api/diabetic/meal-plan/create` `{ week_start, title?, notes? }`
- `POST /api/diabetic/meal-plan/add` `{ plan_id, recipe_id?, day_of_week, meal_slot, servings?, notes? }`
- `POST /api/diabetic/meal-plan/remove` `{ item_id }`
- `POST /api/diabetic/meal-plan/update` `{ item_id, updates }`

## Shopping lists

- `GET /api/diabetic/shopping-lists`
- `GET /api/diabetic/shopping-list?list_id=...`
- `POST /api/diabetic/shopping-list/create` `{ title, source_type?, source_id? }`
- `POST /api/diabetic/shopping-list/from-meal-plan` `{ plan_id }`
- `POST /api/diabetic/shopping-list/from-recipes` `{ recipe_ids, title? }`
- `POST /api/diabetic/shopping-list/item/add` `{ list_id, item }`
- `POST /api/diabetic/shopping-list/item/update` `{ item_id, updates }`
- `POST /api/diabetic/shopping-list/item/check` `{ item_id, checked }`
- `POST /api/diabetic/shopping-list/item/delete` `{ item_id }`

## Backup

- `GET /api/diabetic/export`
- `POST /api/diabetic/import` `{ backup, dry_run, overwrite }`

## Local profiles (groundwork)

- `GET /api/diabetic/users`
- `POST /api/diabetic/user/create` `{ display_name, pin? }`
- `POST /api/diabetic/user/verify-pin` `{ user_id, pin }`
- `GET /api/diabetic/settings?user_id=...&key=...`
- `POST /api/diabetic/settings` `{ user_id, key, value }`

## Provider settings (local-first, masked secrets)

- `GET /api/diabetic/provider-settings?provider_id=openai`
- `POST /api/diabetic/provider-settings` `{ provider_id, key, value }`

## Recipe sharing (groundwork)

- `GET /api/diabetic/share/recipe?recipe_id=...`
- `POST /api/diabetic/share/import` `{ packageJson, overwrite? }`
- `POST /api/diabetic/share/status` `{ recipe_id, status }`

## Print pages

- `/print/recipe.html?recipe_id=...`
- `/print/meal-plan.html?plan_id=...`
- `/print/shopping-list.html?list_id=...`

