import OpenAI from "openai";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MODEL = process.env.SUBJECTSPACE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");
const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 20000;

let client = null;
let mockAssistRunner = null;
let resolvedApiKey = null;
let resolvedApiKeyLoaded = false;

function resolvePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOpenAiRequestTimeoutMs() {
  return resolvePositiveInteger(
    process.env.SUBJECTSPACE_OPENAI_TIMEOUT_MS ?? process.env.OPENAI_TIMEOUT_MS,
    DEFAULT_OPENAI_REQUEST_TIMEOUT_MS
  );
}

function buildOpenAiTimeoutError(timeoutMs) {
  const error = new Error(`OpenAI request timed out after ${timeoutMs}ms.`);
  error.code = "OPENAI_REQUEST_TIMEOUT";
  error.statusCode = 504;
  error.payload = {
    ok: false,
    code: "OPENAI_REQUEST_TIMEOUT",
    error: `OpenAI request timed out after ${timeoutMs}ms.`,
    timeoutMs
  };
  return error;
}

function buildOpenAiRequestError(error, fallbackMessage = "OpenAI request failed.") {
  const message = String(error?.message ?? fallbackMessage).trim() || fallbackMessage;
  const normalized = new Error(message);
  normalized.code = String(error?.code ?? "OPENAI_REQUEST_FAILED");
  normalized.statusCode = Number(error?.statusCode ?? error?.status ?? 502) || 502;
  normalized.payload = {
    ok: false,
    code: normalized.code,
    error: message
  };
  return normalized;
}

async function runOpenAiRequest(executor) {
  const timeoutMs = getOpenAiRequestTimeoutMs();
  const controller = new AbortController();
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(buildOpenAiTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      executor({
        signal: controller.signal,
        timeout: timeoutMs
      }),
      timeoutPromise
    ]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw buildOpenAiTimeoutError(timeoutMs);
    }
    throw buildOpenAiRequestError(error);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeArray(value, limit = 12) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
  )].slice(0, limit);
}

function normalizeContextEntries(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => ({
      key: String(entry?.key ?? "").trim(),
      value: String(entry?.value ?? "").trim()
    }))
    .filter((entry) => entry.key && entry.value)
    .slice(0, 10);
}

function contextObject(entries = []) {
  return Object.fromEntries(
    normalizeContextEntries(entries).map((entry) => [entry.key, entry.value])
  );
}

function recallSnapshot(recall = {}) {
  const matched = recall.matched ?? null;
  return {
    routing: recall.routing ?? {},
    matched: matched
      ? {
        constructLabel: matched.constructLabel,
        target: matched.target,
        objective: matched.objective,
        context: matched.context ?? {},
        steps: matched.steps ?? [],
        notes: matched.notes ?? "",
        tags: matched.tags ?? []
      }
      : null,
    candidates: (recall.candidates ?? []).slice(0, 3).map((candidate) => ({
      constructLabel: candidate.constructLabel,
      target: candidate.target,
      objective: candidate.objective,
      score: candidate.score,
      support: candidate.support ?? []
    })),
    readiness: recall.readiness ?? {}
  };
}

function getClient() {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

function canUseWindowsEnvFallback() {
  return process.platform === "win32" && process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP !== "1";
}

function readWindowsUserEnvironment(name) {
  if (!canUseWindowsEnvFallback()) {
    return "";
  }

  try {
    return execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `[Environment]::GetEnvironmentVariable('${name}','User')`
      ],
      {
        encoding: "utf8",
        timeout: 1500,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim();
  } catch {
    return "";
  }
}

function parseApiKeyAssignment(content = "") {
  const text = String(content ?? "");
  const envMatch = text.match(/^\s*OPENAI_API_KEY\s*=\s*["']?([^"'`\r\n]+)["']?/m);
  if (envMatch?.[1]) {
    return envMatch[1].trim();
  }

  const exportMatch = text.match(/^\s*export\s+OPENAI_API_KEY\s*=\s*["']?([^"'`\r\n]+)["']?/m);
  if (exportMatch?.[1]) {
    return exportMatch[1].trim();
  }

  const setxMatch = text.match(/^\s*setx\s+OPENAI_API_KEY\s+"([^"\r\n]+)"/mi);
  if (setxMatch?.[1]) {
    return setxMatch[1].trim();
  }

  return "";
}

