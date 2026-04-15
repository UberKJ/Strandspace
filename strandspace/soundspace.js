import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const defaultSoundProfilesPath = join(__dirname, "..", "data", "sound-profiles.json");

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function slugify(value = "") {
  return normalizeText(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || "sound-construct";
}

function stringifyArray(items = []) {
  return JSON.stringify(Array.isArray(items) ? items : []);
}

function normalizeConstruct(payload = {}) {
  const deviceBrand = String(payload.deviceBrand ?? "").trim();
  const deviceModel = String(payload.deviceModel ?? "").trim();
  const deviceType = String(payload.deviceType ?? "audio_device").trim();
  const sourceType = String(payload.sourceType ?? "microphone").trim();
  const goal = String(payload.goal ?? "general setup").trim();
  const venueSize = String(payload.venueSize ?? "small").trim();
  const eventType = String(payload.eventType ?? "general").trim();
  const speakerConfig = String(payload.speakerConfig ?? "").trim() || null;
  const name = String(
    payload.name
      ?? [deviceBrand, deviceModel, goal, venueSize && `${venueSize} room`].filter(Boolean).join(" ")
  ).trim();
  const id = String(payload.id ?? slugify(name || `${deviceBrand} ${deviceModel} ${goal}`)).trim();
  const setup = payload.setup && typeof payload.setup === "object" ? payload.setup : {};
  const tags = Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim()).filter(Boolean) : [];
  const strands = Array.isArray(payload.strands) ? payload.strands.map((item) => String(item).trim()).filter(Boolean) : [];
  const llmSummary = String(payload.llmSummary ?? "").trim() || null;
  const provenance = payload.provenance && typeof payload.provenance === "object" ? payload.provenance : null;

  return {
    id,
    name: name || id,
    deviceBrand,
    deviceModel,
    deviceType,
    sourceType,
    goal,
    venueSize,
    eventType,
    speakerConfig,
    setup,
    tags,
    strands,
    llmSummary,
    provenance
  };
}

function fromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    deviceBrand: row.deviceBrand,
    deviceModel: row.deviceModel,
    deviceType: row.deviceType,
    sourceType: row.sourceType,
    goal: row.goal,
    venueSize: row.venueSize,
    eventType: row.eventType,
    speakerConfig: row.speakerConfig,
    setup: safeJsonParse(row.setupJson, {}),
    tags: safeJsonParse(row.tagsJson, []),
    strands: safeJsonParse(row.strandsJson, []),
    llmSummary: row.llmSummary,
    provenance: safeJsonParse(row.provenanceJson, null),
    learnedCount: Number(row.learnedCount ?? 1),
    updatedAt: row.updatedAt
  };
}

export function ensureSoundspaceTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sound_constructs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      deviceBrand TEXT,
      deviceModel TEXT,
      deviceType TEXT,
      sourceType TEXT,
      goal TEXT,
      venueSize TEXT,
      eventType TEXT,
      speakerConfig TEXT,
      setupJson TEXT NOT NULL,
      tagsJson TEXT NOT NULL,
      strandsJson TEXT NOT NULL,
      llmSummary TEXT,
      provenanceJson TEXT,
      learnedCount INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_device ON sound_constructs(deviceBrand, deviceModel);
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_goal ON sound_constructs(goal);
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_event ON sound_constructs(eventType);
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_updated ON sound_constructs(updatedAt DESC);
  `);
}

export function seedSoundspace(db, filePath = defaultSoundProfilesPath) {
  ensureSoundspaceTables(db);
  const count = db.prepare("SELECT COUNT(*) as count FROM sound_constructs").get().count;
  if (Number(count) > 0) {
    return Number(count);
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  for (const item of raw) {
    upsertSoundConstruct(db, {
      ...item,
      provenance: {
        source: "seed",
        importedFrom: filePath
      }
    });
  }

  return db.prepare("SELECT COUNT(*) as count FROM sound_constructs").get().count;
}

export function listSoundConstructs(db) {
  ensureSoundspaceTables(db);
  return db
    .prepare("SELECT * FROM sound_constructs ORDER BY updatedAt DESC, name ASC")
    .all()
    .map(fromRow);
}

export function getSoundConstruct(db, id) {
  ensureSoundspaceTables(db);
  return fromRow(db.prepare("SELECT * FROM sound_constructs WHERE id = ?").get(String(id)));
}

export function upsertSoundConstruct(db, payload = {}) {
  ensureSoundspaceTables(db);
  const record = normalizeConstruct(payload);
  const existing = getSoundConstruct(db, record.id);
  const updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO sound_constructs (
      id, name, deviceBrand, deviceModel, deviceType, sourceType, goal, venueSize,
      eventType, speakerConfig, setupJson, tagsJson, strandsJson, llmSummary,
      provenanceJson, learnedCount, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      deviceBrand = excluded.deviceBrand,
      deviceModel = excluded.deviceModel,
      deviceType = excluded.deviceType,
      sourceType = excluded.sourceType,
      goal = excluded.goal,
      venueSize = excluded.venueSize,
      eventType = excluded.eventType,
      speakerConfig = excluded.speakerConfig,
      setupJson = excluded.setupJson,
      tagsJson = excluded.tagsJson,
      strandsJson = excluded.strandsJson,
      llmSummary = excluded.llmSummary,
      provenanceJson = excluded.provenanceJson,
      learnedCount = excluded.learnedCount,
      updatedAt = excluded.updatedAt
  `).run(
    record.id,
    record.name,
    record.deviceBrand,
    record.deviceModel,
    record.deviceType,
    record.sourceType,
    record.goal,
    record.venueSize,
    record.eventType,
    record.speakerConfig,
    JSON.stringify(record.setup ?? {}),
    stringifyArray(record.tags),
    stringifyArray(record.strands),
    record.llmSummary,
    record.provenance ? JSON.stringify(record.provenance) : null,
    Number(existing?.learnedCount ?? 0) + 1,
    updatedAt
  );

  return getSoundConstruct(db, record.id);
}

