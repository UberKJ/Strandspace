import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { initDiabeticDb } from "./schema.js";

function normalizeText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function makeUserId() {
  return `user-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
}

function hashPin(pin) {
  const normalized = String(pin ?? "").trim();
  if (!normalized) return null;
  const salt = randomBytes(16);
  const key = scryptSync(normalized, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${Buffer.from(key).toString("base64")}`;
}

function verifyPinHash(pin, pinHash) {
  const normalized = String(pin ?? "").trim();
  const stored = String(pinHash ?? "").trim();
  if (!normalized || !stored) return false;
  const parts = stored.split("$");
  // scrypt$N$r$p$<saltB64>$<keyB64>
  if (parts.length !== 6) return false;
  if (parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltB64 = parts[4] ?? "";
  const keyB64 = parts[5] ?? "";
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt;
  let key;
  try {
    salt = Buffer.from(String(saltB64), "base64");
    key = Buffer.from(String(keyB64), "base64");
  } catch {
    return false;
  }
  if (!salt.length || !key.length) return false;
  const derived = scryptSync(normalized, salt, key.length, { N, r, p });
  return timingSafeEqual(Buffer.from(derived), Buffer.from(key));
}

function sanitizeUserRow(row) {
  if (!row) return null;
  return {
    user_id: String(row.user_id ?? "").trim(),
    display_name: String(row.display_name ?? "").trim(),
    role: String(row.role ?? "owner"),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

export function createLocalUser(db, { display_name, pin } = {}) {
  initDiabeticDb(db);
  const displayName = String(display_name ?? "").trim();
  if (!displayName) {
    throw new Error("display_name is required");
  }

  const user_id = makeUserId();
  const pin_hash = hashPin(pin);
  db.prepare(`
    INSERT INTO diabetic_users (user_id, display_name, pin_hash, role)
    VALUES (?, ?, ?, 'owner')
  `).run(user_id, displayName, pin_hash);

  return getLocalUser(db, user_id);
}

export function getLocalUser(db, userId) {
  initDiabeticDb(db);
  const user_id = String(userId ?? "").trim();
  if (!user_id) return null;
  const row = db.prepare("SELECT user_id, display_name, role, created_at, updated_at FROM diabetic_users WHERE user_id = ?").get(user_id);
  return sanitizeUserRow(row);
}

function getUserRowWithPin(db, userId) {
  initDiabeticDb(db);
  const user_id = String(userId ?? "").trim();
  if (!user_id) return null;
  return db.prepare("SELECT user_id, display_name, role, pin_hash, created_at, updated_at FROM diabetic_users WHERE user_id = ?").get(user_id);
}

export function listLocalUsers(db) {
  initDiabeticDb(db);
  const rows = db.prepare("SELECT user_id, display_name, role, created_at, updated_at FROM diabetic_users ORDER BY created_at ASC").all();
  return rows.map(sanitizeUserRow).filter(Boolean);
}

export function setUserSetting(db, userId, keyValue, value) {
  initDiabeticDb(db);
  const user_id = String(userId ?? "").trim();
  const key = String(keyValue ?? "").trim();
  if (!user_id) throw new Error("user_id is required");
  if (!key) throw new Error("key is required");

  const exists = db.prepare("SELECT 1 as ok FROM diabetic_users WHERE user_id = ?").get(user_id);
  if (!exists?.ok) throw new Error("User not found");

  const normalizedValue = normalizeText(value);
  db.prepare(`
    INSERT INTO diabetic_user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(user_id, key, normalizedValue);

  return getUserSetting(db, user_id, key);
}

export function getUserSetting(db, userId, keyValue) {
  initDiabeticDb(db);
  const user_id = String(userId ?? "").trim();
  const key = String(keyValue ?? "").trim();
  if (!user_id || !key) return null;
  const row = db.prepare("SELECT value FROM diabetic_user_settings WHERE user_id = ? AND key = ?").get(user_id, key);
  return row?.value ?? null;
}

export function listUserSettings(db, userId) {
  initDiabeticDb(db);
  const user_id = String(userId ?? "").trim();
  if (!user_id) return [];
  const rows = db.prepare("SELECT key, value, updated_at FROM diabetic_user_settings WHERE user_id = ? ORDER BY key ASC").all(user_id);
  return rows.map((row) => ({
    key: String(row.key ?? "").trim(),
    value: row.value ?? null,
    updated_at: row.updated_at ?? null
  }));
}

export function verifyLocalPin(db, userId, pin) {
  initDiabeticDb(db);
  const user_id = String(userId ?? "").trim();
  if (!user_id) throw new Error("user_id is required");
  const row = getUserRowWithPin(db, user_id);
  if (!row) return false;
  if (!row.pin_hash) return false;
  return verifyPinHash(pin, row.pin_hash);
}