function readProjectConfigApiKey() {
  if (process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP === "1") {
    return "";
  }

  const candidates = [
    ".env",
    ".env.local",
    ".zshrc",
    ".zshrc.txt"
  ];

  for (const name of candidates) {
    try {
      const value = parseApiKeyAssignment(readFileSync(join(projectRoot, name), "utf8"));
      if (value) {
        return value;
      }
    } catch {
      // Ignore missing or unreadable local config files.
    }
  }

  return "";
}

function resolveOpenAiApiKey() {
  const processKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (processKey) {
    return processKey;
  }

  if (resolvedApiKeyLoaded) {
    return resolvedApiKey;
  }

  resolvedApiKeyLoaded = true;
  resolvedApiKey = readProjectConfigApiKey();

  if (!resolvedApiKey && canUseWindowsEnvFallback()) {
    resolvedApiKey = readWindowsUserEnvironment("OPENAI_API_KEY");
  }

  if (resolvedApiKey) {
    process.env.OPENAI_API_KEY = resolvedApiKey;
  }

  return resolvedApiKey;
}

function assistSchema() {
  return {
    type: "object",
    properties: {
      apiAction: {
        type: "string",
        enum: ["validate", "expand", "draft"]
      },
      constructLabel: {
        type: "string",
        minLength: 1
      },
      target: {
        type: "string",
        minLength: 1
      },
      objective: {
        type: "string",
        minLength: 1
      },
      contextEntries: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            key: {
              type: "string",
              minLength: 1
            },
            value: {
              type: "string",
              minLength: 1
            }
          },
          required: ["key", "value"],
          additionalProperties: false
        }
      },
      steps: {
        type: "array",
        minItems: 3,
        maxItems: 8,
        items: {
          type: "string",
          minLength: 1
        }
      },
      notes: {
        type: "string",
        minLength: 1
      },
      tags: {
        type: "array",
        maxItems: 8,
        items: {
          type: "string",
          minLength: 1
        }
      },
      validationFocus: {
        type: "array",
        maxItems: 6,
        items: {
          type: "string",
          minLength: 1
        }
      },
      rationale: {
        type: "string",
        minLength: 1
      },
      shouldLearn: {
        type: "boolean"
      }
    },
    required: [
      "apiAction",
      "constructLabel",
      "target",
      "objective",
      "contextEntries",
      "steps",
      "notes",
      "tags",
      "validationFocus",
      "rationale",
      "shouldLearn"
    ],
    additionalProperties: false
  };
}

function buildInstructions() {
  return [
    "You help Strandspace validate or expand reusable subject-memory constructs.",
    "Return only JSON that matches the provided schema.",
    "Prefer incremental improvement over rewriting everything from scratch.",
    "If a local construct already exists, preserve what is clearly working and only expand the missing cues.",
    "Keep steps actionable, concise, and directly learnable back into Strandspace."
  ].join(" ");
}

function buildInput({ question, subjectId, subjectLabel, recall }) {
  return [
    `Subject id: ${subjectId || "new-subject"}`,
    `Subject label: ${subjectLabel}`,
    `User question: ${question}`,
    `Routing decision: ${JSON.stringify(recall?.routing ?? {}, null, 2)}`,
    `Local recall snapshot: ${JSON.stringify(recallSnapshot(recall), null, 2)}`,
    "Produce a validated or expanded construct that the app can optionally learn into local memory."
  ].join("\n\n");
}

