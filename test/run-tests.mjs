import assert from "node:assert/strict";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const docsDir = join(rootDir, "docs");
const tempDir = join(rootDir, "tmp", "tests");
const tempDatabasePath = join(tempDir, `strandspace-test-${Date.now()}.sqlite`);
const tempDocPaths = [];
const tempDatabasePaths = [tempDatabasePath];

await mkdir(tempDir, { recursive: true });
process.env.STRANDSPACE_DB_PATH = tempDatabasePath;

const { createApp, migrateLegacyDatabase, sanitizeLegacyProvenance } = await import("../server.mjs");
const { assertLocalhostRequest, isLocalhostAddress } = await import("../server/security.mjs");
const { __resetOpenAiAssistState, __setOpenAiAssistMock } = await import("../strandspace/openai-assist.js");
const {
  ensureSubjectspaceTables,
  getSubjectConstruct,
  ingestConversationToConstructs,
  listConstructLinks,
  listSubjectConstructs,
  recallSubjectSpace,
  upsertStrandBinder,
  upsertSubjectConstruct
} = await import("../strandspace/subjectspace.js");
const {
  ensureSoundspaceTables,
  listSoundConstructs,
  parseSoundQuestion,
  recallSoundspace,
  upsertSoundConstruct
} = await import("../strandspace/soundspace.js");

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

async function withServer(run) {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    await run(address);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return response;
}

async function createTempDocFixture(name = `subjectspace-test-manual-${Date.now()}.pdf`) {
  await mkdir(docsDir, { recursive: true });
  const filePath = join(docsDir, name);
  await writeFile(filePath, "manual fixture");
  tempDocPaths.push(filePath);
  return {
    fileName: name,
    filePath
  };
}

async function registerTempDatabasePath(filePath) {
  tempDatabasePaths.push(filePath);
  return filePath;
}

async function createSubjectConstruct(port, overrides = {}) {
  const payload = {
    subjectLabel: `Subjectspace Test ${Date.now()}`,
    constructLabel: "Gallery interview key light recall",
    target: "Key light for a seated interview",
    objective: "soft face lighting with gentle background separation",
    context: "room: small gallery\ncamera: medium close-up\nkey light: large softbox at 45 degrees",
    steps: "Raise the key until the cheek has shape\nAdd negative fill only if the jaw disappears\nKeep the background about one stop under the face",
    notes: "Use this when speed matters more than dramatic contrast.",
    tags: "lighting, interview, softbox",
    ...overrides
  };

  const response = await postJson(`http://127.0.0.1:${port}/api/subjectspace/learn`, payload);
  assert.equal(response.status, 200);
  const learned = await response.json();
  return learned.construct;
}

function createWeightedRecallFixtureDb() {
  const db = new DatabaseSync(":memory:");
  ensureSubjectspaceTables(db);

  upsertSubjectConstruct(db, {
    subjectId: "music-engineering",
    subjectLabel: "Music Engineering",
    constructLabel: "Lead vocal small room recall",
    target: "Lead vocal chain for a compact room",
    objective: "clean vocal presence with safe gain staging",
    context: {
      room: "small room",
      console: "Bose T8S",
      source: "wired vocal mic"
    },
    steps: [
      "Set input gain before touching EQ.",
      "Keep vocal reverb light until the room fills up.",
      "Watch the monitor mix before adding more vocal level."
    ],
    notes: "Use this for a lead vocal in a compact room when vocal clarity matters most.",
    tags: ["lead vocal", "small room", "gain staging", "monitor mix"]
  });

  upsertSubjectConstruct(db, {
    subjectId: "music-engineering",
    subjectLabel: "Music Engineering",
    constructLabel: "Lead vocal dry room recall",
    target: "Lead vocal chain without vocal wash",
    objective: "clean singer presence without reverb",
    context: {
      room: "small room",
      console: "Bose T8S"
    },
    steps: [
      "Set input gain first.",
      "Leave the channel dry.",
      "Use monitor placement before adding more level."
    ],
    notes: "Use this when the singer needs a dry vocal and the room is already lively.",
    tags: ["lead vocal", "dry vocal", "small room"]
  });

  upsertSubjectConstruct(db, {
    subjectId: "music-engineering",
    subjectLabel: "Music Engineering",
    constructLabel: "Conference room playback recall",
    target: "Conference room speech and playback",
    objective: "clear spoken word with stable backing track level",
    context: {
      room: "conference room",
      source: "playback track"
    },
    steps: [
      "Set speech first.",
      "Bring the backing track up under speech.",
      "Keep playback level consistent."
    ],
    notes: "Conference room playback should stay underneath the presenter.",
    tags: ["conference room", "playback", "speech"]
  });

  upsertSubjectConstruct(db, {
    subjectId: "music-engineering",
    subjectLabel: "Music Engineering",
    constructLabel: "Parallel compression drum bus recall",
    target: "Parallel compression on the drum bus",
    objective: "fatter drum energy without losing transient snap",
    context: {
      room: "studio control room"
    },
    steps: [
      "Blend the compressed return under the dry drums.",
      "Keep the parallel path punchy."
    ],
    notes: "Parallel compression works best when the dry kit still carries the attack.",
    tags: ["parallel compression", "drum bus"]
  });

  return db;
}

await check("GET / serves the public Strandspace landing page", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>Strandspace<\/title>/);
    assert.match(html, /Build a construct, pick a topic, then work the memory like a live field/i);
    assert.match(html, /Open A Local Strandspace Topic/i);
  });
});

await check("GET /backend serves the backend construct workspace", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/backend`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Strandspace Backend/);
    assert.match(html, /Backend Data Browser/i);
  });
});

await check("GET /studio aliases to the backend workspace", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/studio`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Strandspace Backend/);
    assert.match(html, /SQLite Editor/);
  });
});

await check("GET /soundspace redirects to the unified music-engineering topic view", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/soundspace`);
    assert.equal(response.status, 200);
    assert.equal(response.redirected, true);
    assert.match(response.url, /\/subject\?subjectId=music-engineering$/);
    const html = await response.text();
    assert.match(html, /Strandspace Topic View/);
    assert.match(html, /Ask The Stored Topic/i);
    assert.match(html, /Stored Constructs/i);
  });
});

await check("GET /subject serves the generic subject recall app", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/subject`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Strandspace Topic View/);
    assert.match(html, /Ask The Stored Topic/i);
    assert.match(html, /Stored Constructs/i);
  });
});

await check("GET /api/subjectspace/subjects exposes music engineering seeds", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/subjects`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.subjects));
    assert.ok(payload.subjects.some((subject) => subject.subjectId === "music-engineering"));
    assert.ok(payload.defaultSubjectId);
  });
});

await check("POST /api/system/reset-examples restores the bundled demo constructs", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/system/reset-examples`, {});
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.ok(Number(payload.subjectCount) >= 10);
    assert.ok(Number(payload.soundCount) >= 10);
    assert.ok(Array.isArray(payload.subjects));
    assert.ok(payload.subjects.some((subject) => subject.subjectId === "music-engineering"));
  });
});

await check("GET /api/system/health reports the active mode and DB connection", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/system/health`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.ok(["assist-enabled", "local-only"].includes(payload.mode));
    assert.equal(payload.database.connected, true);
    assert.match(String(payload.database.path), /strandspace/i);
    assert.equal(typeof payload.remoteAllowed, "boolean");
  });
});

await check("GET /api/system/threat-model exposes the documented threat model", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/system/threat-model`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.name, "string");
    assert.equal(typeof payload.summary, "string");
    assert.ok(Array.isArray(payload.threats));
    assert.ok(payload.threats.some((threat) => typeof threat.id === "string"));
  });
});

await check("security module locally allows localhost requests and rejects remote requests by default", async () => {
  assert.equal(isLocalhostAddress("127.0.0.1"), true);
  assert.equal(isLocalhostAddress("::1"), true);
  assert.equal(isLocalhostAddress("::ffff:127.0.0.1"), true);
  assert.throws(() => assertLocalhostRequest({ socket: { remoteAddress: "203.0.113.42" } }));
  process.env.STRANDSPACE_ALLOW_REMOTE = "true";
  assert.doesNotThrow(() => assertLocalhostRequest({ socket: { remoteAddress: "203.0.113.42" } }));
  delete process.env.STRANDSPACE_ALLOW_REMOTE;
});

await check("POST /api/subjectspace/build rejects missing input with schema validation", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/build`, {
      subjectId: "music-engineering"
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "input is required");
  });
});

await check("GET /api/backend/overview reports backend counts and tables", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/backend/overview`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.ok(payload.database?.connected);
    assert.ok(Number.isFinite(Number(payload.database?.sizeBytes ?? 0)));
    assert.ok(Number(payload.database?.sizeBytes ?? 0) >= 0);
    assert.ok(Array.isArray(payload.tables));
    assert.ok(payload.tables.some((table) => table.name === "subject_constructs"));
    assert.ok(payload.tables.some((table) => table.name === "sound_constructs"));
    assert.ok(Number(payload.counts?.subjectCount) >= 1);
  });
});

await check("GET /api/backend/db/table exposes schema and rows for a safe table browser", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/backend/db/table?table=subject_constructs&limit=5`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.table?.name, "subject_constructs");
    assert.ok(Array.isArray(payload.columns));
    assert.ok(payload.columns.some((column) => column.name === "constructLabel"));
    assert.ok(Array.isArray(payload.rows));
    assert.ok(payload.rows.length >= 1);
  });
});

await check("POST /api/backend/db/row updates an editable subject construct row", async () => {
  await withServer(async (address) => {
    const libraryResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=music-engineering`);
    assert.equal(libraryResponse.status, 200);
    const libraryPayload = await libraryResponse.json();
    const editableConstruct = libraryPayload.constructs.find((construct) => !String(construct.id ?? "").startsWith("sound-"));
    assert.ok(editableConstruct);

    const updatedNotes = `Backend editor update ${Date.now()}`;
    const updateResponse = await postJson(`http://127.0.0.1:${address.port}/api/backend/db/row`, {
      table: "subject_constructs",
      id: editableConstruct.id,
      changes: {
        notes: updatedNotes
      }
    });

    assert.equal(updateResponse.status, 200);
    const updatePayload = await updateResponse.json();
    assert.equal(updatePayload.ok, true);
    assert.equal(updatePayload.row?.notes, updatedNotes);

    const refreshedLibraryResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=${encodeURIComponent(editableConstruct.subjectId)}`);
    assert.equal(refreshedLibraryResponse.status, 200);
    const refreshedLibrary = await refreshedLibraryResponse.json();
    assert.equal(
      refreshedLibrary.constructs.find((construct) => construct.id === editableConstruct.id)?.notes,
      updatedNotes
    );
  });
});

await check("GET /api/subjectspace/subjects prefers the most recently updated subject", async () => {
  await withServer(async (address) => {
    const first = await createSubjectConstruct(address.port, {
      subjectLabel: `Recent Subject A ${Date.now()}`
    });

    const second = await createSubjectConstruct(address.port, {
      subjectLabel: `Recent Subject B ${Date.now() + 1}`
    });

    const response = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/subjects`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.defaultSubjectId, second.subjectId);
    assert.notEqual(payload.defaultSubjectId, first.subjectId);
  });
});

await check("legacy provenance cleanup removes gardener audience markers", async () => {
  assert.deepEqual(
    sanitizeLegacyProvenance({
      source: "openai-responses",
      learnedFromQuestion: "What is my setup?",
      audience: "gardener"
    }),
    {
      source: "openai-responses",
      learnedFromQuestion: "What is my setup?"
    }
  );

  assert.equal(
    sanitizeLegacyProvenance({
      audience: "gardener"
    }),
    null
  );
});

