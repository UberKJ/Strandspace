export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function slugify(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function debounce(fn, delayMs = 250) {
  let timeout = null;
  return (...args) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => fn(...args), delayMs);
  };
}

export function tokenize(text = "") {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function uniqueList(items = [], limit = 64) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item ?? "").trim()).filter(Boolean))].slice(0, limit);
}

export function parseLineList(text = "", limit = 64) {
  const entries = String(text ?? "")
    .split(/\r?\n/g)
    .map((line) => String(line ?? "").replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter(Boolean);
  return uniqueList(entries, limit);
}

export function parseCommaList(text = "", limit = 48) {
  const entries = String(text ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return uniqueList(entries, limit);
}

export function parseEntityList(text = "", limit = 32) {
  const entries = String(text ?? "")
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return uniqueList(entries, limit);
}

export function parseKeyValueLines(text = "", limit = 64) {
  const rows = [];
  const normalized = String(text ?? "").trim();
  if (!normalized) return rows;

  for (const line of normalized.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const key = String(match[1] ?? "").trim();
    const value = String(match[2] ?? "").trim();
    if (!key) continue;
    rows.push({ key, value });
    if (rows.length >= limit) break;
  }
  return rows;
}

export function rowsToObject(rows = []) {
  const obj = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.key ?? "").trim();
    if (!key) continue;
    obj[key] = String(row?.value ?? "").trim();
  }
  return obj;
}

export function objectToRows(obj = {}, limit = 64) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.entries(obj)
    .slice(0, limit)
    .map(([key, value]) => ({ key: String(key ?? "").trim(), value: String(value ?? "").trim() }));
}

export function safeJsonParse(text = "") {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