function buildBuilderInstructions() {
  return [
    "You convert freeform notes into a reusable Strandspace subject construct draft.",
    "Return only JSON that matches the provided schema.",
    "Prefer apiAction draft unless the input clearly describes an existing construct that only needs validation.",
    "Use supplied checked references and manual documents when they are relevant.",
    "Preserve concrete details from the source notes and keep them teachable back into Strandspace.",
    "Keep context entries short, steps actionable, and notes concise.",
    "If a checked manual reference contains a constraint or limitation, carry that forward into the draft notes."
  ].join(" ");
}

function summarizeBuilderReferences(references = []) {
  if (!Array.isArray(references) || !references.length) {
    return [];
  }

  return references.slice(0, 4).map((reference) => ({
    subjectLabel: reference.subjectLabel ?? "",
    constructLabel: reference.constructLabel ?? "",
    target: reference.target ?? "",
    objective: reference.objective ?? "",
    notes: reference.notes ?? "",
    tags: Array.isArray(reference.tags) ? reference.tags.slice(0, 8) : [],
    context: reference.context ?? {},
    sources: Array.isArray(reference.sources)
      ? reference.sources.map((source) => ({
        label: source.label ?? "",
        fileName: source.fileName ?? "",
        url: source.url ?? ""
      }))
      : []
  }));
}

function buildBuilderInput({
  input = "",
  subjectId = "",
  subjectLabel = "General Recall",
  seedDraft = {},
  references = []
} = {}) {
  return [
    `Subject id: ${subjectId || "new-subject"}`,
    `Subject label: ${subjectLabel}`,
    `Builder input: ${input}`,
    `Heuristic draft: ${JSON.stringify({
      constructLabel: seedDraft.constructLabel ?? "",
      target: seedDraft.target ?? "",
      objective: seedDraft.objective ?? "",
      context: seedDraft.context ?? {},
      steps: seedDraft.steps ?? [],
      notes: seedDraft.notes ?? "",
      tags: seedDraft.tags ?? []
    }, null, 2)}`,
    `Checked references: ${JSON.stringify(summarizeBuilderReferences(references), null, 2)}`,
    "Produce the strongest reusable Strandspace construct draft you can derive from these notes."
  ].join("\n\n");
}

function soundSetupObject(setup = {}) {
  if (!setup || typeof setup !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(setup)
      .map(([key, value]) => [String(key ?? "").trim(), String(value ?? "").trim()])
      .filter(([key, value]) => key && value)
      .slice(0, 10)
  );
}

function soundConstructSchema() {
  const soundConstructKeys = [
    "name",
    "deviceBrand",
    "deviceModel",
    "deviceType",
    "sourceType",
    "sourceBrand",
    "sourceModel",
    "presetSystem",
    "presetCategory",
    "presetName",
    "goal",
    "venueSize",
    "eventType",
    "speakerConfig",
    "setup",
    "tags",
    "strands",
    "llmSummary",
    "shouldLearn"
  ];
  const soundSetupKeys = [
    "toneMatch",
    "system",
    "gain",
    "eq",
    "fx",
    "monitor",
    "placement",
    "notes"
  ];

  return {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      deviceBrand: { type: "string" },
      deviceModel: { type: "string", minLength: 1 },
      deviceType: { type: "string" },
      sourceType: { type: "string", minLength: 1 },
      sourceBrand: { type: "string" },
      sourceModel: { type: "string" },
      presetSystem: { type: "string" },
      presetCategory: { type: "string" },
      presetName: { type: "string" },
      goal: { type: "string", minLength: 1 },
      venueSize: { type: "string" },
      eventType: { type: "string" },
      speakerConfig: { type: "string" },
      setup: {
        type: "object",
        properties: {
          toneMatch: { type: "string" },
          system: { type: "string" },
          gain: { type: "string" },
          eq: { type: "string" },
          fx: { type: "string" },
          monitor: { type: "string" },
          placement: { type: "string" },
          notes: { type: "string" }
        },
        required: soundSetupKeys,
        additionalProperties: false
      },
      tags: {
        type: "array",
        maxItems: 16,
        items: { type: "string", minLength: 1 }
      },
      strands: {
        type: "array",
        maxItems: 20,
        items: { type: "string", minLength: 1 }
      },
      llmSummary: { type: "string" },
      shouldLearn: { type: "boolean" }
    },
    required: soundConstructKeys,
    additionalProperties: false
  };
}