await check("legacy database migration creates a clean strandspace database", async () => {
  const legacyPath = await registerTempDatabasePath(join(tempDir, `rootline-legacy-${Date.now()}.sqlite`));
  const preferredPath = await registerTempDatabasePath(join(tempDir, `strandspace-preferred-${Date.now()}.sqlite`));
  const legacyDb = new DatabaseSync(legacyPath);

  try {
    ensureSubjectspaceTables(legacyDb);
    ensureSoundspaceTables(legacyDb);

    const subjectConstruct = upsertSubjectConstruct(legacyDb, {
      subjectLabel: "Portrait Lighting",
      constructLabel: "Gallery interview key light recall",
      target: "Key light for a seated interview",
      objective: "soft face lighting with gentle background separation",
      context: {
        room: "small gallery",
        camera: "medium close-up"
      },
      steps: [
        "Raise the key until the cheek has shape",
        "Add negative fill only if the jaw disappears"
      ],
      notes: "Legacy construct that should migrate cleanly.",
      tags: ["lighting", "interview"],
      provenance: {
        source: "manual",
        audience: "gardener"
      }
    });

    legacyDb.prepare("UPDATE subject_constructs SET learnedCount = ?, updatedAt = ? WHERE id = ?").run(
      5,
      "2026-04-15T15:02:17.569Z",
      subjectConstruct.id
    );

    const soundConstruct = upsertSoundConstruct(legacyDb, {
      id: "yamaha-mg10xu-test-host",
      name: "Yamaha MG10XU test host setup",
      deviceBrand: "Yamaha",
      deviceModel: "MG10XU",
      deviceType: "mixer",
      sourceType: "microphone",
      goal: "clear host mic",
      venueSize: "medium",
      eventType: "music bingo",
      speakerConfig: "two powered speakers",
      setup: {
        gain: "Set clean speech gain."
      },
      tags: ["host mic"],
      strands: ["device:yamaha_mg10xu"],
      provenance: {
        source: "openai-responses",
        audience: "gardener"
      }
    });

    legacyDb.prepare("UPDATE sound_constructs SET learnedCount = ?, updatedAt = ? WHERE id = ?").run(
      3,
      "2026-04-15T05:45:13.768Z",
      soundConstruct.id
    );
  } finally {
    legacyDb.close();
  }

  const migrated = migrateLegacyDatabase(legacyPath, preferredPath);
  assert.equal(migrated.subjectCount, 1);
  assert.equal(migrated.soundCount, 1);

  const preferredDb = new DatabaseSync(preferredPath);

  try {
    const migratedSubject = getSubjectConstruct(preferredDb, "portrait-lighting-gallery-interview-key-light-recall");
    assert.ok(migratedSubject);
    assert.equal(migratedSubject.learnedCount, 5);
    assert.equal(migratedSubject.updatedAt, "2026-04-15T15:02:17.569Z");
    assert.equal(migratedSubject.provenance?.audience, undefined);

    const migratedSounds = listSoundConstructs(preferredDb);
    assert.equal(migratedSounds.length, 1);
    assert.equal(migratedSounds[0].learnedCount, 3);
    assert.equal(migratedSounds[0].provenance?.audience, undefined);

    const migratedSubjects = listSubjectConstructs(preferredDb);
    assert.equal(migratedSubjects.length, 1);
  } finally {
    preferredDb.close();
  }
});

await check("ensureSubjectspaceTables upgrades older subjectspace tables with related construct ids", async () => {
  const legacyPath = await registerTempDatabasePath(join(tempDir, `subjectspace-legacy-columns-${Date.now()}.sqlite`));
  const legacyDb = new DatabaseSync(legacyPath);

  try {
    legacyDb.exec(`
      CREATE TABLE subject_constructs (
        id TEXT PRIMARY KEY,
        subjectId TEXT NOT NULL,
        subjectLabel TEXT NOT NULL,
        constructLabel TEXT NOT NULL,
        target TEXT,
        objective TEXT,
        contextJson TEXT NOT NULL,
        stepsJson TEXT NOT NULL,
        notes TEXT,
        tagsJson TEXT NOT NULL,
        strandsJson TEXT NOT NULL,
        provenanceJson TEXT,
        learnedCount INTEGER NOT NULL DEFAULT 1,
        updatedAt TEXT NOT NULL
      );
    `);

    ensureSubjectspaceTables(legacyDb);

    const columns = legacyDb.prepare("PRAGMA table_info(subject_constructs)").all();
    assert.ok(columns.some((column) => column.name === "relatedConstructIdsJson"));
    const subjectStrandTables = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'subject_strands'").all();
    const constructStrandTables = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'construct_strands'").all();
    assert.equal(subjectStrandTables.length, 1);
    assert.equal(constructStrandTables.length, 1);
  } finally {
    legacyDb.close();
  }
});

await check("ensureSoundspaceTables upgrades older soundspace tables before creating new indexes", async () => {
  const legacyPath = await registerTempDatabasePath(join(tempDir, `soundspace-legacy-columns-${Date.now()}.sqlite`));
  const legacyDb = new DatabaseSync(legacyPath);

  try {
    legacyDb.exec(`
      CREATE TABLE sound_constructs (
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
    `);

    ensureSoundspaceTables(legacyDb);

    const columns = legacyDb.prepare("PRAGMA table_info(sound_constructs)").all();
    assert.ok(columns.some((column) => column.name === "sourceBrand"));
    assert.ok(columns.some((column) => column.name === "sourceModel"));
    assert.ok(columns.some((column) => column.name === "presetSystem"));
    assert.ok(columns.some((column) => column.name === "presetCategory"));
    assert.ok(columns.some((column) => column.name === "presetName"));

    const indexes = legacyDb.prepare("PRAGMA index_list(sound_constructs)").all();
    assert.ok(indexes.some((index) => index.name === "idx_sound_constructs_source_model"));
    assert.ok(indexes.some((index) => index.name === "idx_sound_constructs_preset"));
  } finally {
    legacyDb.close();
  }
});

await check("empty subjectspace recall returns a clear teach-first message", async () => {
  const emptyDbPath = await registerTempDatabasePath(join(tempDir, `subjectspace-empty-${Date.now()}.sqlite`));
  const emptyDb = new DatabaseSync(emptyDbPath);

  try {
    ensureSubjectspaceTables(emptyDb);
    const recall = recallSubjectSpace(emptyDb, {
      subjectId: "music-engineering",
      question: "How do I set gain staging for a vocal?"
    });

    assert.equal(recall.ready, false);
    assert.equal(recall.readiness.libraryCount, 0);
    assert.equal(recall.routing?.mode, "teach_local");
    assert.match(String(recall.answer), /Teach one strong construct|No constructs are stored/i);
  } finally {
    emptyDb.close();
  }
});

await check("weighted subjectspace recall handles exact, reordered, and partial wording", async () => {
  const db = createWeightedRecallFixtureDb();

  try {
    const exact = recallSubjectSpace(db, {
      subjectId: "music-engineering",
      question: "Recall my lead vocal small room setup."
    });
    assert.equal(exact.ready, true);
    assert.equal(exact.matched?.constructLabel, "Lead vocal small room recall");

    const reordered = recallSubjectSpace(db, {
      subjectId: "music-engineering",
      question: "In a small room, what is my setup for lead vocal?"
    });
    assert.equal(reordered.ready, true);
    assert.equal(reordered.matched?.constructLabel, "Lead vocal small room recall");

    const partial = recallSubjectSpace(db, {
      subjectId: "music-engineering",
      question: "lead vocal room"
    });
    assert.equal(partial.ready, true);
    assert.equal(partial.matched?.constructLabel, "Lead vocal small room recall");
  } finally {
    db.close();
  }
});

await check("weighted subjectspace recall uses synonym aliases and exposes them in support and trace", async () => {
  const db = createWeightedRecallFixtureDb();

  try {
    const recall = recallSubjectSpace(db, {
      subjectId: "music-engineering",
      question: "What is my singer setup for a small venue?"
    });

    assert.equal(recall.ready, true);
    assert.equal(recall.matched?.constructLabel, "Lead vocal small room recall");
    assert.ok(Array.isArray(recall.matched?.aliasHits));
    assert.ok(recall.matched.aliasHits.some((hit) => hit.source === "singer" && /vocal/.test(String(hit.term))));
    assert.ok(Array.isArray(recall.trace?.aliasStrands));
    assert.ok(recall.trace.aliasStrands.some((entry) => entry.name === "singer"));
    assert.ok(Array.isArray(recall.matched?.support));
    assert.ok(recall.matched.support.some((entry) => Array.isArray(entry.aliasHits) && entry.aliasHits.length > 0));
  } finally {
    db.close();
  }
});

await check("weighted subjectspace recall gives phrase-level concepts extra precision", async () => {
  const db = createWeightedRecallFixtureDb();

  try {
    const conferenceRecall = recallSubjectSpace(db, {
      subjectId: "music-engineering",
      question: "conference room backing track"
    });
    assert.equal(conferenceRecall.ready, true);
    assert.equal(conferenceRecall.matched?.constructLabel, "Conference room playback recall");
    assert.ok(Array.isArray(conferenceRecall.matched?.phraseHits));
    assert.ok(conferenceRecall.matched.phraseHits.some((hit) => hit.source === "conference room"));

    const compressionRecall = recallSubjectSpace(db, {
      subjectId: "music-engineering",
      question: "parallel compression for drums"
    });
    assert.equal(compressionRecall.ready, true);
    assert.equal(compressionRecall.matched?.constructLabel, "Parallel compression drum bus recall");
    assert.ok(compressionRecall.matched.phraseHits.some((hit) => hit.source === "parallel compression"));
  } finally {
    db.close();
  }
});

await check("weighted subjectspace recall penalizes excluded cues and preserves explainability", async () => {
  const db = createWeightedRecallFixtureDb();

  try {
    const recall = recallSubjectSpace(db, {
      subjectId: "music-engineering",
      question: "lead vocal small room without reverb"
    });

    assert.equal(recall.ready, true);
    assert.ok(Array.isArray(recall.parsed?.exclusions));
    assert.ok(recall.parsed.exclusions.some((entry) => entry.cue === "reverb"));
    assert.ok(Array.isArray(recall.candidates));
    assert.ok(recall.candidates.some((candidate) => candidate.constructLabel === "Lead vocal small room recall" && Array.isArray(candidate.excludedHits) && candidate.excludedHits.some((entry) => entry.cue === "reverb")));
    assert.ok(Array.isArray(recall.routing?.exclusions));
    assert.ok(recall.routing.exclusions.includes("reverb"));
    assert.ok(Array.isArray(recall.trace?.exclusionStrands));
    assert.ok(recall.trace.exclusionStrands.some((entry) => entry.name === "reverb"));
  } finally {
    db.close();
  }
});

await check("strand binders reinforce plausible pairings and expose binder trace details", async () => {
  const db = new DatabaseSync(":memory:");
  ensureSubjectspaceTables(db);

  try {
    upsertSubjectConstruct(db, {
      subjectId: "care-guides",
      subjectLabel: "Care Guides",
      constructLabel: "Baby bottle milk warming recall",
      target: "Warm a baby bottle with milk safely",
      objective: "feeding prep without hotspots",
      context: {
        routine: "baby bottle",
        liquid: "milk"
      },
      steps: [
        "Check the bottle temperature before feeding.",
        "Swirl the milk instead of shaking hard."
      ],
      tags: ["baby bottle", "milk", "feeding"]
    });
    upsertSubjectConstruct(db, {
      subjectId: "care-guides",
      subjectLabel: "Care Guides",
      constructLabel: "Whiskey bottle shelf recall",
      target: "Store a whiskey bottle for display",
      objective: "bar shelf organization",
      context: {
        routine: "glass bottle",
        liquid: "whiskey"
      },
      steps: [
        "Keep the bottle upright.",
        "Avoid direct sun on the label."
      ],
      tags: ["bottle", "whiskey", "bar"]
    });
    upsertStrandBinder(db, {
      subjectId: "care-guides",
      leftTerm: "baby bottle",
      rightTerm: "milk",
      weight: 4.5,
      reason: "feeding pair"
    });
    upsertStrandBinder(db, {
      subjectId: "care-guides",
      leftTerm: "bottle",
      rightTerm: "whiskey",
      weight: -3.2,
      reason: "suppress bar-shelf overlap for feeding questions"
    });

    const recall = recallSubjectSpace(db, {
      subjectId: "care-guides",
      question: "what is the baby bottle milk setup"
    });

    assert.equal(recall.ready, true);
    assert.equal(recall.matched?.constructLabel, "Baby bottle milk warming recall");
    assert.ok(Array.isArray(recall.matched?.binderHits));
    assert.ok(recall.matched.binderHits.some((hit) => hit.leftTerm === "baby bottle" && hit.rightTerm === "milk"));
    assert.ok(Array.isArray(recall.trace?.binderStrands));
    assert.ok(recall.trace.binderStrands.some((entry) => /baby bottle \+ milk/i.test(entry.name)));
  } finally {
    db.close();
  }
});

