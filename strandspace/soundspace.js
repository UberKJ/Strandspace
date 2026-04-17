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
  const sourceBrand = String(payload.sourceBrand ?? "").trim() || null;
  const sourceModel = String(payload.sourceModel ?? "").trim() || null;
  const presetSystem = String(payload.presetSystem ?? "").trim() || null;
  const presetCategory = String(payload.presetCategory ?? "").trim() || null;
  const presetName = String(payload.presetName ?? "").trim() || null;
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
    sourceBrand,
    sourceModel,
    presetSystem,
    presetCategory,
    presetName,
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
    sourceBrand: row.sourceBrand ?? null,
    sourceModel: row.sourceModel ?? null,
    presetSystem: row.presetSystem ?? null,
    presetCategory: row.presetCategory ?? null,
    presetName: row.presetName ?? null,
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
      sourceBrand TEXT,
      sourceModel TEXT,
      presetSystem TEXT,
      presetCategory TEXT,
      presetName TEXT,
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
  `);

  const columns = db.prepare("PRAGMA table_info(sound_constructs)").all();
  if (!columns.some((column) => column.name === "sourceBrand")) {
    db.exec("ALTER TABLE sound_constructs ADD COLUMN sourceBrand TEXT;");
  }
  if (!columns.some((column) => column.name === "sourceModel")) {
    db.exec("ALTER TABLE sound_constructs ADD COLUMN sourceModel TEXT;");
  }
  if (!columns.some((column) => column.name === "presetSystem")) {
    db.exec("ALTER TABLE sound_constructs ADD COLUMN presetSystem TEXT;");
  }
  if (!columns.some((column) => column.name === "presetCategory")) {
    db.exec("ALTER TABLE sound_constructs ADD COLUMN presetCategory TEXT;");
  }
  if (!columns.some((column) => column.name === "presetName")) {
    db.exec("ALTER TABLE sound_constructs ADD COLUMN presetName TEXT;");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_device ON sound_constructs(deviceBrand, deviceModel);
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_goal ON sound_constructs(goal);
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_event ON sound_constructs(eventType);
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_source_model ON sound_constructs(sourceBrand, sourceModel);
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_preset ON sound_constructs(presetSystem, presetCategory, presetName);
    CREATE INDEX IF NOT EXISTS idx_sound_constructs_updated ON sound_constructs(updatedAt DESC);
  `);
}