function buildSoundBuilderInstructions() {
  return [
    "You refine reusable live-sound constructs for Strandspace Soundspace.",
    "Return only JSON that matches the provided schema.",
    "Preserve accurate mixer, source, and preset details from the seed construct unless the question clearly improves them.",
    "When the question is about Bose T4S/T8S, keep Bose ToneMatch preset names explicit and stable.",
    "If the user asks for a full-system reset, step-by-step workflow, exact clock positions, or exact values, make the setup fields explicit and operational rather than generic.",
    "If multiple devices are named, anchor the construct on the primary control device but use system, monitor, placement, and notes to describe the full signal chain and downstream gear.",
    "Use approximate clock positions or numeric starting values when the user explicitly asks for exact settings, but do not present unsupported values as manufacturer-certified specs.",
    "Keep setup guidance practical and easy to learn back into local memory."
  ].join(" ");
}

function buildSoundBuilderInput({ question = "", recall = {}, seedConstruct = {} } = {}) {
  return [
    `User question: ${question}`,
    `Sound recall snapshot: ${JSON.stringify({
      parsed: recall?.parsed ?? {},
      recommendation: recall?.recommendation ?? "",
      matched: recall?.matched
        ? {
          id: recall.matched.id,
          name: recall.matched.name,
          sourceType: recall.matched.sourceType,
          sourceBrand: recall.matched.sourceBrand,
          sourceModel: recall.matched.sourceModel,
          presetSystem: recall.matched.presetSystem,
          presetCategory: recall.matched.presetCategory,
          presetName: recall.matched.presetName,
          setup: soundSetupObject(recall.matched.setup)
        }
        : null,
      combined: Array.isArray(recall?.combined?.matches)
        ? recall.combined.matches.map((match) => ({
          id: match.id,
          name: match.name,
          deviceBrand: match.deviceBrand,
          deviceModel: match.deviceModel,
          sourceType: match.sourceType,
          focusedSetup: soundSetupObject(match.focusedSetup)
        }))
        : []
    }, null, 2)}`,
    `Seed construct: ${JSON.stringify({
      ...seedConstruct,
      setup: soundSetupObject(seedConstruct.setup),
      tags: normalizeArray(seedConstruct.tags, 16),
      strands: normalizeArray(seedConstruct.strands, 20)
    }, null, 2)}`,
    "Improve the seed construct only where the question adds useful new detail.",
    "If the user named multiple devices, preserve the primary device in the construct fields and describe the wider rig in setup.system, setup.monitor, setup.placement, and setup.notes."
  ].join("\n\n");
}

function normalizeAssistPayload(payload = {}, meta = {}) {
  const contextEntries = normalizeContextEntries(payload.contextEntries);
  const tags = normalizeArray(payload.tags, 8);
  const validationFocus = normalizeArray(payload.validationFocus, 6);

  return {
    apiAction: String(payload.apiAction ?? "validate").trim() || "validate",
    constructLabel: String(payload.constructLabel ?? meta.constructLabel ?? "API-assisted construct").trim() || "API-assisted construct",
    target: String(payload.target ?? meta.target ?? "General target").trim() || "General target",
    objective: String(payload.objective ?? meta.objective ?? "Refined objective").trim() || "Refined objective",
    contextEntries,
    context: contextObject(contextEntries),
    steps: normalizeArray(payload.steps, 8),
    notes: String(payload.notes ?? "").trim(),
    tags,
    validationFocus,
    rationale: String(payload.rationale ?? "").trim(),
    shouldLearn: Boolean(payload.shouldLearn ?? true)
  };
}