await check("subject construct saves create related construct links and similar drafts merge instead of duplicating", async () => {
  const db = new DatabaseSync(":memory:");
  ensureSubjectspaceTables(db);

  try {
    const base = upsertSubjectConstruct(db, {
      subjectId: "portrait-lighting",
      subjectLabel: "Portrait Lighting",
      constructLabel: "Gallery interview key light recall",
      target: "Key light for a seated interview",
      objective: "soft face lighting with gentle background separation",
      context: {
        room: "small gallery",
        camera: "medium close-up"
      },
      steps: [
        "Raise the key until the cheek has shape.",
        "Keep the background under the face."
      ],
      tags: ["lighting", "interview", "softbox"]
    });
    const linked = upsertSubjectConstruct(db, {
      subjectId: "portrait-lighting",
      subjectLabel: "Portrait Lighting",
      constructLabel: "Gallery interview hair light recall",
      target: "Hair light for a seated interview",
      objective: "separate a dark jacket from the background",
      context: {
        room: "small gallery",
        camera: "medium close-up"
      },
      steps: [
        "Feather the edge light behind the shoulder.",
        "Keep the edge subtler than the key."
      ],
      tags: ["lighting", "interview", "separation"]
    });
    const links = listConstructLinks(db, base.id);
    assert.ok(links.some((entry) => entry.relatedConstructId === linked.id));

    const merged = upsertSubjectConstruct(db, {
      subjectLabel: "Portrait Lighting",
      constructLabel: "Gallery interview soft key memory",
      target: "Key light for a seated interview",
      objective: "soft face lighting with gentle background separation",
      context: {
        room: "small gallery",
        background: "charcoal roll"
      },
      steps: [
        "Raise the key until the cheek has shape.",
        "Add a shoulder edge only if the jacket disappears."
      ],
      notes: "Add this when the jacket gets lost in the backdrop.",
      tags: ["lighting", "interview", "separation"]
    });

    assert.equal(merged.id, base.id);
    assert.equal(listSubjectConstructs(db, "portrait-lighting").length, 2);
    assert.match(String(merged.notes), /jacket gets lost/i);
    assert.equal(merged.context.background, "charcoal roll");
  } finally {
    db.close();
  }
});

await check("subjectspace recall returns explicit related constructs for recipe-style constructs", async () => {
  const db = new DatabaseSync(":memory:");
  ensureSubjectspaceTables(db);

  try {
    const almondFlour = upsertSubjectConstruct(db, {
      subjectId: "diabetic-baking",
      subjectLabel: "Diabetic Baking",
      constructLabel: "Diabetic bread: almond flour",
      target: "Almond flour ingredient note",
      objective: "use almond flour as the main low-carb base",
      context: {
        ingredient: "almond flour",
        amount: "2 cups"
      },
      steps: [
        "Sift the almond flour before mixing.",
        "Keep it dry so the loaf does not collapse."
      ],
      tags: ["ingredient", "almond flour", "bread"]
    });

    const xanthanGum = upsertSubjectConstruct(db, {
      subjectId: "diabetic-baking",
      subjectLabel: "Diabetic Baking",
      constructLabel: "Diabetic bread: xanthan gum",
      target: "Xanthan gum ingredient note",
      objective: "use xanthan gum for structure and lift",
      context: {
        ingredient: "xanthan gum",
        amount: "1 teaspoon"
      },
      steps: [
        "Whisk it into the dry ingredients first."
      ],
      tags: ["ingredient", "xanthan gum", "bread"]
    });

    const recipe = upsertSubjectConstruct(db, {
      subjectId: "diabetic-baking",
      subjectLabel: "Diabetic Baking",
      constructLabel: "Diabetic bread recipe",
      target: "Low-carb sandwich bread",
      objective: "build a diabetic-friendly bread loaf with structure and a usable crumb",
      context: {
        loaf: "8 inch pan"
      },
      steps: [
        "Mix the dry ingredients first.",
        "Fold the wet ingredients in gently.",
        "Bake until the center sets."
      ],
      notes: "Use the linked ingredient constructs as the ingredient memory for this recipe.",
      tags: ["recipe", "bread", "diabetic"],
      relatedConstructIds: [almondFlour.id, ` ${xanthanGum.id} `, almondFlour.id]
    });

    assert.deepEqual(recipe.relatedConstructIds, [almondFlour.id, xanthanGum.id]);

    const storedRecipe = getSubjectConstruct(db, recipe.id);
    assert.deepEqual(storedRecipe.relatedConstructIds, [almondFlour.id, xanthanGum.id]);

    const recall = recallSubjectSpace(db, {
      subjectId: "diabetic-baking",
      question: "What is my diabetic bread recipe?"
    });

    assert.equal(recall.ready, true);
    assert.equal(recall.matched?.constructLabel, "Diabetic bread recipe");
    assert.deepEqual(recall.matched?.relatedConstructIds, [almondFlour.id, xanthanGum.id]);
    assert.equal(recall.relatedConstructs.length, 2);
    assert.deepEqual(
      recall.relatedConstructs.map((construct) => construct.constructLabel),
      ["Diabetic bread: almond flour", "Diabetic bread: xanthan gum"]
    );
  } finally {
    db.close();
  }
});

await check("conversation ingestion distills chat into one or more constructs without storing raw chat", async () => {
  const drafts = ingestConversationToConstructs({
    subjectLabel: "Music Engineering",
    messages: [
      {
        role: "user",
        content: "I need a karaoke vocal reset for a Bose T8S."
      },
      {
        role: "assistant",
        content: [
          "Subject: Music Engineering",
          "Construct Label: Karaoke vocal reset recall",
          "Target: Bose T8S karaoke vocal chain",
          "Objective: clean gain before feedback",
          "Context:",
          "mixer: Bose T8S",
          "room: karaoke bar",
          "Steps:",
          "- Set receiver output before mixer trim",
          "- Ring out the monitors before adding reverb",
          "Notes: Reusable karaoke reset starting point.",
          "Tags: karaoke, vocal, gain staging"
        ].join("\n")
      }
    ]
  });

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].subjectId, "music-engineering");
  assert.equal(drafts[0].constructLabel, "Karaoke vocal reset recall");
  assert.equal(drafts[0].context.mixer, "Bose T8S");
  assert.match(String(drafts[0].provenance?.source), /conversation-ingest/);
});

await check("POST /api/subjectspace/learn stores and recalls a custom construct", async () => {
  await withServer(async (address) => {
    const construct = await createSubjectConstruct(address.port, {
      subjectLabel: `Recall Test Subject ${Date.now()}`
    });

    const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/answer`, {
      subjectId: construct.subjectId,
      question: "What is my gallery interview key light setup with the softbox at 45 degrees?"
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "strandspace");
    assert.equal(payload.recall.ready, true);
    assert.equal(payload.construct.subjectId, construct.subjectId);
    assert.match(payload.answer, /gallery|soft face lighting|seated interview/i);
    assert.ok((payload.construct.constructStrands?.length ?? 0) > 0);
    assert.ok((payload.recall.trace?.triggerStrands?.length ?? 0) > 0);
    assert.ok((payload.recall.trace?.compositeStrands?.length ?? 0) > 0);
    assert.ok((payload.recall.trace?.persistentStrands?.length ?? 0) > 0);
    assert.ok((payload.recall.trace?.activatedStrands?.length ?? 0) > 0);
    assert.equal(payload.recall.routing?.mode, "local_recall");
    assert.equal(payload.recall.routing?.apiRecommended, false);
  });
});

await check("subjectspace routes narrow-but-ambiguous recall toward API validation", async () => {
  await withServer(async (address) => {
    const construct = await createSubjectConstruct(address.port, {
      subjectLabel: `Validation Test Subject ${Date.now()}`
    });

    const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/answer`, {
      subjectId: construct.subjectId,
      question: "What is my gallery interview tungsten setup?"
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.recall.ready, true);
    assert.equal(payload.recall.routing?.mode, "api_validate");
    assert.equal(payload.recall.routing?.apiRecommended, true);
    assert.ok(String(payload.recall.routing?.promptDraft ?? "").includes("gallery interview tungsten setup"));
  });
});

await check("GET /api/subjectspace/assist/status reports disabled without an API key", async () => {
  __resetOpenAiAssistState();
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalDisableLookup = process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP;
  delete process.env.OPENAI_API_KEY;
  process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP = "1";

  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/assist/status`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.enabled, false);
    assert.ok(String(payload.reason).includes("OPENAI_API_KEY"));
  });

  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
  if (originalDisableLookup === undefined) {
    delete process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP;
  } else {
    process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP = originalDisableLookup;
  }
  __resetOpenAiAssistState();
});

await check("POST /api/subjectspace/build drafts a construct from freeform input and the draft can be saved", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/build`, {
      preferApi: false,
      subjectLabel: "Portrait Lighting",
      input: [
        "Subject: Portrait Lighting",
        "Target: Key light for a seated interview",
        "Objective: soft face lighting with gentle background separation",
        "Context:",
        "room: small gallery",
        "camera: medium close-up",
        "key light: large softbox at 45 degrees",
        "Steps:",
        "- Raise the key until the cheek has shape",
        "- Add negative fill only if the jaw disappears",
        "- Keep the background about one stop under the face",
        "Notes: Use this when speed matters more than dramatic contrast.",
        "Tags: lighting, interview, softbox"
      ].join("\n")
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "heuristic");
    assert.equal(payload.suggestedConstruct.subjectLabel, "Portrait Lighting");
    assert.equal(payload.suggestedConstruct.target, "Key light for a seated interview");
    assert.match(payload.suggestedConstruct.constructLabel, /recall/i);
    assert.equal(payload.suggestedConstruct.context.room, "small gallery");
    assert.equal(payload.suggestedConstruct.context.camera, "medium close-up");
    assert.ok((payload.suggestedConstruct.steps?.length ?? 0) >= 3);
    assert.ok((payload.promptMetrics?.estimatedTokens ?? 0) > 0);

    const saveResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/learn`, payload.suggestedConstruct);
    assert.equal(saveResponse.status, 200);
    const saved = await saveResponse.json();
    assert.equal(saved.construct.subjectId, "portrait-lighting");

    const recallResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/answer`, {
      subjectId: saved.construct.subjectId,
      question: "Recall my key light for a seated interview in the small gallery."
    });
    assert.equal(recallResponse.status, 200);
    const recalled = await recallResponse.json();
    assert.equal(recalled.recall.ready, true);
    assert.equal(recalled.construct.subjectId, "portrait-lighting");
  });
});

await check("manual construct sources resolve to /docs and docs files open through the app", async () => {
  const doc = await createTempDocFixture();

  await withServer(async (address) => {
    const construct = await createSubjectConstruct(address.port, {
      subjectLabel: `Manual Source Subject ${Date.now()}`,
      constructLabel: "Bose T8S manual-backed construct",
      target: "Bose T8S ToneMatch mixer",
      objective: "reference the local Bose owner guide while building microphone settings",
      context: `manual_scope: owner guide reference\nOwner Guide PDF: sandbox:/mnt/data/${doc.fileName}\ncontrol panel reference: Figure 3, page 8`,
      notes: "Manual-backed construct for the Bose owner guide.",
      tags: "bose, t8s, manual, guide",
      provenance: {
        source: "manual",
        learnedFromQuestion: null
      }
    });

    const libraryResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=${encodeURIComponent(construct.subjectId)}`);
    assert.equal(libraryResponse.status, 200);
    const libraryPayload = await libraryResponse.json();
    const stored = libraryPayload.constructs.find((item) => item.id === construct.id);
    assert.ok(stored);
    assert.ok(Array.isArray(stored.sources));
    assert.ok(stored.sources.some((source) => source.url.endsWith(encodeURIComponent(doc.fileName))));

    const docResponse = await fetch(`http://127.0.0.1:${address.port}/docs/${encodeURIComponent(doc.fileName)}`);
    assert.equal(docResponse.status, 200);
    assert.match(String(docResponse.headers.get("content-type") ?? ""), /application\/pdf/i);
    assert.equal(await docResponse.text(), "manual fixture");
  });
});

await check("POST /api/subjectspace/learn updates an existing construct in place", async () => {
  await withServer(async (address) => {
    const construct = await createSubjectConstruct(address.port, {
      subjectLabel: `Editable Subject ${Date.now()}`
    });

    const updateResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/learn`, {
      id: construct.id,
      subjectId: construct.subjectId,
      subjectLabel: construct.subjectLabel,
      constructLabel: "Gallery interview key light recall refined",
      target: construct.target,
      objective: "soft face lighting with shoulder separation for interview framing",
      context: "room: small gallery\ncamera: medium close-up\nbackground: charcoal paper roll",
      steps: "Raise the key until the cheek has shape\nAdd negative fill only if the jaw disappears\nAdd a light shoulder edge if the background eats the jacket",
      notes: "Updated construct for cleaner separation when the jacket is dark.",
      tags: "lighting, interview, separation"
    });

    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.construct.id, construct.id);
    assert.equal(updated.construct.subjectId, construct.subjectId);
    assert.equal(updated.construct.constructLabel, "Gallery interview key light recall refined");
    assert.equal(updated.construct.context.background, "charcoal paper roll");
    assert.match(updated.construct.notes, /cleaner separation/i);
    assert.ok(Number(updated.construct.learnedCount) > Number(construct.learnedCount));

    const recallResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/answer`, {
      subjectId: construct.subjectId,
      question: "Recall my gallery interview key light refined setup with shoulder separation."
    });

    assert.equal(recallResponse.status, 200);
    const recalled = await recallResponse.json();
    assert.equal(recalled.recall.ready, true);
    assert.equal(recalled.construct.id, construct.id);
    assert.match(recalled.answer, /separation|charcoal/i);
  });
});

