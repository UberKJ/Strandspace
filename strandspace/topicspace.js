import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize, slugify, safeJsonParse, normalizeArray } from "./normalize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const defaultTopicSeedsPath = join(__dirname, "..", "data", "topic-seeds.json");
export const diabeticRecipeSeedsPath = join(__dirname, "..", "data", "diabetic-recipe-seeds.json");

function nowIso() {
  return new Date().toISOString();
}

function normalizeTextArtifacts(text = "") {
  return String(text ?? "")
    .replaceAll("Î©", "Ω")
    .replaceAll("Â±", "±");
}

function asString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asJsonText(value, fallback) {
  if (value === null || value === undefined) {
    return JSON.stringify(fallback);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return JSON.stringify(fallback);
    }
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return JSON.stringify(fallback);
    }
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return JSON.stringify(fallback);
}

function normalizeStringList(value, limit = 24) {
  return [...new Set(normalizeArray(value))].slice(0, limit);
}

function parseKeyValueLines(value = "") {
  const text = String(value ?? "").trim();
  if (!text) {
    return {};
  }

  const rows = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      continue;
    }
    const key = String(match[1] ?? "").trim();
    const item = String(match[2] ?? "").trim();
    if (!key || !item) {
      continue;
    }
    rows[key] = item;
    if (Object.keys(rows).length >= 48) {
      break;
    }
  }
  return rows;
}

function parseLineList(value = "", limit = 48) {
  const text = String(value ?? "").trim();
  if (!text) {
    return [];
  }

  const entries = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter(Boolean);

  return [...new Set(entries)].slice(0, limit);
}

export const TOPIC_CONSTRUCT_TYPES = [
  "reference_lookup",
  "procedure",
  "configuration",
  "profile",
  "comparison",
  "diagnostic",
  "specification",
  "timeline",
  "classification",
  "hybrid"
];

export const UNIVERSAL_CONSTRUCT_FIELDS = [
  "topic",
  "title",
  "construct_type",
  "purpose",
  "summary",
  "core_entities",
  "attributes",
  "relationships",
  "rules",
  "steps",
  "lookup_table",
  "examples",
  "known_fields",
  "unknown_fields",
  "null_fields",
  "sources",
  "confidence",
  "tags",
  "retrieval_keys",
  "trigger_phrases",
  "linked_construct_ids"
];

function normalizeConstructType(value = "") {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s/-]+/g, "_");
  return TOPIC_CONSTRUCT_TYPES.includes(normalized) ? normalized : "hybrid";
}

function computeFieldPresence(construct = {}) {
  const known = [];
  const unknown = [];
  const nullFields = [];

  for (const key of UNIVERSAL_CONSTRUCT_FIELDS) {
    const value = construct[key];
    const isNull = value === null;
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isEmptyObject = value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
    const isEmptyString = typeof value === "string" && !value.trim();
    const isUnset = value === undefined || isEmptyArray || isEmptyObject || isEmptyString;

    if (isNull) {
      nullFields.push(key);
      continue;
    }

    if (isUnset) {
      unknown.push(key);
      continue;
    }

    known.push(key);
  }

  return {
    known_fields: known,
    unknown_fields: unknown,
    null_fields: nullFields
  };
}

function buildTopicConstructId(payload = {}) {
  const topic = String(payload.topic ?? "").trim();
  const title = String(payload.title ?? "").trim();
  const base = slugify(topic || title || `topic-${Date.now().toString(36)}`) || `topic-${Date.now().toString(36)}`;
  return `topic:${base}:${Date.now().toString(36)}`;
}