export function seedSoundspace(db, filePath = defaultSoundProfilesPath) {
  ensureSoundspaceTables(db);
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  for (const item of raw) {
    const existing = getSoundConstruct(db, item.id);
    if (!existing) {
      upsertSoundConstruct(db, {
        ...item,
        provenance: {
          source: "seed",
          importedFrom: filePath
        }
      });
    }
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
  const provisional = normalizeConstruct(payload);
  const existing = getSoundConstruct(db, provisional.id);
  const record = normalizeConstruct({
    ...existing,
    ...payload,
    setup: {
      ...(existing?.setup ?? {}),
      ...(payload.setup ?? {})
    },
    tags: Array.from(new Set([...(existing?.tags ?? []), ...(payload.tags ?? [])])),
    strands: Array.from(new Set([...(existing?.strands ?? []), ...(payload.strands ?? [])]))
  });
  const updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO sound_constructs (
      id, name, deviceBrand, deviceModel, deviceType, sourceType, sourceBrand, sourceModel, presetSystem, presetCategory, presetName, goal, venueSize,
      eventType, speakerConfig, setupJson, tagsJson, strandsJson, llmSummary,
      provenanceJson, learnedCount, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      deviceBrand = excluded.deviceBrand,
      deviceModel = excluded.deviceModel,
      deviceType = excluded.deviceType,
      sourceType = excluded.sourceType,
      sourceBrand = excluded.sourceBrand,
      sourceModel = excluded.sourceModel,
      presetSystem = excluded.presetSystem,
      presetCategory = excluded.presetCategory,
      presetName = excluded.presetName,
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
    record.sourceBrand,
    record.sourceModel,
    record.presetSystem,
    record.presetCategory,
    record.presetName,
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
  { brand: "Yamaha", model: "MG10XU", type: "mixer", terms: ["yamaha mg10xu", "mg10xu", "yamaha mixer"] },
  { brand: "Bose", model: "T8S", type: "mixer", terms: ["bose t8s", "t8s"] },
  { brand: "Bose", model: "L1 Pro8", type: "speaker_system", terms: ["bose l1 pro8", "l1 pro8", "pro8 column array", "pro 8 column array", "bose pro 8 column array"] }
];

const SOURCE_PATTERNS = [
  { type: "microphone", terms: ["microphone", "mic", "vocal", "voice"] },
  { type: "acoustic guitar", terms: ["acoustic guitar", "guitar"] },
  { type: "electric guitar", terms: ["electric guitar", "guitar amp", "amp"] },
  { type: "bass guitar", terms: ["bass guitar", "bass"] },
  { type: "keyboard", terms: ["keyboard", "keys"] },
  { type: "percussion", terms: ["drum", "kick", "overhead", "percussion"] },
  { type: "playback", terms: ["playback", "laptop", "music track"] },
  { type: "speaker system", terms: ["front of house", "front-of-house", "foh", "main speakers", "column array", "column arrays", "speaker system", "pa speakers"] }
];

const SOURCE_BRAND_PATTERNS = [
  { brand: "Shure", terms: ["shure"] },
  { brand: "Sennheiser", terms: ["sennheiser"] },
  { brand: "Audio-Technica", terms: ["audio technica", "audio-technica"] },
  { brand: "Taylor", terms: ["taylor"] },
  { brand: "Ovation", terms: ["ovation"] },
  { brand: "Audix", terms: ["audix"] }
];

const SOURCE_MODEL_PATTERNS = [
  { brand: "Shure", model: "SM58", terms: ["sm58", "sm 58"] },
  { brand: "Shure", model: "Beta 58A", terms: ["beta58", "beta 58", "beta58a", "beta 58a"] },
  { brand: "Shure", model: "SM57", terms: ["sm57", "sm 57"] },
  { brand: "Generic", model: "Headworn", terms: ["headworn", "head worn", "headset mic", "headset microphone"] },
  { brand: "Generic", model: "Handheld", terms: ["handheld", "hand held"] },
  { brand: "Generic", model: "Piezo", terms: ["piezo"] }
];

const PRESET_CATEGORY_PATTERNS = [
  { category: "Utility", terms: ["utility", "flat"] },
  { category: "Vocal Mics", terms: ["vocal mics", "vocal mic", "mic preset", "microphone preset"] },
  { category: "Acoustic Guitars", terms: ["acoustic guitars", "acoustic guitar"] },
  { category: "Electric Guitars", terms: ["electric guitars", "electric guitar", "guitar amp"] },
  { category: "Keyboards", terms: ["keyboards", "keyboard", "keys"] },
  { category: "Basses", terms: ["basses", "bass"] },
  { category: "Percussion", terms: ["percussion", "kick", "overhead", "drum"] },
  { category: "DJ/Playback", terms: ["dj", "dj playback", "playback"] }
];

const PRESET_NAME_PATTERNS = [
  { category: "Utility", name: "Flat", terms: ["flat"] },
  { category: "Vocal Mics", name: "Handheld Mics", terms: ["handheld mics", "handheld mic", "handheld"] },
  { category: "Vocal Mics", name: "Headworn Mics", terms: ["headworn mics", "headworn mic", "headworn", "headset mic"] },
  { category: "Vocal Mics", name: "High Gain: Bright", terms: ["high gain bright"] },
  { category: "Vocal Mics", name: "High Gain: Normal", terms: ["high gain normal"] },
  { category: "Acoustic Guitars", name: "Steel String w/ piezo", terms: ["steel string", "piezo", "steel string piezo"] },
  { category: "Electric Guitars", name: "Mic'd Amp w/ SM57", terms: ["micd amp", "mic'd amp", "sm57 amp", "amp sm57"] },
  { category: "Keyboards", name: "General Keys", terms: ["general keys"] },
  { category: "Basses", name: "Active Bass 1", terms: ["active bass 1", "active bass"] },
  { category: "Percussion", name: "Kick, General", terms: ["kick general", "kick"] },
  { category: "Percussion", name: "General Overhead", terms: ["general overhead", "overhead"] },
  { category: "DJ/Playback", name: "Flat, zEQ Controls", terms: ["flat zeq", "z eq controls", "zeq controls", "dj playback"] }
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
  const deviceMatches = DEVICE_PATTERNS.filter((entry) => entry.terms.some((term) => normalized.includes(term)))
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.model === entry.model) === index);
  const device = deviceMatches[0] ?? null;
  const source = SOURCE_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const sourceBrand = SOURCE_BRAND_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const sourceModel = SOURCE_MODEL_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const presetCategory = PRESET_CATEGORY_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const presetName = PRESET_NAME_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const event = EVENT_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const venue = VENUE_PATTERNS.find((entry) => entry.terms.some((term) => normalized.includes(term))) ?? null;
  const mentionsPreset = /\b(tone ?match|preset|presets|dsp)\b/.test(normalized);
  const wantsPresetList = /\b(list|show|what|which|available)\b/.test(normalized) && mentionsPreset;

  return {
    raw: question,
    normalized,
    intent: wantsPresetList
      ? "list_presets"
      : (/\bcompare\b|\bvs\b|\bversus\b/.test(normalized) ? "compare" : "recommend_setup"),
    deviceMatches,
    deviceBrand: device?.brand ?? null,
    deviceModel: device?.model ?? null,
    deviceType: device?.type ?? null,
    sourceType: source?.type ?? null,
    sourceBrand: sourceModel?.brand ?? sourceBrand?.brand ?? null,
    sourceModel: sourceModel?.model ?? null,
    presetSystem: mentionsPreset ? "ToneMatch" : null,
    presetCategory: presetName?.category ?? presetCategory?.category ?? null,
    presetName: presetName?.name ?? null,
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
    record.sourceBrand,
    record.sourceModel,
    record.presetSystem,
    record.presetCategory,
    record.presetName,
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
  if (parsed.deviceType && normalizeText(record.deviceType) === normalizeText(parsed.deviceType)) {
    score += 18;
  }
  if (parsed.sourceType && normalizeText(record.sourceType) === normalizeText(parsed.sourceType)) {
    score += 24;
  }
  if (parsed.sourceBrand && normalizeText(record.sourceBrand) === normalizeText(parsed.sourceBrand)) {
    score += 16;
  }
  if (parsed.sourceModel && normalizeText(record.sourceModel) === normalizeText(parsed.sourceModel)) {
    score += 26;
  }
  if (parsed.presetSystem && normalizeText(record.presetSystem) === normalizeText(parsed.presetSystem)) {
    score += 20;
  }
  if (parsed.presetCategory && normalizeText(record.presetCategory) === normalizeText(parsed.presetCategory)) {
    score += 22;
  }
  if (parsed.presetName && normalizeText(record.presetName) === normalizeText(parsed.presetName)) {
    score += 28;
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

function pickSetupSections(setup, parsed) {
  const mapping = [
    { key: "toneMatch", terms: ["tonematch", "tone match", "preset", "presets", "dsp"] },
    { key: "system", terms: ["system", "master", "output", "foh", "front of house"] },
    { key: "gain", terms: ["gain", "trim", "preamp", "level"] },
    { key: "eq", terms: ["eq", "equalizer", "tone", "high", "low", "mid"] },
    { key: "fx", terms: ["fx", "effect", "reverb", "delay"] },
    { key: "monitor", terms: ["monitor", "feedback", "wedge", "speaker"] },
    { key: "placement", terms: ["placement", "position", "coverage", "angle", "array"] },
    { key: "notes", terms: ["note", "tips", "general", "setting", "settings"] }
  ];

  const focusedKeys = mapping
    .filter((entry) => entry.terms.some((term) => parsed.normalized.includes(term)))
    .map((entry) => entry.key)
    .filter((key, index, all) => all.indexOf(key) === index);

  if (!focusedKeys.length) {
    return ["toneMatch", "system", "gain", "eq", "fx", "monitor", "placement", "notes"].filter((key) => setup[key]);
  }

  return focusedKeys.filter((key) => setup[key]);
}

function buildFocusedSetup(setup, parsed) {
  const sections = pickSetupSections(setup, parsed);
  return Object.fromEntries(sections.map((key) => [key, setup[key]]).filter(([, value]) => value));
}

function buildFocusedSoundMatch(record, parsed) {
  const clarification = buildClarification(record, parsed);
  const focusedSetup = buildFocusedSetup(record.setup ?? {}, parsed);

  return {
    id: record.id,
    name: record.name,
    deviceBrand: record.deviceBrand,
    deviceModel: record.deviceModel,
    deviceType: record.deviceType,
    sourceType: record.sourceType,
    sourceBrand: record.sourceBrand,
    sourceModel: record.sourceModel,
    goal: record.goal,
    speakerConfig: record.speakerConfig,
    focusKeys: Object.keys(focusedSetup),
    focusedSetup,
    answer: buildRecallAnswer(record, parsed, clarification),
    subjectConstructId: `sound-${record.id}`
  };
}

function buildCombinedRecall(ranked, parsed) {
  const requestedDevices = Array.isArray(parsed.deviceMatches) ? parsed.deviceMatches : [];
  if (requestedDevices.length < 2) {
    return null;
  }

  const selected = [];
  const seen = new Set();

  for (const device of requestedDevices) {
    const match = ranked.find((record) => normalizeText(record.deviceModel) === normalizeText(device.model));
    if (!match || seen.has(match.id) || match.score < 40) {
      continue;
    }

    seen.add(match.id);
    selected.push(match);
  }

  if (selected.length < 2) {
    return null;
  }

  const matches = selected.map((record) => buildFocusedSoundMatch(record, parsed));
  const deviceList = matches.map((record) => [record.deviceBrand, record.deviceModel].filter(Boolean).join(" ")).join(" and ");
  const answer = `For ${deviceList}, ${matches.map((record) => {
    const setupLines = [
      record.focusedSetup.toneMatch ? `ToneMatch ${record.focusedSetup.toneMatch}` : null,
      record.focusedSetup.system ? `system ${record.focusedSetup.system}` : null,
      record.focusedSetup.gain ? `gain ${record.focusedSetup.gain}` : null,
      record.focusedSetup.eq ? `EQ ${record.focusedSetup.eq}` : null,
      record.focusedSetup.fx ? `FX ${record.focusedSetup.fx}` : null,
      record.focusedSetup.monitor ? `monitor ${record.focusedSetup.monitor}` : null,
      record.focusedSetup.placement ? `placement ${record.focusedSetup.placement}` : null,
      record.focusedSetup.notes ? `notes ${record.focusedSetup.notes}` : null
    ].filter(Boolean).join(", ");

    return `${record.deviceModel} should use ${setupLines}`;
  }).join("; ")}.`;

  return {
    ready: true,
    matches,
    answer,
    focusKeys: Array.from(new Set(matches.flatMap((record) => record.focusKeys)))
  };
}

export function summarizeSoundConstruct(question = "", construct = null, options = {}) {
  if (!construct || typeof construct !== "object") {
    return {
      parsed: parseSoundQuestion(question),
      clarification: null,
      focusedSetup: {},
      focusKeys: [],
      answer: null
    };
  }

  const parsed = typeof question === "string" ? parseSoundQuestion(question) : question;
  const clarification = options.clarification ?? buildClarification(construct, parsed);
  const focusedSetup = buildFocusedSetup(construct.setup ?? {}, parsed);

  return {
    parsed,
    clarification,
    focusedSetup,
    focusKeys: Object.keys(focusedSetup),
    answer: parsed.intent === "list_presets"
      ? buildPresetCatalogAnswer([construct], parsed)
      : buildRecallAnswer(construct, parsed, clarification)
  };
}

function buildClarification(record, parsed) {
  if (parsed.intent === "list_presets") {
    return null;
  }
  if (parsed.sourceType !== "microphone" || !parsed.sourceBrand || parsed.sourceModel) {
    return null;
  }
  if (normalizeText(parsed.sourceBrand) !== "shure") {
    return null;
  }

  return {
    missingField: "sourceModel",
    prompt: "What Shure mic model are you using (SM58, Beta 58A, or SM57)?"
  };
}

function buildRecallAnswer(record, parsed, clarification = null) {
  const setup = record.setup ?? {};
  const focusedSetup = buildFocusedSetup(setup, parsed);
  const lines = [
    `Strandspace recalled ${record.name}.`,
    record.sourceModel ? `Mic profile: ${record.sourceBrand ? `${record.sourceBrand} ` : ""}${record.sourceModel}.` : null,
    record.presetName ? `${record.presetSystem ?? "Preset"}: ${[record.presetCategory, record.presetName].filter(Boolean).join(" > ")}.` : null,
    focusedSetup.toneMatch ? `ToneMatch: ${focusedSetup.toneMatch}` : null,
    focusedSetup.system ? `System: ${focusedSetup.system}` : null,
    focusedSetup.gain ? `Gain: ${focusedSetup.gain}` : null,
    focusedSetup.eq ? `EQ: ${focusedSetup.eq}` : null,
    focusedSetup.fx ? `FX: ${focusedSetup.fx}` : null,
    focusedSetup.monitor ? `Monitor: ${focusedSetup.monitor}` : null,
    focusedSetup.placement ? `Placement: ${focusedSetup.placement}` : null,
    focusedSetup.notes ? `Notes: ${focusedSetup.notes}` : null,
    clarification?.prompt ?? null
  ].filter(Boolean);

  if (parsed.intent === "compare") {
    lines.unshift(`This is a stored construct for ${record.deviceBrand} ${record.deviceModel}. A full compare path can reuse it as one side of the comparison.`);
  }

  return lines.join(" ");
}

function buildPresetCatalogAnswer(records = [], parsed = {}) {
  const items = [];
  const seen = new Set();

  for (const record of records) {
    const key = [record.presetCategory, record.presetName].filter(Boolean).join("::");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(`${record.presetCategory} > ${record.presetName}`);
  }

  if (!items.length) {
    return null;
  }

  return `Stored ${parsed.presetSystem ?? "preset"} options for ${[parsed.deviceBrand, parsed.deviceModel].filter(Boolean).join(" ") || "this mixer"}: ${items.join("; ")}.`;
}

function needsSpecificConstruct(record, parsed) {
  if (!record || !parsed.sourceModel) {
    return false;
  }

  return normalizeText(record.sourceModel) !== normalizeText(parsed.sourceModel);
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

  const presetMatches = ranked.filter((record) => record.presetName || record.presetCategory);
  const combined = buildCombinedRecall(ranked, parsed);
  const winner = parsed.intent === "list_presets"
    ? (presetMatches[0] ?? ranked[0] ?? null)
    : (ranked[0] ?? null);
  const ready = combined?.ready
    ? true
    : parsed.intent === "list_presets"
    ? Boolean((presetMatches.length || ranked.length) && parsed.deviceModel)
    : Boolean(winner && winner.score >= 55);
  const clarification = ready && winner ? buildClarification(winner, parsed) : null;
  const focusedSetup = combined?.matches?.length
    ? Object.fromEntries(combined.matches.map((match) => [match.deviceModel, match.focusedSetup]))
    : (ready && winner ? buildFocusedSetup(winner.setup ?? {}, parsed) : {});
  const recommendation = combined?.ready
    ? "use_strandspace_combined"
    : ready
    ? (needsSpecificConstruct(winner, parsed) ? "use_strandspace_as_base_and_store_specific" : "use_strandspace")
    : "fallback_to_llm_and_store";

  return {
    question,
    parsed,
    ready,
    combined,
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
    clarification,
    focusedSetup,
    focusKeys: combined?.focusKeys ?? Object.keys(focusedSetup),
    answer: combined?.answer
      ? combined.answer
      : ready && winner
      ? (parsed.intent === "list_presets"
          ? buildPresetCatalogAnswer(presetMatches.length ? presetMatches : ranked, parsed)
          : buildRecallAnswer(winner, parsed, clarification))
      : null,
    recommendation,
    readiness: {
      hasDevice: Boolean(parsed.deviceModel),
      hasSource: Boolean(parsed.sourceType),
      hasContext: Boolean(parsed.eventType || parsed.venueSize),
      matchedScore: Number(winner?.score ?? 0),
      threshold: 55
    }
  };
}