await check("POST /api/subjectspace/build checks manual references before drafting a Bose microphone construct", async () => {
  const doc = await createTempDocFixture(`subjectspace-bose-manual-${Date.now()}.pdf`);

  await withServer(async (address) => {
    await createSubjectConstruct(address.port, {
      subjectLabel: "Bose T8S Mixer",
      constructLabel: "Bose T8S microphone manual reference",
      target: "Bose T8S handheld vocal microphone starting point",
      objective: "manual-backed reference for microphone gain staging and scene recall limits",
      context: `Owner Guide PDF: sandbox:/mnt/data/${doc.fileName}\nscene limits: scenes do not store trim or phantom power state`,
      steps: "Choose a vocal preset first\nSet trim carefully before saving a scene\nCheck phantom power state every time",
      notes: "Manual reference for building new Bose microphone constructs from the T8S guide.",
      tags: "bose, t8s, manual, microphone, guide",
      provenance: {
        source: "manual",
        learnedFromQuestion: null
      }
    });

    const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/build`, {
      preferApi: false,
      subjectLabel: "Music Engineering",
      input: "Build a Bose T8S handheld vocal microphone starting construct with scene recall and trim checks."
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.checkedReferences));
    assert.ok(payload.checkedReferences.some((reference) => /Bose T8S microphone manual reference/i.test(reference.constructLabel)));
    assert.ok(payload.checkedReferences.some((reference) => Array.isArray(reference.sources) && reference.sources.some((source) => source.url.endsWith(encodeURIComponent(doc.fileName)))));
    assert.ok(Array.isArray(payload.buildChecks));
    assert.ok(payload.buildChecks.some((check) => /Checked .* related construct/i.test(check)));
    assert.ok(payload.buildChecks.some((check) => /Consulted manual reference/i.test(check)));
  });
});

await check("POST /api/subjectspace/build can merge new notes into an existing construct", async () => {
  await withServer(async (address) => {
    const construct = await createSubjectConstruct(address.port, {
      subjectLabel: `Builder Merge Subject ${Date.now()}`
    });

    const buildResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/build`, {
      preferApi: false,
      subjectId: construct.subjectId,
      subjectLabel: construct.subjectLabel,
      baseConstruct: construct,
      input: [
        "Context:",
        "background: charcoal paper roll",
        "Steps:",
        "- Add a flagged hair light for shoulder separation",
        "Notes: Add this when a dark jacket starts blending into the background.",
        "Tags: separation, hair light"
      ].join("\n")
    });

    assert.equal(buildResponse.status, 200);
    const merged = await buildResponse.json();
    assert.equal(merged.mergeMode, "extend");
    assert.equal(merged.source, "heuristic");
    assert.equal(merged.suggestedConstruct.id, construct.id);
    assert.equal(merged.suggestedConstruct.constructLabel, construct.constructLabel);
    assert.equal(merged.suggestedConstruct.target, construct.target);
    assert.equal(merged.suggestedConstruct.context.room, "small gallery");
    assert.equal(merged.suggestedConstruct.context.background, "charcoal paper roll");
    assert.ok(merged.suggestedConstruct.steps.includes("Add a flagged hair light for shoulder separation"));
    assert.ok(merged.suggestedConstruct.tags.includes("softbox"));
    assert.ok(merged.suggestedConstruct.tags.includes("hair light"));
    assert.match(merged.suggestedConstruct.notes, /speed matters/i);
    assert.match(merged.suggestedConstruct.notes, /dark jacket/i);

    const saveResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/learn`, merged.suggestedConstruct);
    assert.equal(saveResponse.status, 200);
    const saved = await saveResponse.json();
    assert.equal(saved.construct.id, construct.id);

    const recallResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/answer`, {
      subjectId: construct.subjectId,
      question: "Recall my gallery interview key light with shoulder separation and a dark jacket."
    });

    assert.equal(recallResponse.status, 200);
    const recalled = await recallResponse.json();
    assert.equal(recalled.recall.ready, true);
    assert.equal(recalled.construct.id, construct.id);
    assert.match(recalled.answer, /separation|dark jacket|charcoal/i);
  });
});

await check("POST /api/subjectspace/compare compacts the prompt and shows Strandbase faster than the mocked LLM round-trip", async () => {
  __setOpenAiAssistMock(async ({ question, subjectLabel }) => {
    await new Promise((resolve) => setTimeout(resolve, 35));

    return {
      responseId: "resp_mock_compare_subjectspace",
      model: "gpt-5.4-mini",
      usage: {
        input_tokens: 18,
        output_tokens: 52,
        total_tokens: 70
      },
      assist: {
        apiAction: "validate",
        constructLabel: `${subjectLabel} speed benchmark draft`,
        target: `Benchmark answer for ${question}`,
        objective: "Measure round-trip latency against local Strandbase recall",
        contextEntries: [
          { key: "mode", value: "benchmark" }
        ],
        steps: [
          "Run local recall first.",
          "Time the remote assist call.",
          "Report the speed difference."
        ],
        notes: "Synthetic delayed response for timing coverage.",
        tags: ["benchmark"],
        validationFocus: ["latency"],
        rationale: "Mocked latency keeps the benchmark deterministic in tests.",
        shouldLearn: false
      }
    };
  });

  await withServer(async (address) => {
    const construct = await createSubjectConstruct(address.port, {
      subjectLabel: `Benchmark Subject ${Date.now()}`
    });
    const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/compare`, {
      subjectId: construct.subjectId,
      question: "What is my gallery interview key light setup with the softbox at 45 degrees in the small gallery when I need soft face lighting and gentle background separation?"
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.local.label, "Strandbase recall");
    assert.ok(Number(payload.local.latencyMs) > 0);
    assert.equal(payload.prompts.original.constructId, construct.id);
    assert.equal(payload.prompts.benchmark.constructId, construct.id);
    assert.equal(payload.prompts.benchmark.equivalentRecall, true);
    assert.equal(payload.prompts.benchmark.usedForTiming, true);
    assert.ok(payload.prompts.benchmark.optimized);
    assert.ok(Number(payload.prompts.original.estimatedTokens) > Number(payload.prompts.benchmark.estimatedTokens));
    assert.ok(String(payload.prompts.benchmark.question).length < String(payload.prompts.original.question).length);
    assert.equal(payload.llm.enabled, true);
    assert.equal(payload.llm.mode, "assist_round_trip");
    assert.ok(Number(payload.llm.latencyMs) >= 30);
    assert.equal(payload.llm.promptTokens, 18);
    assert.equal(payload.llm.promptTokenSource, "usage");
    assert.equal(payload.llm.totalTokens, 70);
    assert.equal(payload.comparison.available, true);
    assert.equal(payload.comparison.faster, "strandbase");
    assert.ok(Number(payload.comparison.speedup) >= 1);
    assert.match(String(payload.comparison.summary), /Strandbase recall was/i);
    assert.match(String(payload.comparison.summary), /estimated token/i);
  });

  __setOpenAiAssistMock(null);
});

await check("POST /api/subjectspace/assist returns an OpenAI-backed draft and can be saved", async () => {
  __setOpenAiAssistMock(async ({ question, subjectId, subjectLabel }) => ({
    responseId: "resp_mock_subjectspace",
    model: "gpt-5.4-mini",
    assist: {
      apiAction: "validate",
      constructLabel: "Gallery interview tungsten recall",
      target: "Key light for a seated interview under tungsten practicals",
      objective: "keep skin natural while the warm room still feels present",
      contextEntries: [
        { key: "room", value: "small gallery" },
        { key: "key light", value: "softbox with warmer balance" },
        { key: "camera", value: "medium close-up" }
      ],
      steps: [
        "Set the key for natural skin first before matching the background warmth.",
        "Let the room stay warm, but keep the face from drifting orange.",
        "Add negative fill only if the tungsten ambience flattens the jawline."
      ],
      notes: "This validates the local interview setup for warmer practicals.",
      tags: ["lighting", "interview", "tungsten"],
      validationFocus: ["tungsten balance", "skin tone"],
      rationale: `Validated against the missing tungsten cue from: ${question} in ${subjectLabel} (${subjectId}).`,
      shouldLearn: true
    }
  }));

  await withServer(async (address) => {
    const construct = await createSubjectConstruct(address.port, {
      subjectLabel: `Assist Subject ${Date.now()}`
    });

    const assistResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/assist`, {
      subjectId: construct.subjectId,
      question: "What is my gallery interview tungsten setup?"
    });

    assert.equal(assistResponse.status, 200);
    const assisted = await assistResponse.json();
    assert.equal(assisted.source, "openai");
    assert.equal(assisted.config.enabled, true);
    assert.equal(assisted.assist.apiAction, "validate");
    assert.equal(assisted.suggestedConstruct.constructLabel, "Gallery interview tungsten recall");

    const saveResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/learn`, assisted.suggestedConstruct);
    assert.equal(saveResponse.status, 200);
    const saved = await saveResponse.json();
    assert.equal(saved.construct.subjectId, construct.subjectId);
    assert.match(saved.construct.notes, /warmer practicals/i);
  });

  __setOpenAiAssistMock(null);
});

await check("POST /api/subjectspace/assist times out instead of hanging when OpenAI stalls", async () => {
  const originalTimeout = process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
  process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = "25";
  __setOpenAiAssistMock(async () => await new Promise(() => {}));

  try {
    await withServer(async (address) => {
      const started = Date.now();
      const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/assist`, {
        subjectId: "music-engineering",
        question: "What is my gallery interview tungsten setup?"
      });

      assert.equal(response.status, 504);
      const payload = await response.json();
      assert.match(String(payload.error), /timed out/i);
      assert.ok(Date.now() - started < 1000);
    });
  } finally {
    __setOpenAiAssistMock(null);
    if (originalTimeout === undefined) {
      delete process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
    } else {
      process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = originalTimeout;
    }
  }
});

await check("GET /api/stats reports database counts, size, and new local graph tables", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/stats`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.ok(Number(payload.database?.sizeBytes ?? 0) >= 0);
    assert.ok(Number(payload.counts?.subjectCount ?? 0) >= 1);
    assert.ok(Number(payload.counts?.binderCount ?? 0) >= 0);
    assert.ok(Number(payload.counts?.subjectStrandCount ?? 0) >= 0);
    assert.ok(Number(payload.counts?.constructStrandCount ?? 0) >= 0);
    assert.ok(Array.isArray(payload.tables));
    assert.ok(payload.tables.some((table) => table.name === "strand_binders"));
    assert.ok(payload.tables.some((table) => table.name === "construct_links"));
    assert.ok(payload.tables.some((table) => table.name === "subject_strands"));
    assert.ok(payload.tables.some((table) => table.name === "construct_strands"));
  });
});

await check("GET /api/model-lab/status exposes models and benchmark timeout metadata", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/status`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.defaultProvider, "openai");
    assert.equal(typeof payload.reason, "string");
    assert.ok(Number(payload.requestTimeoutMs ?? 0) > 0);
    assert.ok(Number(payload.benchmarkTimeoutMs ?? 0) > 0);
    assert.ok(Array.isArray(payload.providers));
    assert.ok(payload.providers.some((provider) => provider.provider === "openai"));
    assert.ok((payload.providers.find((provider) => provider.provider === "openai")?.models?.length ?? 0) >= 1);
  });
});