function normalizeTopicConstruct(payload = {}) {
  const topic = String(payload.topic ?? payload.subjectLabel ?? "").trim();
  const title = String(payload.title ?? payload.constructLabel ?? "").trim();
  const construct_type = normalizeConstructType(payload.construct_type ?? payload.constructType);

  const core_entities = Array.isArray(payload.core_entities)
    ? payload.core_entities.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 24)
    : normalizeStringList(payload.core_entities, 24);

  const attributes = (payload.attributes && typeof payload.attributes === "object" && !Array.isArray(payload.attributes))
    ? payload.attributes
    : (typeof payload.attributes === "string" ? parseKeyValueLines(payload.attributes) : {});

  const relationships = Array.isArray(payload.relationships)
    ? payload.relationships.slice(0, 32)
    : (payload.relationships && typeof payload.relationships === "object" ? payload.relationships : []);

  const rules = Array.isArray(payload.rules)
    ? payload.rules.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 64)
    : parseLineList(payload.rules, 64);

  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 64)
    : parseLineList(payload.steps, 64);

  let lookup_table = payload.lookup_table;
  if (typeof lookup_table === "string") {
    const trimmed = lookup_table.trim();
    if (trimmed) {
      try {
        lookup_table = JSON.parse(trimmed);
      } catch {
        lookup_table = { raw: trimmed };
      }
    } else {
      lookup_table = {};
    }
  }
  if (!lookup_table || typeof lookup_table !== "object" || Array.isArray(lookup_table)) {
    lookup_table = {};
  }

  const examples = Array.isArray(payload.examples)
    ? payload.examples.slice(0, 24)
    : parseLineList(payload.examples, 24);

  const sources = Array.isArray(payload.sources)
    ? payload.sources.slice(0, 24)
    : parseLineList(payload.sources, 24);

  const tags = normalizeStringList(payload.tags, 32);
  const retrieval_keys = normalizeStringList(payload.retrieval_keys, 32);
  const trigger_phrases = normalizeStringList(payload.trigger_phrases, 24);
  const linked_construct_ids = normalizeStringList(payload.linked_construct_ids ?? payload.linkedConstructIds, 48);

  const confidence = asNumber(payload.confidence);

  const base = {
    id: String(payload.id ?? "").trim() || buildTopicConstructId({ topic, title }),
    topic: topic || null,
    title: title || null,
    construct_type,
    purpose: asString(payload.purpose),
    summary: asString(payload.summary),
    core_entities,
    attributes,
    relationships,
    rules,
    steps,
    lookup_table,
    examples,
    sources,
    confidence,
    tags,
    retrieval_keys,
    trigger_phrases,
    linked_construct_ids,
    updatedAt: nowIso()
  };

  const presence = computeFieldPresence(base);

  return {
    ...base,
    known_fields: presence.known_fields,
    unknown_fields: presence.unknown_fields,
    null_fields: presence.null_fields
  };
}

function fromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    topic: row.topic,
    title: row.title || null,
    construct_type: row.constructType || "hybrid",
    purpose: row.purpose || null,
    summary: row.summary || null,
    core_entities: safeJsonParse(row.coreEntitiesJson, []),
    attributes: safeJsonParse(row.attributesJson, {}),
    relationships: safeJsonParse(row.relationshipsJson, []),
    rules: safeJsonParse(row.rulesJson, []),
    steps: safeJsonParse(row.stepsJson, []),
    lookup_table: safeJsonParse(row.lookupTableJson, {}),
    examples: safeJsonParse(row.examplesJson, []),
    known_fields: safeJsonParse(row.knownFieldsJson, []),
    unknown_fields: safeJsonParse(row.unknownFieldsJson, []),
    null_fields: safeJsonParse(row.nullFieldsJson, []),
    sources: safeJsonParse(row.sourcesJson, []),
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
    tags: safeJsonParse(row.tagsJson, []),
    retrieval_keys: safeJsonParse(row.retrievalKeysJson, []),
    trigger_phrases: safeJsonParse(row.triggerPhrasesJson, []),
    linked_construct_ids: safeJsonParse(row.linkedConstructIdsJson, []),
    updatedAt: row.updatedAt
  };
}

