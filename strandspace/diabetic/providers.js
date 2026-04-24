// DiabeticSpace provider settings (local-first).
// Secrets are stored locally in SQLite but never returned to the browser.

import { initDiabeticDb } from "./schema.js";

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export function isSensitiveSettingKey(key) {
  const text = String(key ?? "").toLowerCase();
  return text.includes("key") || text.includes("token") || text.includes("secret") || text.includes("password");
}

export function getDiabeticProviderSetting(db, providerId, keyValue, { includeSensitive = false } = {}) {
  initDiabeticDb(db);
  const provider_id = String(providerId ?? "").trim();
  const key = String(keyValue ?? "").trim();
  if (!provider_id) throw new Error("provider_id is required");
  if (!key) throw new Error("key is required");
  if (isSensitiveSettingKey(key) && !includeSensitive) return null;

  const row = db.prepare("SELECT value FROM diabetic_llm_provider_settings WHERE provider_id = ? AND key = ?").get(provider_id, key);
  return row?.value ?? null;
}

export function setDiabeticProviderSetting(db, providerId, keyValue, value) {
  initDiabeticDb(db);
  const provider_id = String(providerId ?? "").trim();
  const key = String(keyValue ?? "").trim();
  if (!provider_id) throw new Error("provider_id is required");
  if (!key) throw new Error("key is required");

  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    db.prepare("DELETE FROM diabetic_llm_provider_settings WHERE provider_id = ? AND key = ?").run(provider_id, key);
    return {
      provider_id,
      key,
      deleted: true,
      sensitive: isSensitiveSettingKey(key)
    };
  }

  db.prepare(`
    INSERT INTO diabetic_llm_provider_settings (provider_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(provider_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(provider_id, key, normalizedValue);

  return {
    provider_id,
    key,
    deleted: false,
    sensitive: isSensitiveSettingKey(key)
  };
}

export function listDiabeticProviderSettings(db, providerId) {
  initDiabeticDb(db);
  const provider_id = String(providerId ?? "").trim();
  if (!provider_id) throw new Error("provider_id is required");
  const rows = db.prepare("SELECT key, value, updated_at FROM diabetic_llm_provider_settings WHERE provider_id = ? ORDER BY key ASC").all(provider_id);

  return rows.map((row) => {
    const key = String(row.key ?? "").trim();
    const sensitive = isSensitiveSettingKey(key);
    return {
      provider_id,
      key,
      sensitive,
      has_value: Boolean(String(row.value ?? "").trim()),
      value: sensitive ? null : String(row.value ?? ""),
      updated_at: row.updated_at ?? null
    };
  });
}