await check("POST /api/model-lab/compare uses the dedicated benchmark timeout budget", async () => {
  const originalTimeout = process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
  const originalBenchmarkTimeout = process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS;
  process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = "25";
  process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS = "250";
  __setOpenAiAssistMock(async ({ question, subjectLabel }) => {
    await new Promise((resolve) => setTimeout(resolve, 120));

    return {
      responseId: "resp_model_lab_timeout_override",
      model: "gpt-5.4-mini",
      usage: {
        input_tokens: 18,
        output_tokens: 40,
        total_tokens: 58
      },
      assist: {
        apiAction: "validate",
        constructLabel: `${subjectLabel} timeout override draft`,
        target: `Validated benchmark answer for ${question}`,
        objective: "Use a longer model-lab timeout budget than the general assist timeout",
        contextEntries: [
          { key: "mode", value: "benchmark-timeout-override" }
        ],
        steps: [
          "Run local recall first.",
          "Allow the benchmark request enough time to complete.",
          "Store the resulting timing report."
        ],
        notes: "Synthetic delayed response that should succeed under the longer model-lab timeout.",
        tags: ["benchmark", "timeout"],
        validationFocus: ["latency"],
        rationale: "Mocked delayed response verifies the benchmark-specific timeout budget.",
        shouldLearn: false
      }
    };
  });

  try {
    await withServer(async (address) => {
      const construct = await createSubjectConstruct(address.port, {
        subjectLabel: `Model Timeout Budget Subject ${Date.now()}`
      });

      const response = await postJson(`http://127.0.0.1:${address.port}/api/model-lab/compare`, {
        provider: "openai",
        model: "gpt-5.4-mini",
        subjectId: construct.subjectId,
        question: "What is my gallery interview key light setup with the softbox at 45 degrees?"
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.provider, "openai");
      assert.equal(payload.llm.model, "gpt-5.4-mini");
      assert.ok(Number(payload.llm.latencyMs ?? 0) >= 100);
      assert.match(String(payload.comparison?.summary ?? ""), /faster|prompt/i);
    });
  } finally {
    __setOpenAiAssistMock(null);
    if (originalTimeout === undefined) {
      delete process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
    } else {
      process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = originalTimeout;
    }
    if (originalBenchmarkTimeout === undefined) {
      delete process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS;
    } else {
      process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS = originalBenchmarkTimeout;
    }
  }
});

await check("GET /api/model-lab/reports returns stored benchmark history after a successful compare", async () => {
  __setOpenAiAssistMock(async ({ question, subjectLabel }) => {
    await new Promise((resolve) => setTimeout(resolve, 20));

    return {
      responseId: "resp_mock_model_lab_reports",
      model: "gpt-5.4-mini",
      usage: {
        input_tokens: 16,
        output_tokens: 48,
        total_tokens: 64
      },
      assist: {
        apiAction: "validate",
        constructLabel: `${subjectLabel} model lab report draft`,
        target: `Model lab report answer for ${question}`,
        objective: "Verify stored benchmark history through the model lab reports API",
        contextEntries: [
          { key: "mode", value: "model-lab-report" }
        ],
        steps: [
          "Run local recall first.",
          "Run the selected benchmark model.",
          "Persist the timing report for later inspection."
        ],
        notes: "Synthetic report response for API coverage.",
        tags: ["benchmark", "report"],
        validationFocus: ["history"],
        rationale: "Mocked report response keeps model-lab persistence deterministic in tests.",
        shouldLearn: false
      }
    };
  });

  try {
    await withServer(async (address) => {
      const initialReportsResponse = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/reports`);
      assert.equal(initialReportsResponse.status, 200);
      const initialReportsPayload = await initialReportsResponse.json();
      const initialTotalRuns = Number(initialReportsPayload.reports?.totalRuns ?? 0);

      const construct = await createSubjectConstruct(address.port, {
        subjectLabel: `Model Lab Reports Subject ${Date.now()}`
      });
      const testLabel = `Reports API coverage ${Date.now()}`;

      const compareResponse = await postJson(`http://127.0.0.1:${address.port}/api/model-lab/compare`, {
        provider: "openai",
        model: "gpt-5.4-mini",
        subjectId: construct.subjectId,
        question: "What is my gallery interview key light setup with the softbox at 45 degrees?",
        testLabel
      });

      assert.equal(compareResponse.status, 200);
      const comparePayload = await compareResponse.json();
      assert.equal(comparePayload.ok, true);
      assert.equal(comparePayload.provider, "openai");
      assert.equal(comparePayload.llm.model, "gpt-5.4-mini");

      const reportsResponse = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/reports?recent=5&summary=5`);
      assert.equal(reportsResponse.status, 200);
      const reportsPayload = await reportsResponse.json();
      assert.equal(reportsPayload.ok, true);
      assert.equal(Number(reportsPayload.reports?.totalRuns ?? 0), initialTotalRuns + 1);

      const matchingReport = reportsPayload.reports?.recent?.find((item) => item.testLabel === testLabel);
      assert.ok(matchingReport);
      assert.equal(matchingReport.provider, "openai");
      assert.equal(matchingReport.model, "gpt-5.4-mini");
      assert.equal(matchingReport.mode, "compare");
      assert.equal(matchingReport.question, "What is my gallery interview key light setup with the softbox at 45 degrees?");
      assert.equal(matchingReport.localConstructLabel, construct.constructLabel);
      assert.equal(typeof matchingReport.summary, "string");
      assert.ok(matchingReport.summary.length > 0);
      assert.ok(matchingReport.debug);

      assert.ok(Array.isArray(reportsPayload.reports?.summaryByModel));
      assert.ok(reportsPayload.reports.summaryByModel.some((entry) => entry.provider === "openai" && entry.model === "gpt-5.4-mini"));

      const statsResponse = await fetch(`http://127.0.0.1:${address.port}/api/stats`);
      assert.equal(statsResponse.status, 200);
      const statsPayload = await statsResponse.json();
      assert.equal(Number(statsPayload.counts?.benchmarkReportCount ?? 0), Number(reportsPayload.reports?.totalRuns ?? 0));
    });
  } finally {
    __setOpenAiAssistMock(null);
  }
});

await check("POST /api/model-lab/compare returns model testing unavailable on timeout and does not persist a report entry", async () => {
  const originalTimeout = process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
  const originalModelLabTimeout = process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS;
  const originalModelList = process.env.SUBJECTSPACE_OPENAI_MODELS;
  process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = "25";
  process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS = "25";
  process.env.SUBJECTSPACE_OPENAI_MODELS = "gpt-5.4-mini,gpt-5.4,gpt-5.2";
  __setOpenAiAssistMock(async () => await new Promise(() => {}));

  try {
    await withServer(async (address) => {
      const initialReportsResponse = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/reports`);
      assert.equal(initialReportsResponse.status, 200);
      const initialReportsPayload = await initialReportsResponse.json();
      const initialTotalRuns = Number(initialReportsPayload.reports?.totalRuns ?? 0);
      const testLabel = `Timeout should not persist ${Date.now()}`;

      const construct = await createSubjectConstruct(address.port, {
        subjectLabel: `Model Timeout Subject ${Date.now()}`
      });

      const started = Date.now();
      const response = await postJson(`http://127.0.0.1:${address.port}/api/model-lab/compare`, {
        provider: "openai",
        model: "gpt-5.4-mini",
        subjectId: construct.subjectId,
        question: "What is my gallery interview tungsten setup?",
        testLabel
      });

      assert.equal(response.status, 503);
      const payload = await response.json();
      assert.equal(payload.ok, false);
      assert.equal(payload.code, "MODEL_TESTING_UNAVAILABLE");
      assert.match(String(payload.error), /model testing unavailable/i);
      assert.match(String(payload.detail), /try/i);
      assert.ok(Array.isArray(payload.suggestedModels));
      assert.ok(payload.suggestedModels.some((entry) => entry.provider === "openai" && entry.model === "gpt-5.4"));
      assert.ok(Date.now() - started < 1000);

      const reportsResponse = await fetch(`http://127.0.0.1:${address.port}/api/model-lab/reports?recent=10&summary=5`);
      assert.equal(reportsResponse.status, 200);
      const reportsPayload = await reportsResponse.json();
      assert.equal(Number(reportsPayload.reports?.totalRuns ?? 0), initialTotalRuns);
      assert.ok(!reportsPayload.reports?.recent?.some((item) => item.testLabel === testLabel));
    });
  } finally {
    __setOpenAiAssistMock(null);
    if (originalTimeout === undefined) {
      delete process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
    } else {
      process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = originalTimeout;
    }
    if (originalModelLabTimeout === undefined) {
      delete process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS;
    } else {
      process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS = originalModelLabTimeout;
    }
    if (originalModelList === undefined) {
      delete process.env.SUBJECTSPACE_OPENAI_MODELS;
    } else {
      process.env.SUBJECTSPACE_OPENAI_MODELS = originalModelList;
    }
  }
});

await check("POST /api/subjectspace/learn, /library, and /answer expose related construct ids and hydrated related constructs", async () => {
  await withServer(async (address) => {
    const almondFlour = await createSubjectConstruct(address.port, {
      subjectLabel: "Diabetic Baking",
      constructLabel: "Diabetic bread: almond flour",
      target: "Almond flour ingredient note",
      objective: "use almond flour as the main low-carb base",
      context: "ingredient: almond flour\namount: 2 cups",
      steps: "Sift the almond flour before mixing\nKeep it dry until the wet ingredients are ready",
      notes: "Ingredient construct for the bread recipe.",
      tags: "ingredient, almond flour, bread"
    });

    const xanthanGum = await createSubjectConstruct(address.port, {
      subjectLabel: "Diabetic Baking",
      constructLabel: "Diabetic bread: xanthan gum",
      target: "Xanthan gum ingredient note",
      objective: "use xanthan gum for structure and lift",
      context: "ingredient: xanthan gum\namount: 1 teaspoon",
      steps: "Whisk it into the dry ingredients first",
      notes: "Ingredient construct for the bread recipe.",
      tags: "ingredient, xanthan gum, bread"
    });

    const recipeResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/learn`, {
      subjectId: almondFlour.subjectId,
      subjectLabel: "Diabetic Baking",
      constructLabel: "Diabetic bread recipe",
      target: "Low-carb sandwich bread",
      objective: "build a diabetic-friendly bread loaf with structure and a usable crumb",
      context: "loaf: 8 inch pan",
      steps: "Mix the dry ingredients first\nFold the wet ingredients in gently\nBake until the center sets",
      notes: "Use the linked ingredient constructs as the ingredient memory for this recipe.",
      tags: "recipe, bread, diabetic",
      relatedConstructIds: [almondFlour.id, ` ${xanthanGum.id} `, almondFlour.id]
    });

    assert.equal(recipeResponse.status, 200);
    const savedRecipe = await recipeResponse.json();
    assert.deepEqual(savedRecipe.construct.relatedConstructIds, [almondFlour.id, xanthanGum.id]);
    assert.equal(savedRecipe.construct.relatedConstructs.length, 2);

    const libraryResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=${encodeURIComponent(almondFlour.subjectId)}`);
    assert.equal(libraryResponse.status, 200);
    const libraryPayload = await libraryResponse.json();
    const libraryRecipe = libraryPayload.constructs.find((construct) => construct.id === savedRecipe.construct.id);
    assert.deepEqual(libraryRecipe?.relatedConstructIds, [almondFlour.id, xanthanGum.id]);

    const answerResponse = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/answer`, {
      subjectId: almondFlour.subjectId,
      question: "What is my diabetic bread recipe?"
    });

    assert.equal(answerResponse.status, 200);
    const answerPayload = await answerResponse.json();
    assert.equal(answerPayload.source, "strandspace");
    assert.deepEqual(answerPayload.construct.relatedConstructIds, [almondFlour.id, xanthanGum.id]);
    assert.equal(answerPayload.recall.relatedConstructs.length, 2);
    assert.deepEqual(
      answerPayload.recall.relatedConstructs.map((construct) => construct.constructLabel),
      ["Diabetic bread: almond flour", "Diabetic bread: xanthan gum"]
    );
  });
});

await check("POST /api/subjectspace/ingest-conversation stores distilled constructs instead of raw transcript blobs", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/ingest-conversation`, {
      subjectLabel: "Music Engineering",
      messages: [
        {
          role: "user",
          content: "Build me a karaoke reset."
        },
        {
          role: "assistant",
          content: [
            "Subject: Music Engineering",
            "Construct Label: Karaoke reset recall",
            "Target: Bose T8S karaoke reset",
            "Objective: clean gain before feedback",
            "Context:",
            "mixer: Bose T8S",
            "venue: karaoke bar",
            "Steps:",
            "- Set receiver output before mixer trim",
            "- Ring out the monitors first",
            "Notes: Reusable reset for karaoke.",
            "Tags: karaoke, gain staging"
          ].join("\n")
        }
      ]
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "conversation-ingest");
    assert.equal(payload.count, 1);
    assert.equal(payload.constructs[0].constructLabel, "Karaoke reset recall");

    const libraryResponse = await fetch(`http://127.0.0.1:${address.port}/api/backend/db/table?table=chat_messages&limit=5`);
    assert.equal(libraryResponse.status, 200);
    const libraryPayload = await libraryResponse.json();
    assert.equal(libraryPayload.table.name, "chat_messages");
    assert.equal(Array.isArray(libraryPayload.rows), true);
    assert.equal(libraryPayload.rows.length, 0);
  });
});

