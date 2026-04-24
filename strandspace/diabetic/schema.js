// DiabeticSpace schema entrypoint.
// Delegates to the lightweight migrations runner so existing DBs upgrade safely.

import { runDiabeticMigrations } from "./migrations.js";

export function initDiabeticDb(db) {
  runDiabeticMigrations(db);
}