function normalizeSoundConstructPayload(payload = {}, meta = {}) {
  return {
    name: String(payload.name ?? meta.name ?? "API-assisted sound construct").trim() || "API-assisted sound construct",
    deviceBrand: String(payload.deviceBrand ?? meta.deviceBrand ?? "").trim() || null,
    deviceModel: String(payload.deviceModel ?? meta.deviceModel ?? "").trim() || null,
    deviceType: String(payload.deviceType ?? meta.deviceType ?? "mixer").trim() || "mixer",
    sourceType: String(payload.sourceType ?? meta.sourceType ?? "microphone").trim() || "microphone",
    sourceBrand: String(payload.sourceBrand ?? meta.sourceBrand ?? "").trim() || null,
    sourceModel: String(payload.sourceModel ?? meta.sourceModel ?? "").trim() || null,
    presetSystem: String(payload.presetSystem ?? meta.presetSystem ?? "").trim() || null,
    presetCategory: String(payload.presetCategory ?? meta.presetCategory ?? "").trim() || null,
    presetName: String(payload.presetName ?? meta.presetName ?? "").trim() || null,
    goal: String(payload.goal ?? meta.goal ?? "general setup").trim() || "general setup",
    venueSize: String(payload.venueSize ?? meta.venueSize ?? "small").trim() || "small",
    eventType: String(payload.eventType ?? meta.eventType ?? "general").trim() || "general",
    speakerConfig: String(payload.speakerConfig ?? meta.speakerConfig ?? "compact powered mains").trim() || "compact powered mains",
    setup: soundSetupObject(payload.setup ?? meta.setup),
    tags: normalizeArray(payload.tags ?? meta.tags, 16),
    strands: normalizeArray(payload.strands ?? meta.strands, 20),
    llmSummary: String(payload.llmSummary ?? meta.llmSummary ?? "").trim() || "OpenAI refined this sound construct for local learning.",
    shouldLearn: Boolean(payload.shouldLearn ?? true)
  };
}

function normalizeUsagePayload(usage = null) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens);
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens);

  return {
    input_tokens: Number.isFinite(inputTokens) ? inputTokens : null,
    output_tokens: Number.isFinite(outputTokens) ? outputTokens : null,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : null
  };
}

export function getOpenAiAssistStatus() {
  const enabled = Boolean(mockAssistRunner || resolveOpenAiApiKey());
  const timeoutMs = getOpenAiRequestTimeoutMs();

  return {
    provider: "openai",
    enabled,
    model: DEFAULT_MODEL,
    timeoutMs,
    reason: enabled
      ? `OpenAI assist is ready on ${DEFAULT_MODEL} with a ${timeoutMs}ms request timeout.`
      : "OpenAI assist is disabled, so Strandspace will stay in local-only mode unless OPENAI_API_KEY is configured."
  };
}

export async function generateOpenAiSubjectAssist({
  question,
  subjectId = "",
  subjectLabel = "General Recall",
  recall = {}
} = {}) {
  if (mockAssistRunner) {
    return runOpenAiRequest(() => mockAssistRunner({
      question,
      subjectId,
      subjectLabel,
      recall
    }));
  }

  const openai = getClient();
  const response = await runOpenAiRequest((requestOptions) => (
    openai.responses.create({
      model: DEFAULT_MODEL,
      store: false,
      instructions: buildInstructions(),
      input: buildInput({
        question,
        subjectId,
        subjectLabel,
        recall
      }),
      text: {
        format: {
          type: "json_schema",
          name: "subjectspace_assist",
          strict: true,
          schema: assistSchema()
        }
      }
    }, requestOptions)
  ));

  const parsed = JSON.parse(response.output_text);
  const matched = recall?.matched ?? null;
  const assist = normalizeAssistPayload(parsed, {
    constructLabel: matched?.constructLabel,
    target: matched?.target,
    objective: matched?.objective
  });

  return {
    responseId: response.id,
    model: response.model ?? DEFAULT_MODEL,
    usage: normalizeUsagePayload(response.usage),
    assist
  };
}