await check("POST /api/chat returns a local-first answer and persists the conversation when recall is sufficient", async () => {
  await withServer(async (address) => {
    const construct = await createSubjectConstruct(address.port, {
      subjectLabel: `Chat Local Subject ${Date.now()}`
    });

    const response = await postJson(`http://127.0.0.1:${address.port}/api/chat`, {
      subjectId: construct.subjectId,
      message: "What is my gallery interview key light setup with the softbox at 45 degrees?"
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "local");
    assert.ok(payload.conversationId);
    assert.equal(payload.construct.id, construct.id);

    const messagesResponse = await fetch(`http://127.0.0.1:${address.port}/api/backend/db/table?table=chat_messages&limit=10`);
    assert.equal(messagesResponse.status, 200);
    const messagesPayload = await messagesResponse.json();
    assert.ok(messagesPayload.rows.some((row) => row.conversationId === payload.conversationId && row.role === "user"));
    assert.ok(messagesPayload.rows.some((row) => row.conversationId === payload.conversationId && row.role === "assistant"));

    const historyResponse = await fetch(`http://127.0.0.1:${address.port}/api/chat/history/${payload.conversationId}`);
    assert.equal(historyResponse.status, 200);
    const historyPayload = await historyResponse.json();
    assert.equal(historyPayload.conversation.id, payload.conversationId);
    assert.equal(typeof historyPayload.conversation.title, "string");
  });
});

await check("POST /api/chat falls back to AI, saves a chatbot-derived construct, and returns the saved memory", async () => {
  __setOpenAiAssistMock(async ({ question, subjectLabel }) => ({
    responseId: "resp_mock_chat_subjectspace",
    model: "gpt-5.4-mini",
    assist: {
      apiAction: "expand",
      constructLabel: "Gallery interview tungsten recall",
      target: "Key light for a seated interview under tungsten practicals",
      objective: "keep skin natural while the room stays warm",
      contextEntries: [
        { key: "room", value: "small gallery" },
        { key: "key light", value: "softbox with warmer balance" }
      ],
      steps: [
        "Set the key for natural skin first.",
        "Let the room stay warm without drifting orange.",
        "Add negative fill only if the jawline flattens."
      ],
      notes: `AI expanded ${subjectLabel} for: ${question}`,
      tags: ["lighting", "interview", "tungsten"],
      validationFocus: ["skin tone"],
      rationale: "Mocked chat fallback.",
      shouldLearn: true
    }
  }));

  try {
    await withServer(async (address) => {
      const construct = await createSubjectConstruct(address.port, {
        subjectLabel: `Chat Assist Subject ${Date.now()}`
      });

      const response = await postJson(`http://127.0.0.1:${address.port}/api/chat`, {
        subjectId: construct.subjectId,
        message: "What is my gallery interview tungsten setup?"
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.source, "chatbot-derived");
      assert.equal(payload.savedConstruct.provenance.source, "chatbot-derived");
      assert.ok(payload.savedConstruct.relatedConstructs.length >= 0);

      const libraryResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=${encodeURIComponent(construct.subjectId)}`);
      assert.equal(libraryResponse.status, 200);
      const libraryPayload = await libraryResponse.json();
      assert.ok(libraryPayload.constructs.some((entry) => entry.provenance?.source === "chatbot-derived"));
    });
  } finally {
    __setOpenAiAssistMock(null);
  }
});

await check("POST /api/chat enriches the nearest local construct instead of creating a duplicate when AI stays on the same strand cluster", async () => {
  __setOpenAiAssistMock(async ({ question, subjectLabel }) => ({
    responseId: "resp_mock_chat_subjectspace_merge",
    model: "gpt-5.4-mini",
    assist: {
      apiAction: "expand",
      constructLabel: "Gallery interview warmed practical recall",
      target: "Key light for a seated interview with warmer practicals in the room",
      objective: "keep skin natural while the room stays warm",
      contextEntries: [
        { key: "room", value: "small gallery" },
        { key: "key light", value: "softbox with mild warmth" }
      ],
      steps: [
        "Set the face first.",
        "Warm the key slightly before trimming fill.",
        "Keep the practicals warm without clipping."
      ],
      notes: `AI enriched ${subjectLabel} for: ${question}`,
      tags: ["lighting", "interview", "warm practicals"],
      validationFocus: ["skin tone"],
      rationale: "Mocked chat enrichment.",
      shouldLearn: true
    }
  }));

  try {
    await withServer(async (address) => {
      const construct = await createSubjectConstruct(address.port, {
        subjectLabel: "Chat Merge Subject"
      });

      const beforeLibraryResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=${encodeURIComponent(construct.subjectId)}`);
      const beforeLibraryPayload = await beforeLibraryResponse.json();
      const beforeCount = beforeLibraryPayload.constructs.length;

      const response = await postJson(`http://127.0.0.1:${address.port}/api/chat`, {
        subjectId: construct.subjectId,
        message: "What is my gallery interview setup when the room practicals need to stay warm?"
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.source, "chatbot-derived");
      assert.equal(payload.savedConstruct.id, construct.id);
      assert.equal(payload.savedConstruct.provenance.enrichedBaseConstructId, construct.id);
      assert.equal(payload.savedConstruct.provenance.enrichedFromChat, true);

      const afterLibraryResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=${encodeURIComponent(construct.subjectId)}`);
      const afterLibraryPayload = await afterLibraryResponse.json();
      assert.equal(afterLibraryPayload.constructs.length, beforeCount);
    });
  } finally {
    __setOpenAiAssistMock(null);
  }
});

await check("GET /api/soundspace recalls a seeded mixer setup", async () => {
  await withServer(async (address) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=What%20is%20a%20good%20setup%20for%20a%20microphone%20on%20a%20Yamaha%20MG10XU%20mixer%20for%20a%20small%20band%20room%3F`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ready, true);
    assert.equal(payload.matched?.deviceModel, "MG10XU");
    assert.equal(payload.recommendation, "use_strandspace");
    assert.match(payload.answer, /Gain:/);
  });
});

await check("POST /api/soundspace/learn stores a new construct for later recall", async () => {
  await withServer(async (address) => {
    const learnResponse = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/learn`, {
      id: `yamaha-mg10xu-music-bingo-host-${Date.now()}`,
      name: "Yamaha MG10XU music bingo host setup",
      deviceBrand: "Yamaha",
      deviceModel: "MG10XU",
      deviceType: "mixer",
      sourceType: "microphone",
      goal: "clear host mic",
      venueSize: "medium",
      eventType: "music bingo",
      speakerConfig: "two powered speakers plus host monitor",
      setup: {
        gain: "Set speech gain for strong announcements with clean peaks.",
        eq: "Cut mud and leave enough presence so clue calls stay intelligible.",
        fx: "Keep effects nearly dry for intelligibility.",
        monitor: "Aim mains ahead of the host mic and keep monitor level conservative."
      },
      tags: ["music bingo", "host mic", "speech"],
      strands: [
        "device:yamaha_mg10xu",
        "source:microphone",
        "event:music_bingo",
        "goal:clear_host_mic"
      ],
      llmSummary: "Use this setup for a host-driven music bingo night."
    });

    assert.equal(learnResponse.status, 200);
    const learned = await learnResponse.json();
    assert.equal(learned.construct.eventType, "music bingo");

    const recallResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=What%20is%20a%20good%20music%20bingo%20mic%20setup%20for%20a%20Yamaha%20MG10XU%20in%20a%20medium%20venue%3F`
    );

    assert.equal(recallResponse.status, 200);
    const recalled = await recallResponse.json();
    assert.equal(recalled.ready, true);
    assert.equal(recalled.matched?.eventType, "music bingo");
    assert.match(recalled.answer, /intelligibility|Gain:/i);
  });
});

await check("POST /api/soundspace/answer generates and stores a missing construct", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "What is a good karaoke mic setup for a Yamaha MG10XU in a large venue?",
      forceGenerate: true
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(String(payload.source), /generated-and-stored$/);
    assert.equal(payload.construct.deviceModel, "MG10XU");
    assert.equal(payload.construct.eventType, "karaoke");
    assert.equal(payload.construct.venueSize, "large");
    assert.equal(payload.recall.ready, true);
    assert.match(payload.answer, /Gain:/);
  });
});

await check("soundspace seeds are mirrored into the Music Engineering construct field", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=music-engineering`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.constructs.some((construct) => construct.id === "sound-bose-t8s-solo-vocal-karaoke"));
    assert.ok(payload.constructs.some((construct) => construct.id === "sound-bose-l1-pro8-front-of-house-small-room"));
  });
});

await check("POST /api/soundspace/answer can stop at review before storing a new construct", async () => {
  await withServer(async (address) => {
    const beforeLibrary = await fetch(`http://127.0.0.1:${address.port}/api/soundspace/library`);
    assert.equal(beforeLibrary.status, 200);
    const beforePayload = await beforeLibrary.json();

    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "What is a good t8s beta 58a mic setting for karaoke?",
      reviewBeforeStore: true,
      preferApi: false
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.needsReview, true);
    assert.equal(payload.source, "generated-proposal");
    assert.equal(payload.construct?.deviceModel, "T8S");
    assert.equal(payload.construct?.sourceModel, "Beta 58A");
    assert.equal(payload.review?.canLearn, true);
    assert.ok(Array.isArray(payload.review?.assumptions));
    assert.ok(payload.review.assumptions.some((item) => /small-room starting point|Show type was not specified|Coverage size was not specified/i.test(item)));
    assert.equal(payload.review?.baseConstruct?.deviceModel, "T8S");
    assert.equal(payload.review?.diff?.hasBase, true);
    assert.ok(Array.isArray(payload.review?.diff?.entries));
    assert.ok(payload.review.diff.entries.some((item) => /Source|Setup/i.test(String(item.label ?? ""))));
    assert.ok(Array.isArray(payload.recall?.focusKeys));
    assert.ok(payload.recall.focusKeys.length >= 1);

    const afterLibrary = await fetch(`http://127.0.0.1:${address.port}/api/soundspace/library`);
    assert.equal(afterLibrary.status, 200);
    const afterPayload = await afterLibrary.json();
    assert.equal(afterPayload.count, beforePayload.count);
  });
});

await check("GET /api/soundspace can list stored Bose ToneMatch presets", async () => {
  await withServer(async (address) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=what%20tonematch%20presets%20does%20the%20t8s%20have`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ready, true);
    assert.equal(payload.parsed.intent, "list_presets");
    assert.match(String(payload.answer), /Vocal Mics > Handheld Mics/i);
    assert.match(String(payload.answer), /Acoustic Guitars > Steel String w\/ piezo/i);
    assert.match(String(payload.answer), /DJ\/Playback > Flat, zEQ Controls/i);
  });
});

await check("soundspace can strand together Bose T8S mixer recall with Bose L1 Pro8 speaker recall", async () => {
  await withServer(async (address) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=what%20is%20a%20good%20bose%20t8s%20setup%20into%20two%20bose%20l1%20pro8%20front%20of%20house%20speakers`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ready, true);
    assert.equal(payload.recommendation, "use_strandspace_combined");
    assert.ok(payload.combined);
    assert.equal(payload.combined.matches.length, 2);
    assert.ok(payload.combined.matches.some((match) => match.deviceModel === "T8S"));
    assert.ok(payload.combined.matches.some((match) => match.deviceModel === "L1 Pro8"));
    assert.ok(Array.isArray(payload.linkedSubjectConstructs));
    assert.ok(payload.linkedSubjectConstructs.some((construct) => /Bose T8S/i.test(String(construct.constructLabel))));
    assert.ok(payload.linkedSubjectConstructs.some((construct) => /Bose L1 Pro8/i.test(String(construct.constructLabel))));
    assert.match(String(payload.answer), /For Bose T8S and Bose L1 Pro8/i);
  });
});

await check("soundspace recalls built-in acoustic guitar ToneMatch settings", async () => {
  await withServer(async (address) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=t8s%20acoustic%20guitar%20tonematch%20preset`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ready, true);
    assert.equal(payload.matched?.presetCategory, "Acoustic Guitars");
    assert.equal(payload.matched?.presetName, "Steel String w/ piezo");
    assert.ok(payload.focusKeys.includes("toneMatch"));
    assert.match(String(payload.answer), /Acoustic Guitars > Steel String w\/ piezo/i);
  });
});

await check("soundspace asks for Shure mic model and returns focused mic settings", async () => {
  await withServer(async (address) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=t8s%20shure%20mic%20setting`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ready, true);
    assert.equal(payload.matched?.deviceModel, "T8S");
    assert.equal(payload.parsed.sourceBrand, "Shure");
    assert.equal(payload.parsed.sourceModel, null);
    assert.deepEqual(payload.focusKeys, ["notes"]);
    assert.deepEqual(Object.keys(payload.focusedSetup ?? {}), ["notes"]);
    assert.match(String(payload.answer), /What Shure mic model are you using/i);
    assert.doesNotMatch(String(payload.answer), /Monitor:/i);
  });
});

