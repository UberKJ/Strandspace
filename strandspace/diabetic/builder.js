// DiabeticSpace guided builder sessions.
// Persists partial answers so the client can resume.

import { initDiabeticDb } from "./schema.js";
import { safeJsonParse, uniqueStrings } from "./normalize.js";

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