const DEVICE_PATTERNS = [
  { brand: "Yamaha", model: "MG10XU", terms: ["yamaha mg10xu", "mg10xu", "yamaha mixer"] },
  { brand: "Bose", model: "T8S", terms: ["bose t8s", "t8s"] }
];

const SOURCE_PATTERNS = [
  { type: "microphone", terms: ["microphone", "mic", "vocal", "voice"] },
  { type: "acoustic guitar", terms: ["acoustic guitar", "guitar"] },
  { type: "keyboard", terms: ["keyboard", "keys"] },
  { type: "playback", terms: ["playback", "laptop", "music track"] }
];

const EVENT_PATTERNS = [
  { type: "band", terms: ["band", "live band"] },
  { type: "karaoke", terms: ["karaoke"] },
  { type: "music bingo", terms: ["music bingo"] },
  { type: "speech", terms: ["speech", "spoken word", "announcement"] }
];

const VENUE_PATTERNS = [
  { size: "small", terms: ["small room", "small venue", "coffee shop", "bar"] },
  { size: "medium", terms: ["medium room", "medium venue", "hall"] },
  { size: "large", terms: ["large room", "large venue", "outdoor", "festival"] }
];

export function parseSoundQuestion(question = "") {
  const normalized = normalizeText(question);
  const device = DEVICE_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const source = SOURCE_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const event = EVENT_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const venue = VENUE_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;

  return {
    raw: question,
    normalized,
    intent: /\bcompare\b|\bvs\b|\bversus\b/.test(normalized) ? "compare" : "recommend_setup",
    deviceBrand: device?.brand ?? null,
    deviceModel: device?.model ?? null,
    sourceType: source?.type ?? null,
    eventType: event?.type ?? null,
    venueSize: venue?.size ?? null
  };
}

function scoreConstruct(record, parsed) {
  let score = 0;
  const haystack = normalizeText([
    record.name,
    record.deviceBrand,
    record.deviceModel,
    record.deviceType,
    record.sourceType,
    record.goal,
    record.venueSize,
    record.eventType,
    record.speakerConfig,
    ...(record.tags ?? []),
    ...(record.strands ?? []),
    ...Object.values(record.setup ?? {})
  ].filter(Boolean).join(" "));

  if (parsed.deviceModel && normalizeText(record.deviceModel) === normalizeText(parsed.deviceModel)) {
    score += 60;
  }
  if (parsed.deviceBrand && normalizeText(record.deviceBrand) === normalizeText(parsed.deviceBrand)) {
    score += 25;
  }
  if (parsed.sourceType && normalizeText(record.sourceType) === normalizeText(parsed.sourceType)) {
    score += 24;
  }
  if (parsed.eventType && normalizeText(record.eventType) === normalizeText(parsed.eventType)) {
    score += 18;
  }
  if (parsed.venueSize && normalizeText(record.venueSize) === normalizeText(parsed.venueSize)) {
    score += 14;
  }

  for (const token of parsed.normalized.split(/\s+/).filter(Boolean)) {
    if (token.length > 2 && haystack.includes(token)) {
      score += 2;
    }
  }

  return score;
}

function buildRecallAnswer(record, parsed) {
  const setup = record.setup ?? {};
  const lines = [
    `Strandspace recalled ${record.name}.`,
    setup.gain ? `Gain: ${setup.gain}` : null,
    setup.eq ? `EQ: ${setup.eq}` : null,
    setup.fx ? `FX: ${setup.fx}` : null,
    setup.monitor ? `Monitor: ${setup.monitor}` : null,
    setup.notes ? `Notes: ${setup.notes}` : null
  ].filter(Boolean);

  if (parsed.intent === "compare") {
    lines.unshift(`This is a stored construct for ${record.deviceBrand} ${record.deviceModel}. A full compare path can reuse it as one side of the comparison.`);
  }

  return lines.join(" ");
}

export function recallSoundspace(db, question = "") {
  const parsed = parseSoundQuestion(question);
  const constructs = listSoundConstructs(db);
  const ranked = constructs
    .map((record) => ({
      ...record,
      score: scoreConstruct(record, parsed)
    }))
    .filter((record) => record.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  const winner = ranked[0] ?? null;
  const ready = Boolean(winner && winner.score >= 55);

  return {
    question,
    parsed,
    ready,
    matched: winner,
    candidates: ranked.slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      score: item.score,
      deviceBrand: item.deviceBrand,
      deviceModel: item.deviceModel,
      eventType: item.eventType,
      venueSize: item.venueSize
    })),
    answer: ready && winner ? buildRecallAnswer(winner, parsed) : null,
    recommendation: ready
      ? "use_strandspace"
      : "fallback_to_llm_and_store",
    readiness: {
      hasDevice: Boolean(parsed.deviceModel),
      hasSource: Boolean(parsed.sourceType),
      hasContext: Boolean(parsed.eventType || parsed.venueSize),
      matchedScore: Number(winner?.score ?? 0),
      threshold: 55
    }
  };
}