await check("soundspace returns search guidance for a vague generic venue preset microphone query", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "What is the setup for Generic Venue Preset microphone?",
      reviewBeforeStore: true
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "search-guidance");
    assert.equal(payload.recall.ready, false);
    assert.equal(payload.recall.recommendation, "clarify_search");
    assert.ok(payload.recall.searchGuidance);
    assert.match(String(payload.answer), /venue memory|generic venue preset|stored venue presets/i);
    assert.ok(Array.isArray(payload.recall.searchGuidance.followUpQuestions));
    assert.ok(payload.recall.searchGuidance.followUpQuestions.length >= 1);
    assert.ok(Array.isArray(payload.recall.searchGuidance.suggestionQueries));
    assert.ok(payload.recall.searchGuidance.suggestionQueries.some((item) => /venue preset/i.test(String(item))));
  });
});

await check("soundspace recognizes Bose L1 Pro16 as a specific speaker-system query", async () => {
  const parsed = parseSoundQuestion("what are the settings for two bose l1 pro16 front of house speakers");

  assert.equal(parsed.deviceBrand, "Bose");
  assert.equal(parsed.deviceModel, "L1 Pro16");
  assert.equal(parsed.deviceType, "speaker_system");
  assert.equal(parsed.sourceType, "speaker system");
});

await check("soundspace recognizes Electro-Voice ZLX-12P-G2 as a specific speaker-system query", async () => {
  const parsed = parseSoundQuestion("what are the settings for two Electro Voice ZLX-12p G2 front of house speakers");

  assert.equal(parsed.deviceBrand, "EV");
  assert.equal(parsed.deviceModel, "ZLX-12P-G2");
  assert.equal(parsed.deviceType, "speaker_system");
  assert.equal(parsed.sourceType, "speaker system");
});

await check("soundspace recognizes Yamaha MG12XU and WM333 as a local strandable rig query", async () => {
  const parsed = parseSoundQuestion("what is a good Yamaha MG12XU and WM333 wireless mic setup for karaoke");

  assert.equal(parsed.deviceBrand, "Yamaha");
  assert.equal(parsed.deviceModel, "MG12XU");
  assert.equal(parsed.deviceType, "mixer");
  assert.equal(parsed.sourceType, "microphone");
  assert.ok(Array.isArray(parsed.deviceMatches));
  assert.ok(parsed.deviceMatches.some((item) => item.model === "MG12XU"));
  assert.ok(parsed.deviceMatches.some((item) => item.model === "WM333"));
});

await check("soundspace answers Bose Pro 8 spacing questions locally and returns placement only", async () => {
  await withServer(async (address) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=${encodeURIComponent("how far apart should bose Pro 8's be set for a small event?")}`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ready, true);
    assert.equal(payload.matched?.deviceModel, "L1 Pro8");
    assert.deepEqual(payload.focusKeys, ["placement"]);
    assert.deepEqual(Object.keys(payload.focusedSetup ?? {}), ["placement"]);
    assert.match(String(payload.answer), /12 to 18 feet apart/i);
    assert.doesNotMatch(String(payload.answer), /needs one more detail|which mixer or speaker system is this for/i);
  });
});

await check("soundspace does not suggest rerunning the exact same new-device search", async () => {
  await withServer(async (address) => {
    const question = "what are the settings for two bose l1 pro16 front of house speakers";
    const response = await fetch(`http://127.0.0.1:${address.port}/api/soundspace/recall?q=${encodeURIComponent(question)}`);
    assert.equal(response.status, 200);
    const recall = await response.json();

    assert.equal(recall.ready, false);
    assert.ok(Array.isArray(recall.searchGuidance?.suggestionQueries));
    assert.ok(recall.searchGuidance.suggestionQueries.length >= 1);
  assert.ok(!recall.searchGuidance.suggestionQueries.some((item) => String(item).trim().toLowerCase() === question));
  });
});

await check("soundspace recognizes Bose L1 Pro32 and Sub2 as a new speaker-system rig", async () => {
  const parsed = parseSoundQuestion("what are the settings for one bose l1 pro 32 and a sub 2 front of house speakers");

  assert.equal(parsed.deviceBrand, "Bose");
  assert.equal(parsed.deviceModel, "L1 Pro32");
  assert.equal(parsed.deviceType, "speaker_system");
  assert.equal(parsed.sourceType, "speaker system");
  assert.ok(Array.isArray(parsed.deviceMatches));
  assert.ok(parsed.deviceMatches.some((item) => item.model === "L1 Pro32"));
  assert.ok(parsed.deviceMatches.some((item) => item.model === "Sub2"));
});

await check("soundspace proposes a reviewable Bose L1 Pro32 and Sub2 construct when local memory lacks it", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "what are the settings for one bose l1 pro 32 and a sub 2 front of house speakers",
      reviewBeforeStore: true,
      preferApi: false
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.needsReview, true);
    assert.equal(payload.source, "generated-proposal");
    assert.equal(payload.construct?.deviceBrand, "Bose");
    assert.equal(payload.construct?.deviceModel, "L1 Pro32");
    assert.equal(payload.construct?.deviceType, "speaker_system");
    assert.equal(payload.construct?.speakerConfig, "single Bose L1 Pro32 main with one Bose Sub2");
    assert.equal(payload.review?.canLearn, true);
    assert.match(String(payload.review?.title), /add this to strandspace|commit to construct/i);
    assert.ok(Array.isArray(payload.review?.changeSummary));
    assert.ok(payload.review.changeSummary.some((item) => /L1 Pro32 is not stored in Soundspace yet|new construct/i.test(String(item))));
    assert.equal(payload.recall?.readiness?.requiresReview, true);
  });
});

await check("soundspace proposes a reviewable new construct for Bose L1 Pro16 instead of venue guidance", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "what are the settings for two bose l1 pro16 front of house speakers",
      reviewBeforeStore: true,
      preferApi: false
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.needsReview, true);
    assert.equal(payload.source, "generated-proposal");
    assert.equal(payload.construct?.deviceBrand, "Bose");
    assert.equal(payload.construct?.deviceModel, "L1 Pro16");
    assert.equal(payload.construct?.deviceType, "speaker_system");
    assert.equal(payload.construct?.speakerConfig, "two Bose L1 Pro16 mains");
    assert.equal(payload.review?.canLearn, true);
    assert.match(String(payload.review?.title), /add this to strandspace|commit to construct/i);
    assert.ok(Array.isArray(payload.review?.changeSummary));
    assert.ok(payload.review.changeSummary.some((item) => /L1 Pro16 is not stored in Soundspace yet|new construct/i.test(String(item))));
    assert.equal(payload.recall?.readiness?.requiresReview, true);
  });
});

await check("soundspace proposes a reviewable EV ZLX-12P-G2 construct for an unstored FOH query", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "what are the settings for two Electro Voice ZLX-12p G2 front of house speakers",
      reviewBeforeStore: true,
      preferApi: false
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.needsReview, true);
    assert.equal(payload.source, "generated-proposal");
    assert.equal(payload.construct?.deviceBrand, "EV");
    assert.equal(payload.construct?.deviceModel, "ZLX-12P-G2");
    assert.equal(payload.construct?.sourceType, "speaker system");
    assert.equal(payload.review?.canLearn, true);
    assert.match(String(payload.review?.summary), /not stored yet|ready for review/i);
  });
});

await check("soundspace proposes a local reviewable construct for Yamaha MG12XU and WM333", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "what is a good Yamaha MG12XU and WM333 wireless mic setup for karaoke",
      reviewBeforeStore: true,
      preferApi: false
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.needsReview, true);
    assert.equal(payload.source, "generated-proposal");
    assert.equal(payload.construct?.deviceBrand, "Yamaha");
    assert.equal(payload.construct?.deviceModel, "MG12XU");
    assert.equal(payload.construct?.sourceType, "microphone");
    assert.match(String(payload.construct?.setup?.notes), /WM333|Recognized gear chain/i);
    assert.equal(payload.review?.canLearn, true);
  });
});

await check("soundspace parses a full karaoke reset query as a multi-device assist-worthy request", async () => {
  const parsed = parseSoundQuestion(
    "I want to do a complete karaoke gain-staging reset from the mic capsules to the speakers. My gear includes 2 Innopaw WM333 receivers, 2 Behringer Composer Pro-XL MDX-2600's, Bose T8S mixer, 2 Bose L1 Pro 8's, and 2 EV ZLX-8P-G2's monitors."
  );

  assert.equal(parsed.deviceModel, "T8S");
  assert.equal(parsed.deviceType, "mixer");
  assert.equal(parsed.eventType, "karaoke");
  assert.equal(parsed.prefersAssist, true);
  assert.ok(Array.isArray(parsed.deviceMatches));
  assert.ok(parsed.deviceMatches.some((item) => item.model === "WM333"));
  assert.ok(parsed.deviceMatches.some((item) => item.model === "Composer Pro-XL MDX-2600"));
  assert.ok(parsed.deviceMatches.some((item) => item.model === "L1 Pro8"));
  assert.ok(parsed.deviceMatches.some((item) => item.model === "ZLX-8P-G2"));
});

await check("soundspace uses OpenAI assist for a whole-rig karaoke reset query instead of short-circuiting to local recall", async () => {
  __setOpenAiAssistMock(async ({ mode, question, seedConstruct }) => {
    if (mode !== "sound-builder") {
      throw new Error(`Unexpected mode: ${mode}`);
    }

    assert.match(String(question), /karaoke gain-staging reset/i);
    assert.equal(seedConstruct.deviceModel, "T8S");

    return {
      responseId: "resp_mock_karaoke_reset",
      model: "gpt-5.4-mini",
      usage: {
        input_tokens: 40,
        output_tokens: 120,
        total_tokens: 160
      },
      construct: {
        ...seedConstruct,
        setup: {
          ...seedConstruct.setup,
          gain: "Set each wireless receiver output at noon, start the T8S trim at 10 o'clock, and raise until loud karaoke peaks land cleanly with headroom.",
          monitor: "Start the EV ZLX-8P-G2 monitor send low, then bring it up only until singers hear themselves without edge-of-feedback tension.",
          notes: "Full karaoke reset proposal covering receivers, compressors, mixer, mains, and monitors with explicit starting positions."
        },
        tags: [...(seedConstruct.tags ?? []), "karaoke-reset"],
        shouldLearn: true
      }
    };
  });

  try {
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
        question: "I want to do a complete karaoke gain-staging reset from the mic capsules to the speakers. I want every setting covered step-by-step with exact clock positions or values. My gear includes 2 Innopaw WM333 receivers and 4 wireless mics, 2 Behringer Composer Pro-XL MDX-2600's, Bose T8S mixer, 2 Bose L1 Pro 8's, and 2 EV ZLX-8P-G2's monitors. Goal: maximum gain before feedback with clean vocals, no edge-of-feedback feeling.",
        reviewBeforeStore: true
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.needsReview, true);
      assert.equal(payload.source, "openai-proposal");
      assert.equal(payload.construct?.deviceModel, "T8S");
      assert.match(String(payload.construct?.setup?.gain), /noon|10 o'clock/i);
      assert.match(String(payload.construct?.setup?.notes), /receivers|compressors|monitors/i);
      assert.equal(payload.review?.baseConstruct?.deviceModel, "T8S");
      assert.equal(payload.review?.diff?.hasBase, true);
      assert.ok(Array.isArray(payload.review?.diff?.entries));
      assert.ok(payload.review.diff.entries.some((item) => /Setup - Gain|Setup - Notes|Speaker config/i.test(String(item.label ?? ""))));
      assert.equal(payload.recall?.readiness?.requiresReview, true);
    });
  } finally {
    __setOpenAiAssistMock(null);
  }
});

await check("POST /api/soundspace/answer can refine a construct through the mocked OpenAI builder", async () => {
  __setOpenAiAssistMock(async ({ mode, seedConstruct }) => {
    if (mode !== "sound-builder") {
      throw new Error(`Unexpected mode: ${mode}`);
    }

    return {
      responseId: "resp_mock_soundspace",
      model: "gpt-5.4-mini",
      usage: {
        input_tokens: 24,
        output_tokens: 66,
        total_tokens: 90
      },
      construct: {
        ...seedConstruct,
        setup: {
          ...(seedConstruct.setup ?? {}),
          notes: "OpenAI refinement: add a narrow presence lift only if the singer sounds buried."
        },
        tags: [...(seedConstruct.tags ?? []), "openai-refined"],
        llmSummary: "Mocked OpenAI refinement for soundspace learning.",
        shouldLearn: true
      }
    };
  });

  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "What is a good t8s beta 58a mic setting for karaoke?"
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "openai-generated-and-stored");
    assert.match(String(payload.construct?.setup?.notes), /OpenAI refinement/i);
    assert.ok(payload.construct?.tags?.includes("openai-refined"));
  });

  __setOpenAiAssistMock(null);
});

