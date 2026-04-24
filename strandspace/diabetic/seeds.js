// DiabeticSpace seed data.
// Uses deterministic initial recipes so the app is useful offline immediately.

import { initDiabeticDb } from "./schema.js";
import { saveDiabeticRecipe } from "./recipes.js";

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
      description: "Simple baked salmon with lemon, herbs, and garlic for an easy, low-carb dinner.",
      ingredients: [
        { name: "salmon", amount: 2, unit: "fillets", note: "about 6 oz each" },
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

