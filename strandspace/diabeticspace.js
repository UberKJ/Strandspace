// DiabeticSpace compatibility barrel.
// The app and tests import from `strandspace/diabeticspace.js`; keep that stable.

export { initDiabeticDb } from "./diabetic/schema.js";

export {
  getDiabeticRecipeById,
  listDiabeticRecipes,
  listFavoriteDiabeticRecipes,
  markDiabeticRecipeCooked,
  rateDiabeticRecipe,
  saveDiabeticRecipe,
  setDiabeticRecipeFavorite,
  setDiabeticRecipeImage
} from "./diabetic/recipes.js";

export { recallDiabeticRecipe, searchDiabeticRecipes } from "./diabetic/search.js";

export {
  saveDiabeticBuilderSession,
  getDiabeticBuilderSession,
  deleteDiabeticBuilderSession
} from "./diabetic/builder.js";

export { seedDiabeticRecipes } from "./diabetic/seeds.js";

export {
  createWeeklyMealPlan,
  getWeeklyMealPlan,
  getMealPlanByWeek,
  addRecipeToMealPlan,
  removeMealPlanItem,
  updateMealPlanItem,
  listMealPlans
} from "./diabetic/meal-plans.js";

export {
  createShoppingList,
  generateShoppingListFromMealPlan,
  generateShoppingListFromRecipes,
  addShoppingListItem,
  updateShoppingListItem,
  checkShoppingListItem,
  deleteShoppingListItem,
  getShoppingList,
  listShoppingLists
} from "./diabetic/shopping.js";

export { exportDiabeticBackup, importDiabeticBackup } from "./diabetic/backup.js";

export {
  createRecipeSharePackage,
  importRecipeSharePackage,
  setRecipeShareStatus
} from "./diabetic/share.js";

export {
  createLocalUser,
  getLocalUser,
  listLocalUsers,
  setUserSetting,
  getUserSetting,
  listUserSettings,
  verifyLocalPin
} from "./diabetic/users.js";