await check("POST /api/soundspace/answer can force AI assist even when local recall is already ready", async () => {
  __setOpenAiAssistMock(async ({ mode, question, seedConstruct }) => {
    if (mode !== "sound-builder") {
      throw new Error(`Unexpected mode: ${mode}`);
    }

    assert.match(String(question), /t8s shure mic setting/i);

    return {
      responseId: "resp_force_assist_soundspace",
      model: "gpt-5.4-mini",
      usage: {
        input_tokens: 18,
        output_tokens: 34,
        total_tokens: 52
      },
      construct: {
        ...seedConstruct,
        setup: {
          ...(seedConstruct.setup ?? {}),
          notes: "Forced AI suggestion path: ask which Shure model if the singer has not specified one."
        },
        shouldLearn: true
      }
    };
  });

  try {
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
        question: "t8s shure mic setting",
        reviewBeforeStore: true,
        forceAssist: true
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.needsReview, true);
      assert.equal(payload.source, "openai-proposal");
      assert.equal(payload.construct?.deviceModel, "T8S");
      assert.match(String(payload.construct?.setup?.notes), /Forced AI suggestion path/i);
    });
  } finally {
    __setOpenAiAssistMock(null);
  }
});

await check("POST /api/soundspace/answer can force AI assist for a new EV FOH query", async () => {
  __setOpenAiAssistMock(async ({ mode, question, seedConstruct }) => {
    if (mode !== "sound-builder") {
      throw new Error(`Unexpected mode: ${mode}`);
    }

    assert.match(String(question), /electro voice zlx-12p g2/i);

    return {
      responseId: "resp_force_assist_ev_soundspace",
      model: "gpt-5.4-mini",
      usage: {
        input_tokens: 20,
        output_tokens: 44,
        total_tokens: 64
      },
      construct: {
        ...seedConstruct,
        setup: {
          ...(seedConstruct.setup ?? {}),
          notes: "Forced AI suggestion path: reviewed EV ZLX-12P-G2 front-of-house starting point."
        },
        shouldLearn: true
      }
    };
  });

  try {
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
        question: "what are the settings for two Electro Voice ZLX-12p G2 front of house speakers",
        reviewBeforeStore: true,
        forceAssist: true
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.needsReview, true);
      assert.equal(payload.source, "openai-proposal");
      assert.equal(payload.construct?.deviceModel, "ZLX-12P-G2");
      assert.match(String(payload.construct?.setup?.notes), /Forced AI suggestion path/i);
    });
  } finally {
    __setOpenAiAssistMock(null);
  }
});

await check("POST /api/subjectspace/subject-ideas returns AI suggested starter constructs for a described subject", async () => {
  __setOpenAiAssistMock(async ({ mode, description, requestedSubjectLabel }) => {
    assert.equal(mode, "subject-ideas");
    assert.match(String(description), /wireless karaoke rigs/i);
    assert.equal(requestedSubjectLabel, "Music Engineering");

    return {
      responseId: "resp_mock_subject_ideas",
      model: "gpt-5.4-mini",
      usage: {
        input_tokens: 28,
        output_tokens: 118,
        total_tokens: 146
      },
      suggestions: {
        subjectLabel: "Music Engineering",
        subjectSummary: "Starter construct map for karaoke and small live-sound workflows.",
        suggestedConstructs: [
          {
            constructLabel: "Wireless karaoke gain staging reset",
            target: "Wireless karaoke vocal chain",
            objective: "clean vocal gain before feedback across a full karaoke signal path",
            contextEntries: [
              { key: "venue", value: "karaoke bar" },
              { key: "wireless", value: "dual handheld receivers" }
            ],
            starterSteps: [
              "Set receiver output before touching mixer trim.",
              "Raise input gain until loud vocal peaks stay clean.",
              "Ring out monitors only after the vocal path is stable."
            ],
            tags: ["karaoke", "wireless", "gain staging"],
            rationale: "This creates the reusable baseline for most karaoke resets."
          },
          {
            constructLabel: "Monitor ring-out for karaoke vocals",
            target: "Stage monitor feedback control",
            objective: "stable singer monitoring without edge-of-feedback tension",
            contextEntries: [
              { key: "monitor type", value: "powered wedges" },
              { key: "priority", value: "gain before feedback" }
            ],
            starterSteps: [
              "Start monitor sends low.",
              "Cut the first feedback frequency before adding more level.",
              "Re-check vocal tone after each monitor cut."
            ],
            tags: ["monitor mix", "feedback control", "karaoke"],
            rationale: "Separating monitor control keeps monitor decisions from muddying the main reset flow."
          }
        ]
      }
    };
  });

  try {
    await withServer(async (address) => {
      const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/subject-ideas`, {
        subjectLabel: "Music Engineering",
        description: "Build a reusable subject around wireless karaoke rigs, gain staging, monitor ring-out, and recallable live-sound starting points."
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.source, "openai-subject-mapper");
      assert.equal(payload.suggestions?.subjectLabel, "Music Engineering");
      assert.match(String(payload.suggestions?.subjectSummary), /karaoke|live-sound/i);
      assert.equal(payload.suggestions?.suggestedConstructs?.length, 2);
      assert.equal(payload.suggestions?.suggestedConstructs?.[0]?.constructLabel, "Wireless karaoke gain staging reset");
      assert.deepEqual(payload.suggestions?.suggestedConstructs?.[0]?.context, {
        venue: "karaoke bar",
        wireless: "dual handheld receivers"
      });
      assert.ok(Array.isArray(payload.suggestions?.suggestedConstructs?.[0]?.starterSteps));
      assert.equal(payload.responseId, "resp_mock_subject_ideas");
      assert.equal(payload.usage?.total_tokens, 146);
    });
  } finally {
    __setOpenAiAssistMock(null);
  }
});

await check("POST /api/subjectspace/subject-ideas returns a timeout payload when AI subject mapping stalls", async () => {
  const originalTimeout = process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
  process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = "25";
  __setOpenAiAssistMock(async ({ mode }) => {
    assert.equal(mode, "subject-ideas");
    return await new Promise(() => {});
  });

  try {
    await withServer(async (address) => {
      const started = Date.now();
      const response = await postJson(`http://127.0.0.1:${address.port}/api/subjectspace/subject-ideas`, {
        subjectLabel: "Music Engineering",
        description: "Create subject starter constructs for karaoke recall and monitor tuning."
      });

      assert.equal(response.status, 504);
      const payload = await response.json();
      assert.equal(payload.ok, false);
      assert.equal(payload.code, "OPENAI_REQUEST_TIMEOUT");
      assert.match(String(payload.error), /timed out/i);
      assert.ok(Date.now() - started < 1000);
    });
  } finally {
    __setOpenAiAssistMock(null);
    if (originalTimeout === undefined) {
      delete process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
    } else {
      process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = originalTimeout;
    }
  }
});

await check("POST /api/soundspace/answer falls back quickly when OpenAI refinement stalls", async () => {
  const originalTimeout = process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
  process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = "25";
  __setOpenAiAssistMock(async ({ mode }) => {
    if (mode !== "sound-builder") {
      throw new Error(`Unexpected mode: ${mode}`);
    }

    return await new Promise(() => {});
  });

  try {
    await withServer(async (address) => {
      const started = Date.now();
      const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
        question: "What is a good t8s beta 58a mic setting for karaoke?",
        forceGenerate: true
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.source, "generated-and-stored");
      assert.equal(payload.construct?.deviceModel, "T8S");
      assert.ok(Date.now() - started < 1000);
    });
  } finally {
    __setOpenAiAssistMock(null);
    if (originalTimeout === undefined) {
      delete process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS;
    } else {
      process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS = originalTimeout;
    }
  }
});

await check("soundspace recall returns only the requested setup section in focusedSetup", async () => {
  await withServer(async (address) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=t8s%20eq`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ready, true);
    assert.deepEqual(payload.focusKeys, ["eq"]);
    assert.deepEqual(Object.keys(payload.focusedSetup ?? {}), ["eq"]);
    assert.match(String(payload.answer), /EQ:/i);
    assert.doesNotMatch(String(payload.answer), /Gain:/i);
  });
});

await check("POST /api/soundspace/answer learns a model-specific construct from a generic mixer recall", async () => {
  await withServer(async (address) => {
    const response = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      question: "What is a good t8s sm58 mic setting for karaoke?"
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(String(payload.source), /generated-and-stored$/);
    assert.equal(payload.construct?.deviceModel, "T8S");
    assert.equal(payload.construct?.sourceBrand, "Shure");
    assert.equal(payload.construct?.sourceModel, "SM58");
    assert.ok(Array.isArray(payload.construct?.strands));
    assert.ok(payload.construct.strands.includes("mic:shure-sm58"));
    assert.equal(payload.recall?.matched?.sourceModel, "SM58");
    assert.match(String(payload.answer), /Mic profile: Shure SM58/i);

    const recallResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=t8s%20sm58%20mic%20setting%20for%20karaoke`
    );
    assert.equal(recallResponse.status, 200);
    const recalled = await recallResponse.json();
    assert.equal(recalled.matched?.sourceModel, "SM58");
    assert.equal(recalled.recommendation, "use_strandspace");
  });
});

await check("POST /api/soundspace/learn merges new strands onto an existing mixer construct", async () => {
  await withServer(async (address) => {
    const learnResponse = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/learn`, {
      id: "bose-t8s-solo-vocal-karaoke",
      sourceBrand: "Shure",
      sourceModel: "SM58",
      strands: ["mic:shure_sm58", "style:general_mic_setting"]
    });

    assert.equal(learnResponse.status, 200);
    const learned = await learnResponse.json();
    assert.equal(learned.construct.sourceModel, "SM58");
    assert.ok(learned.construct.strands.includes("mic:shure_sm58"));
    assert.ok(learned.construct.strands.includes("setup:feedback_control"));

    const recallResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=t8s%20sm58%20mic%20setting`
    );
    assert.equal(recallResponse.status, 200);
    const recalled = await recallResponse.json();
    assert.equal(recalled.ready, true);
    assert.equal(recalled.parsed.sourceModel, "SM58");
    assert.match(String(recalled.answer), /Mic profile: Shure SM58/i);
  });
});

await check("POST /api/soundspace/learn mirrors reviewed sound constructs into Music Engineering", async () => {
  await withServer(async (address) => {
    const soundId = `bose-l1-pro8-foh-${Date.now()}`;
    const learnResponse = await postJson(`http://127.0.0.1:${address.port}/api/soundspace/learn`, {
      id: soundId,
      name: "Bose L1 Pro8 FOH starting point",
      deviceBrand: "Bose",
      deviceModel: "L1 Pro8",
      deviceType: "speaker_system",
      sourceType: "speaker system",
      goal: "front of house coverage",
      venueSize: "medium",
      eventType: "general",
      speakerConfig: "two column arrays as front of house",
      setup: {
        system: "Run the pair as the main front of house system.",
        gain: "Bring the system up until coverage is even without limiter hit.",
        eq: "Start flat and trim harsh upper mids only if the room gets edgy.",
        placement: "Keep the columns just ahead of the microphones for clean coverage.",
        notes: "Reviewed speaker-system starting point."
      },
      tags: ["speaker system", "foh"],
      strands: ["system:front_of_house"]
    });

    assert.equal(learnResponse.status, 200);
    const learned = await learnResponse.json();
    assert.equal(learned.construct.deviceModel, "L1 Pro8");
    assert.equal(learned.linkedSubjectConstruct?.subjectId, "music-engineering");
    assert.match(String(learned.linkedSubjectConstruct?.constructLabel), /Bose L1 Pro8 FOH starting point/i);

    const subjectResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/library?subjectId=music-engineering`);
    assert.equal(subjectResponse.status, 200);
    const subjectPayload = await subjectResponse.json();
    assert.ok(subjectPayload.constructs.some((construct) => construct.id === `sound-${soundId}`));
  });
});

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  if (result.ok) {
    console.log(`ok - ${result.name}`);
  } else {
    console.error(`not ok - ${result.name}`);
    console.error(result.error);
  }
}

try {
  for (const filePath of tempDatabasePaths) {
    await rm(filePath, { force: true });
    await rm(`${filePath}-shm`, { force: true });
    await rm(`${filePath}-wal`, { force: true });
  }
  for (const docPath of tempDocPaths) {
    await rm(docPath, { force: true });
  }
} catch {
  // Best effort cleanup for temporary test data.
}

if (failed.length > 0) {
  process.exitCode = 1;
  console.error(`${failed.length} test(s) failed`);
} else {
  console.log(`${results.length} test(s) passed`);
}
