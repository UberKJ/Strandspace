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
const { __setOpenAiAssistMock } = await import("../strandspace/openai-assist.js");
const {
  ensureSubjectspaceTables,
  getSubjectConstruct,
  listSubjectConstructs,
  upsertSubjectConstruct
} = await import("../strandspace/subjectspace.js");
const {
  ensureSoundspaceTables,
  listSoundConstructs,
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

await check("GET / serves the construct builder page", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Strandspace Construct Builder/);
    assert.match(html, /Turn rough notes into a reusable Strandspace construct/i);
    assert.match(html, /Construct Builder/);
  });
});

await check("GET /studio serves Strandspace Studio", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/studio`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Strandspace Studio/);
    assert.match(html, /Teach a subject once/);
  });
});

await check("GET /soundspace serves the standalone Soundspace app", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/soundspace`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Strandspace Music Engineer/);
    assert.match(html, /Search the mixer memory like a working engineer, not a note dump/i);
    assert.match(html, /Search Memory/);
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
    assert.ok((payload.recall.trace?.triggerStrands?.length ?? 0) > 0);
    assert.ok((payload.recall.trace?.compositeStrands?.length ?? 0) > 0);
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
  __setOpenAiAssistMock(null);
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

      assert.equal(response.status, 502);
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
    assert.equal(payload.source, "generated-and-stored");
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
    assert.equal(payload.source, "generated-and-stored");
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