export async function generateOpenAiSubjectConstructBuilder({
  input = "",
  subjectId = "",
  subjectLabel = "General Recall",
  seedDraft = {},
  references = []
} = {}) {
  if (mockAssistRunner) {
    return runOpenAiRequest(() => mockAssistRunner({
      mode: "builder",
      input,
      question: input,
      subjectId,
      subjectLabel,
      seedDraft,
      references
    }));
  }

  const openai = getClient();
  const response = await runOpenAiRequest((requestOptions) => (
    openai.responses.create({
      model: DEFAULT_MODEL,
      store: false,
      instructions: buildBuilderInstructions(),
      input: buildBuilderInput({
        input,
        subjectId,
        subjectLabel,
        seedDraft,
        references
      }),
      text: {
        format: {
          type: "json_schema",
          name: "subjectspace_construct_builder",
          strict: true,
          schema: assistSchema()
        }
      }
    }, requestOptions)
  ));

  const parsed = JSON.parse(response.output_text);
  const assist = normalizeAssistPayload(parsed, {
    constructLabel: seedDraft.constructLabel,
    target: seedDraft.target,
    objective: seedDraft.objective
  });

  return {
    responseId: response.id,
    model: response.model ?? DEFAULT_MODEL,
    usage: normalizeUsagePayload(response.usage),
    assist
  };
}

export async function generateOpenAiSoundConstructBuilder({
  question = "",
  recall = {},
  seedConstruct = {}
} = {}) {
  if (mockAssistRunner) {
    const mocked = await runOpenAiRequest(() => mockAssistRunner({
      mode: "sound-builder",
      domain: "soundspace",
      question,
      recall,
      seedConstruct
    }));

    return {
      responseId: mocked?.responseId ?? null,
      model: mocked?.model ?? DEFAULT_MODEL,
      usage: normalizeUsagePayload(mocked?.usage),
      construct: normalizeSoundConstructPayload(mocked?.construct ?? mocked, seedConstruct)
    };
  }

  const openai = getClient();
  const response = await runOpenAiRequest((requestOptions) => (
    openai.responses.create({
      model: DEFAULT_MODEL,
      store: false,
      instructions: buildSoundBuilderInstructions(),
      input: buildSoundBuilderInput({
        question,
        recall,
        seedConstruct
      }),
      text: {
        format: {
          type: "json_schema",
          name: "soundspace_construct_builder",
          strict: true,
          schema: soundConstructSchema()
        }
      }
    }, requestOptions)
  ));

  const parsed = JSON.parse(response.output_text);

  return {
    responseId: response.id,
    model: response.model ?? DEFAULT_MODEL,
    usage: normalizeUsagePayload(response.usage),
    construct: normalizeSoundConstructPayload(parsed, seedConstruct)
  };
}

export function buildSuggestedConstructFromAssist({
  subjectId = "",
  subjectLabel = "General Recall",
  assist = {},
  question = "",
  routingMode = ""
} = {}) {
  const normalized = normalizeAssistPayload(assist);

  return {
    subjectId,
    subjectLabel,
    constructLabel: normalized.constructLabel,
    target: normalized.target,
    objective: normalized.objective,
    context: normalized.context,
    steps: normalized.steps,
    notes: normalized.notes,
    tags: normalized.tags,
    provenance: {
      source: "openai-responses",
      model: DEFAULT_MODEL,
      learnedFromQuestion: question,
      routingMode
    }
  };
}

export function __setOpenAiAssistMock(mock) {
  mockAssistRunner = typeof mock === "function" ? mock : null;
}

export function __resetOpenAiAssistState() {
  client = null;
  mockAssistRunner = null;
  resolvedApiKey = null;
  resolvedApiKeyLoaded = false;
}
