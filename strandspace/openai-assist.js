import OpenAI from "openai";
import { execFileSync } from "node:child_process";

const DEFAULT_MODEL = process.env.SUBJECTSPACE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";

let client = null;
let mockAssistRunner = null;
let resolvedApiKey = null;
let resolvedApiKeyLoaded = false;

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

function resolveOpenAiApiKey() {
  const processKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (processKey) {
    return processKey;
  }

  if (!canUseWindowsEnvFallback()) {
    return "";
  }

  if (resolvedApiKeyLoaded) {
    return resolvedApiKey;
  }

  resolvedApiKeyLoaded = true;
  resolvedApiKey = readWindowsUserEnvironment("OPENAI_API_KEY");

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

export function getOpenAiAssistStatus() {
  const enabled = Boolean(mockAssistRunner || resolveOpenAiApiKey());

  return {
    provider: "openai",
    enabled,
    model: DEFAULT_MODEL,
    reason: enabled
      ? `OpenAI assist is ready on ${DEFAULT_MODEL}.`
      : "Set OPENAI_API_KEY to enable live API validation and expansion."
  };
}

export async function generateOpenAiSubjectAssist({
  question,
  subjectId = "",
  subjectLabel = "General Recall",
  recall = {}
} = {}) {
  if (mockAssistRunner) {
    return mockAssistRunner({
      question,
      subjectId,
      subjectLabel,
      recall
    });
  }

  const openai = getClient();
  const response = await openai.responses.create({
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
  });

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
    assist
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
