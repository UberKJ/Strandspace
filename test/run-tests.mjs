import assert from "node:assert/strict";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, rm } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const tempDir = join(rootDir, "tmp", "tests");
const tempDatabasePath = join(tempDir, `strandspace-test-${Date.now()}.sqlite`);

await mkdir(tempDir, { recursive: true });
process.env.STRANDSPACE_DB_PATH = tempDatabasePath;

const { createApp } = await import("../server.mjs");
const { __setOpenAiAssistMock } = await import("../strandspace/openai-assist.js");

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

await check("GET / serves Strandspace Studio", async () => {
  await withServer(async (address) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
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
    assert.match(html, /Strandspace Soundspace/);
    assert.match(html, /Build Or Recall/);
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
  await rm(tempDatabasePath, { force: true });
  await rm(`${tempDatabasePath}-shm`, { force: true });
  await rm(`${tempDatabasePath}-wal`, { force: true });
} catch {
  // Best effort cleanup for temporary test data.
}

if (failed.length > 0) {
  process.exitCode = 1;
  console.error(`${failed.length} test(s) failed`);
} else {
  console.log(`${results.length} test(s) passed`);
}