export function ensureTopicspaceTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS topic_constructs (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      title TEXT,
      constructType TEXT NOT NULL,
      purpose TEXT,
      summary TEXT,
      coreEntitiesJson TEXT NOT NULL,
      attributesJson TEXT NOT NULL,
      relationshipsJson TEXT NOT NULL,
      rulesJson TEXT NOT NULL,
      stepsJson TEXT NOT NULL,
      lookupTableJson TEXT NOT NULL,
      examplesJson TEXT NOT NULL,
      knownFieldsJson TEXT NOT NULL,
      unknownFieldsJson TEXT NOT NULL,
      nullFieldsJson TEXT NOT NULL,
      sourcesJson TEXT NOT NULL,
      confidence REAL,
      tagsJson TEXT NOT NULL,
      retrievalKeysJson TEXT NOT NULL,
      triggerPhrasesJson TEXT NOT NULL,
      linkedConstructIdsJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_topic_constructs_topic ON topic_constructs(topic, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_topic_constructs_type ON topic_constructs(constructType, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_topic_constructs_updated ON topic_constructs(updatedAt DESC);
  `);
}

function readSeedFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function upsertMissingStableSeeds(db, seeds = []) {
  let inserted = 0;
  for (const item of seeds) {
    const id = String(item?.id ?? "").trim();
    if (!id) {
      continue;
    }
    const exists = db.prepare("SELECT id FROM topic_constructs WHERE id = ?").get(id);
    if (exists) {
      continue;
    }
    upsertTopicConstruct(db, item);
    inserted += 1;
  }
  return inserted;
}

export function seedTopicspace(db, filePath = defaultTopicSeedsPath) {
  ensureTopicspaceTables(db);

  let existing = 0;
  try {
    existing = Number(db.prepare("SELECT COUNT(*) as count FROM topic_constructs").get().count ?? 0);
  } catch {
    existing = 0;
  }

  if (filePath !== defaultTopicSeedsPath) {
    const raw = readSeedFile(filePath);
    for (const item of raw) {
      upsertTopicConstruct(db, item);
    }
    return Number(db.prepare("SELECT COUNT(*) as count FROM topic_constructs").get().count ?? 0);
  }

  if (existing === 0) {
    const raw = readSeedFile(filePath);
    for (const item of raw) {
      upsertTopicConstruct(db, item);
    }
  }

  upsertMissingStableSeeds(db, readSeedFile(diabeticRecipeSeedsPath));

  return Number(db.prepare("SELECT COUNT(*) as count FROM topic_constructs").get().count ?? 0);
}

export function listTopicConstructs(db, topic = "") {
  ensureTopicspaceTables(db);
  const normalizedTopic = String(topic ?? "").trim();
  const rows = normalizedTopic
    ? db.prepare("SELECT * FROM topic_constructs WHERE topic = ? ORDER BY updatedAt DESC").all(normalizedTopic)
    : db.prepare("SELECT * FROM topic_constructs ORDER BY updatedAt DESC").all();
  return rows.map(fromRow);
}

function getTopicConstructRaw(db, id = "") {
  ensureTopicspaceTables(db);
  return fromRow(db.prepare("SELECT * FROM topic_constructs WHERE id = ?").get(String(id)));
}

function hydrateLinkedConstructs(db, construct) {
  if (!construct) return null;
  const ids = Array.isArray(construct.linked_construct_ids) ? construct.linked_construct_ids : [];
  const linked_constructs = ids
    .map((id) => getTopicConstructRaw(db, id))
    .filter(Boolean)
    .map((item) => ({ ...item, linked_constructs: [] }));
  return { ...construct, linked_constructs };
}

export function getTopicConstruct(db, id = "") {
  return hydrateLinkedConstructs(db, getTopicConstructRaw(db, id));
}

export function upsertTopicConstruct(db, payload = {}) {
  ensureTopicspaceTables(db);
  const record = normalizeTopicConstruct(payload);
  if (!record.topic) {
    throw new Error("topic is required");
  }

  db.prepare(`
    INSERT INTO topic_constructs (
      id, topic, title, constructType, purpose, summary,
      coreEntitiesJson, attributesJson, relationshipsJson, rulesJson, stepsJson,
      lookupTableJson, examplesJson,
      knownFieldsJson, unknownFieldsJson, nullFieldsJson,
      sourcesJson, confidence,
      tagsJson, retrievalKeysJson, triggerPhrasesJson, linkedConstructIdsJson,
      updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      topic = excluded.topic,
      title = excluded.title,
      constructType = excluded.constructType,
      purpose = excluded.purpose,
      summary = excluded.summary,
      coreEntitiesJson = excluded.coreEntitiesJson,
      attributesJson = excluded.attributesJson,
      relationshipsJson = excluded.relationshipsJson,
      rulesJson = excluded.rulesJson,
      stepsJson = excluded.stepsJson,
      lookupTableJson = excluded.lookupTableJson,
      examplesJson = excluded.examplesJson,
      knownFieldsJson = excluded.knownFieldsJson,
      unknownFieldsJson = excluded.unknownFieldsJson,
      nullFieldsJson = excluded.nullFieldsJson,
      sourcesJson = excluded.sourcesJson,
      confidence = excluded.confidence,
      tagsJson = excluded.tagsJson,
      retrievalKeysJson = excluded.retrievalKeysJson,
      triggerPhrasesJson = excluded.triggerPhrasesJson,
      linkedConstructIdsJson = excluded.linkedConstructIdsJson,
      updatedAt = excluded.updatedAt
  `).run(
    record.id,
    record.topic,
    record.title,
    record.construct_type,
    record.purpose,
    record.summary,
    asJsonText(record.core_entities, []),
    asJsonText(record.attributes, {}),
    asJsonText(record.relationships, []),
    asJsonText(record.rules, []),
    asJsonText(record.steps, []),
    asJsonText(record.lookup_table, {}),
    asJsonText(record.examples, []),
    asJsonText(record.known_fields, []),
    asJsonText(record.unknown_fields, []),
    asJsonText(record.null_fields, []),
    asJsonText(record.sources, []),
    record.confidence,
    asJsonText(record.tags, []),
    asJsonText(record.retrieval_keys, []),
    asJsonText(record.trigger_phrases, []),
    asJsonText(record.linked_construct_ids, []),
    record.updatedAt
  );

  return getTopicConstruct(db, record.id);
}

function tokensFromAny(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => tokenize(String(item ?? ""))).filter(Boolean);
  }
  if (typeof value === "object") {
    return tokenize(JSON.stringify(value));
  }
  return tokenize(String(value));
}

function scoreTopicConstruct(construct = {}, question = "") {
  const qTokens = new Set(tokenize(question));
  const topicTokens = new Set(tokenize(construct.topic || ""));
  const titleTokens = new Set(tokenize(construct.title || ""));
  const retrievalTokens = new Set(tokensFromAny(construct.retrieval_keys));
  const triggerTokens = new Set(tokensFromAny(construct.trigger_phrases));
  const tagTokens = new Set(tokensFromAny(construct.tags));

  let score = 0;
  for (const token of qTokens) {
    if (topicTokens.has(token)) score += 5;
    if (titleTokens.has(token)) score += 4;
    if (retrievalTokens.has(token)) score += 6;
    if (triggerTokens.has(token)) score += 7;
    if (tagTokens.has(token)) score += 2;
  }

  if (construct.construct_type === "reference_lookup") {
    score += 4;
  }

  return score;
}

function extractResistorColors(question = "") {
  const normalized = String(question ?? "").toLowerCase();
  const colors = [
    "black",
    "brown",
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "violet",
    "purple",
    "gray",
    "grey",
    "white",
    "gold",
    "silver"
  ];

  const hits = [];
  for (const token of normalized.split(/[^a-z]+/g).filter(Boolean)) {
    const mapped = token === "grey" ? "gray" : token === "purple" ? "violet" : token;
    if (colors.includes(mapped)) {
      hits.push(mapped);
    }
  }
  return hits;
}

function decodeResistorColorCode(construct = {}, question = "") {
  const table = construct.lookup_table ?? {};
  const digits = table.digits ?? {};
  const multipliers = table.multiplier ?? table.multipliers ?? {};
  const tolerance = table.tolerance ?? {};
  const colors = extractResistorColors(question);

  if (colors.length < 4) {
    return null;
  }

  const [band1, band2, band3, band4] = colors;
  const d1 = digits[band1];
  const d2 = digits[band2];
  const mul = multipliers[band3];
  const tol = tolerance[band4];

  if (d1 === undefined || d2 === undefined || mul === undefined) {
    return null;
  }

  const value = (Number(d1) * 10 + Number(d2)) * Number(mul);
  const tolPct = tol === undefined ? null : Number(tol);

  const formatted = value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2)} MΩ`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 2)} kΩ`
      : `${value} Ω`;

  return {
    bands: [band1, band2, band3, band4],
    ohms: value,
    formatted: normalizeTextArtifacts(formatted),
    tolerancePct: Number.isFinite(tolPct) ? tolPct : null
  };
}

function estimateCompletenessConfidence(construct = {}) {
  const presence = computeFieldPresence(construct);
  const known = presence.known_fields.length;
  const total = UNIVERSAL_CONSTRUCT_FIELDS.length;
  return Number(Math.min(0.95, Math.max(0.1, known / total)).toFixed(2));
}

function chooseConfidence(construct = {}) {
  const stored = Number(construct.confidence);
  if (Number.isFinite(stored) && stored > 0) {
    return Number(Math.min(stored, 1).toFixed(2));
  }
  return estimateCompletenessConfidence(construct);
}

function buildLocalAnswer(construct = {}, question = "") {
  const confidence = chooseConfidence(construct);

  if (construct.construct_type === "reference_lookup") {
    const decoded = decodeResistorColorCode(construct, question);
    if (decoded && confidence >= 0.55) {
      const tol = decoded.tolerancePct === null ? "" : ` ±${decoded.tolerancePct}%`;
      return {
        ok: true,
        source: "topicspace",
        confidence,
        answer: `${normalizeTextArtifacts(decoded.formatted)}${normalizeTextArtifacts(tol)} (bands: ${decoded.bands.join(" ")})`,
        detail: {
          decoded
        }
      };
    }
  }

  const steps = Array.isArray(construct.steps) ? construct.steps : [];
  const rules = Array.isArray(construct.rules) ? construct.rules : [];
  const linked = Array.isArray(construct.linked_constructs) ? construct.linked_constructs : [];
  const summary = String(construct.summary ?? "").trim();
  const purpose = String(construct.purpose ?? "").trim();

  const lines = [];
  if (summary) lines.push(summary);
  if (purpose) lines.push(`Purpose: ${purpose}`);

  if (linked.length) {
    lines.push("Ingredients:");
    for (const item of linked.slice(0, 10)) {
      const title = String(item?.title ?? item?.topic ?? "Ingredient").trim();
      const attrs = item?.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes)
        ? Object.entries(item.attributes).slice(0, 4).map(([key, value]) => `${key}: ${value}`).join("; ")
        : "";
      const fact = attrs || String(item?.purpose ?? "").trim();
      lines.push(`- ${title}${fact ? ` - ${fact}` : ""}`);
    }
  }

  if (steps.length) {
    lines.push("Steps:");
    for (const step of steps.slice(0, 10)) {
      lines.push(`- ${step}`);
    }
  }

  if (rules.length) {
    lines.push("Rules:");
    for (const rule of rules.slice(0, 8)) {
      lines.push(`- ${rule}`);
    }
  }

  const answer = lines.join("\n").trim();
  if (answer && confidence >= 0.65) {
    return {
      ok: true,
      source: "topicspace",
      confidence,
      answer,
      detail: {
        linked_constructs: linked
      }
    };
  }

  return {
    ok: false,
    source: "unresolved",
    confidence,
    answer: "",
    detail: {
      reason: "Insufficient stored construct detail to answer locally with confidence.",
      missing: computeFieldPresence(construct).unknown_fields.slice(0, 10)
    }
  };
}

export function recallTopicspace(db, { question = "", topic = "" } = {}) {
  ensureTopicspaceTables(db);
  const q = String(question ?? "").trim();
  const t = String(topic ?? "").trim();
  const candidates = listTopicConstructs(db, t).map((construct) => ({
    ...construct,
    score: scoreTopicConstruct(construct, q)
  })).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(left.title ?? "").localeCompare(String(right.title ?? "")));

  const matched = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  const confidence = matched ? chooseConfidence(matched) : 0.1;
  const ready = Boolean(matched && matched.score >= 8 && (!runnerUp || matched.score - runnerUp.score >= 4));
  const hydratedMatched = matched ? hydrateLinkedConstructs(db, matched) : null;

  return {
    question: q,
    topic: t || null,
    matched: hydratedMatched ? { ...hydratedMatched, confidence } : null,
    candidates: candidates.slice(0, 5),
    related_constructs: hydratedMatched?.linked_constructs ?? [],
    confidence,
    ready
  };
}

export function answerTopicspace(db, { question = "", topic = "" } = {}) {
  const recall = recallTopicspace(db, { question, topic });
  const matched = recall.matched ?? null;
  const result = matched ? buildLocalAnswer(matched, String(question ?? "")) : null;

  if (!matched || !result) {
    return {
      ok: true,
      source: "unresolved",
      question: String(question ?? "").trim(),
      topic: String(topic ?? "").trim() || null,
      answer: "No stored construct matched strongly enough to answer locally. Save a construct for this topic first.",
      recall
    };
  }

  if (!result.ok) {
    return {
      ok: true,
      source: "unresolved",
      question: String(question ?? "").trim(),
      topic: String(topic ?? "").trim() || null,
      answer: "Strandspace needs one more detail before this topic can be answered locally with confidence.",
      recall,
      needsAssist: true,
      detail: result.detail
    };
  }

  return {
    ok: true,
    source: "topicspace",
    question: String(question ?? "").trim(),
    topic: String(topic ?? "").trim() || null,
    answer: result.answer,
    confidence: result.confidence,
    recall,
    detail: result.detail
  };
}
