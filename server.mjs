import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, isAbsolute, join, normalize } from "node:path";
import { access, readFile, readdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import {
  ensureSoundspaceTables,
  listSoundConstructs,
  recallSoundspace,
  seedSoundspace,
  upsertSoundConstruct
} from "./strandspace/soundspace.js";
import { buildSoundConstructFromQuestion } from "./strandspace/sound-llm.js";
import {
  buildSubjectBenchmarkQuestionCandidates,
  buildSubjectConstructDraftFromInput,
  estimateTextTokens,
  ensureSubjectspaceTables,
  mergeSubjectConstruct,
  listSubjectConstructs,
  listSubjectSpaces,
  recallSubjectSpace,
  seedSubjectspace,
  upsertSubjectConstruct
} from "./strandspace/subjectspace.js";
import {
  buildSuggestedConstructFromAssist,
  generateOpenAiSubjectConstructBuilder,
  generateOpenAiSubjectAssist,
  getOpenAiAssistStatus
} from "./strandspace/openai-assist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const configuredDatabasePath = String(process.env.STRANDSPACE_DB_PATH ?? "").trim();
const dataDir = join(__dirname, "data");
const preferredDatabasePath = join(__dirname, "data", "strandspace.sqlite");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

let database = null;
let databasePath = "";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function toLatencyMs(value) {
  return Number(Math.max(Number(value) || 0, 0.001).toFixed(3));
}

function measureSync(task) {
  const started = performance.now();
  const result = task();
  return {
    result,
    latencyMs: toLatencyMs(performance.now() - started)
  };
}

function readSubjectspaceParams(source = null) {
  if (source instanceof URL) {
    return {
      question: String(source.searchParams.get("q") ?? "").trim(),
      subjectId: String(source.searchParams.get("subjectId") ?? source.searchParams.get("subject") ?? "").trim()
    };
  }

  return {
    question: String(source?.question ?? source?.q ?? "").trim(),
    subjectId: String(source?.subjectId ?? source?.subject ?? "").trim()
  };
}

function buildSubjectspaceAnswerPayload(recall, { question = "", subjectId = "" } = {}) {
  return {
    ok: true,
    source: recall.ready ? "strandspace" : "unresolved",
    question,
    subjectId: recall.matched?.subjectId ?? subjectId,
    answer: recall.answer,
    construct: recall.matched,
    recall
  };
}

function resolveSubjectspaceLabel(db, subjectId, recall, subjects = null) {
  const subjectList = Array.isArray(subjects) ? subjects : listSubjectSpaces(db);
  return recall?.matched?.subjectLabel
    ?? subjectList.find((item) => item.subjectId === subjectId)?.subjectLabel
    ?? "General Recall";
}

function normalizePromptText(value = "") {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function buildPromptMetrics(question = "") {
  const normalized = normalizePromptText(question);
  return {
    question: normalized,
    characterCount: normalized.length,
    wordCount: normalized ? normalized.split(/\s+/).length : 0,
    estimatedTokens: estimateTextTokens(normalized)
  };
}

function hasBuilderField(input = "", labels = []) {
  return labels.some((label) => new RegExp(`(^|\\n)\\s*${label}\\s*:`, "i").test(input));
}

function preserveBaseFieldsForExtension(baseConstruct = null, patch = {}, input = "") {
  if (!baseConstruct || typeof baseConstruct !== "object") {
    return patch;
  }

  const explicitSubject = hasBuilderField(input, ["subject", "subject label", "subject name"]);
  const explicitConstructLabel = hasBuilderField(input, ["construct", "construct label", "name", "title"]);
  const explicitTarget = hasBuilderField(input, ["target", "focus", "device", "topic"]);
  const explicitObjective = hasBuilderField(input, ["objective", "goal", "use case"]);

  return {
    ...patch,
    subjectId: String(baseConstruct.subjectId ?? patch.subjectId ?? "").trim() || patch.subjectId,
    subjectLabel: explicitSubject ? patch.subjectLabel : (baseConstruct.subjectLabel ?? patch.subjectLabel),
    constructLabel: explicitConstructLabel ? patch.constructLabel : (baseConstruct.constructLabel ?? patch.constructLabel),
    target: explicitTarget ? patch.target : (baseConstruct.target ?? patch.target),
    objective: explicitObjective ? patch.objective : (baseConstruct.objective ?? patch.objective)
  };
}

function normalizeUsageMetrics(usage = null) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens);
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens);

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : null
  };
}

function selectSubjectspaceBenchmarkPrompt(db, { question = "", subjectId = "", recall = null } = {}) {
  const original = buildPromptMetrics(question);
  const matched = recall?.matched ?? null;

  if (!matched) {
    return {
      question: original.question,
      original: {
        ...original,
        constructId: null,
        constructLabel: null
      },
      benchmark: {
        ...original,
        constructId: null,
        constructLabel: null,
        optimized: false,
        equivalentRecall: false,
        tokenSavings: 0,
        characterSavings: 0,
        selectionReason: "No stable local construct was available to shorten the benchmark prompt.",
        usedForTiming: true
      }
    };
  }

  let selectedQuestion = original.question;
  let selectedRecall = recall;
  let selectedMetrics = original;

  for (const candidateQuestion of buildSubjectBenchmarkQuestionCandidates(matched, recall?.parsed)) {
    const candidateMetrics = buildPromptMetrics(candidateQuestion);
    if (!candidateMetrics.question || candidateMetrics.question === original.question) {
      continue;
    }
    if (
      candidateMetrics.estimatedTokens >= original.estimatedTokens
      && candidateMetrics.characterCount >= original.characterCount
    ) {
      continue;
    }

    const candidateRecall = recallSubjectSpace(db, {
      question: candidateMetrics.question,
      subjectId
    });
    if (!candidateRecall.ready || candidateRecall.matched?.id !== matched.id) {
      continue;
    }

    if (
      candidateMetrics.estimatedTokens < selectedMetrics.estimatedTokens
      || (
        candidateMetrics.estimatedTokens === selectedMetrics.estimatedTokens
        && candidateMetrics.characterCount < selectedMetrics.characterCount
      )
    ) {
      selectedQuestion = candidateMetrics.question;
      selectedRecall = candidateRecall;
      selectedMetrics = candidateMetrics;
    }
  }

  const optimized = selectedQuestion !== original.question;

  return {
    question: selectedQuestion,
    original: {
      ...original,
      constructId: matched.id,
      constructLabel: matched.constructLabel
    },
    benchmark: {
      ...selectedMetrics,
      constructId: selectedRecall.matched?.id ?? matched.id,
      constructLabel: selectedRecall.matched?.constructLabel ?? matched.constructLabel,
      optimized,
      equivalentRecall: Boolean(selectedRecall.ready && selectedRecall.matched?.id === matched.id),
      tokenSavings: Math.max(original.estimatedTokens - selectedMetrics.estimatedTokens, 0),
      characterSavings: Math.max(original.characterCount - selectedMetrics.characterCount, 0),
      selectionReason: optimized
        ? "A shorter benchmark prompt recalled the same construct locally, so the timing run uses the compact version."
        : "No shorter prompt could recall the same construct locally, so the timing run stayed on the original question.",
      usedForTiming: true
    }
  };
}

function buildSubjectspaceBenchmark(localLatencyMs, llm = {}, prompts = null) {
  const promptNote = prompts?.benchmark?.tokenSavings > 0
    ? ` Compact benchmark prompt saved about ${prompts.benchmark.tokenSavings} estimated token${prompts.benchmark.tokenSavings === 1 ? "" : "s"}.`
    : "";

  if (!llm.enabled) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: null,
      summary: `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${llm.reason}${promptNote}`.trim()
    };
  }

  if (llm.error) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: Number.isFinite(llm.latencyMs) ? toLatencyMs(Math.abs(Number(llm.latencyMs) - localLatencyMs)) : null,
      summary: Number.isFinite(llm.latencyMs)
        ? `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM path failed after ${Number(llm.latencyMs).toFixed(3)} ms: ${llm.error}${promptNote}`
        : `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM benchmark failed: ${llm.error}${promptNote}`
    };
  }

  if (!Number.isFinite(llm.latencyMs)) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: null,
      summary: `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM benchmark failed${llm.error ? `: ${llm.error}` : "."}${promptNote}`.trim()
    };
  }

  const faster = localLatencyMs <= llm.latencyMs ? "strandbase" : "llm";
  const fasterLatency = faster === "strandbase" ? localLatencyMs : llm.latencyMs;
  const slowerLatency = faster === "strandbase" ? llm.latencyMs : localLatencyMs;
  const speedup = Number((slowerLatency / Math.max(fasterLatency, 0.001)).toFixed(1));
  const deltaMs = toLatencyMs(slowerLatency - fasterLatency);

  return {
    available: true,
    faster,
    speedup,
    deltaMs,
    summary: faster === "strandbase"
      ? `Strandbase recall was ${speedup}x faster than the LLM assist round-trip for this prompt.${promptNote}`
      : `The LLM assist round-trip was ${speedup}x faster than Strandbase recall for this prompt.${promptNote}`
  };
}

async function resolveDatabasePath() {
  if (databasePath) {
    return databasePath;
  }

  if (configuredDatabasePath) {
    databasePath = isAbsolute(configuredDatabasePath)
      ? configuredDatabasePath
      : join(__dirname, configuredDatabasePath);
    return databasePath;
  }

  try {
    await access(preferredDatabasePath);
    databasePath = preferredDatabasePath;
    return databasePath;
  } catch {
    // Fall through.
  }

  try {
    const entries = (await readdir(dataDir))
      .filter((name) => name.endsWith(".sqlite") && name !== "strandspace.sqlite")
      .sort((left, right) => {
        const leftLower = left.toLowerCase();
        const rightLower = right.toLowerCase();
        const leftPenalty = Number(/backup|copy|test|tmp/.test(leftLower));
        const rightPenalty = Number(/backup|copy|test|tmp/.test(rightLower));

        return leftPenalty - rightPenalty
          || left.length - right.length
          || left.localeCompare(right);
      });

    if (entries[0]) {
      databasePath = join(dataDir, entries[0]);
      return databasePath;
    }
  } catch {
    // Fall through to the preferred path.
  }

  databasePath = preferredDatabasePath;
  return databasePath;
}

function openMemoryDatabase() {
  if (database) {
    return database;
  }

  if (!databasePath) {
    throw new Error("Database path has not been resolved yet.");
  }

  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL;");
  ensureSoundspaceTables(database);
  seedSoundspace(database);
  ensureSubjectspaceTables(database);
  seedSubjectspace(database);
  return database;
}

async function readStaticFile(urlPath) {
  const cleaned =
    urlPath === "/"
      ? "/index.html"
      : (urlPath === "/soundspace" || urlPath === "/soundspace/" ? "/soundspace/index.html" : urlPath);
  const filePath = join(publicDir, cleaned.replace(/^\/+/, ""));

  if (!normalize(filePath).startsWith(normalize(publicDir))) {
    throw Object.assign(new Error("Invalid path"), { statusCode: 400 });
  }

  return readFile(filePath);
}

async function handleStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const resolvedPath =
    pathname === "/"
      ? "/index.html"
      : (pathname === "/soundspace" || pathname === "/soundspace/" ? "/soundspace/index.html" : pathname);
  const extension = extname(resolvedPath);

  try {
    const data = await readStaticFile(pathname);
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream"
    });
    res.end(data);
  } catch (error) {
    const statusCode = error?.code === "ENOENT" ? 404 : Number(error?.statusCode ?? 500);
    sendText(res, statusCode, statusCode === 404 ? "Not found" : "Internal server error");
  }
}

function soundConstructAnswerPayload(source, question, construct, recall) {
  return {
    ok: true,
    source,
    question,
    answer: recall.answer,
    construct,
    recall
  };
}

async function handleApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const db = openMemoryDatabase();

  if (url.pathname === "/api/subjectspace/subjects") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjects = listSubjectSpaces(db);
    const defaultSubjectId = subjects.find((item) => item.subjectId === "music-engineering")?.subjectId
      ?? subjects[0]?.subjectId
      ?? "";

    sendJson(res, 200, {
      ok: true,
      defaultSubjectId,
      subjects
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/library") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjectId = url.searchParams.get("subjectId") ?? url.searchParams.get("subject") ?? "";
    const constructs = listSubjectConstructs(db, subjectId);

    sendJson(res, 200, {
      ok: true,
      subjectId,
      count: constructs.length,
      constructs
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/assist/status") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, {
      ok: true,
      ...getOpenAiAssistStatus()
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/build") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const input = String(payload.input ?? payload.text ?? payload.sourceText ?? payload.notes ?? "").trim();
    const subjectId = String(payload.subjectId ?? payload.subject ?? "").trim();
    const baseConstruct = payload.baseConstruct && typeof payload.baseConstruct === "object"
      ? payload.baseConstruct
      : null;
    const subjects = listSubjectSpaces(db);
    const requestedSubjectLabel = String(payload.subjectLabel ?? payload.subjectLabelText ?? "").trim()
      || String(baseConstruct?.subjectLabel ?? "").trim()
      || subjects.find((item) => item.subjectId === subjectId)?.subjectLabel
      || "Custom Subject";

    if (!input) {
      sendJson(res, 400, { error: "input is required" });
      return;
    }

    const heuristicDraft = preserveBaseFieldsForExtension(baseConstruct, buildSubjectConstructDraftFromInput(input, {
      subjectId,
      subjectLabel: requestedSubjectLabel
    }), input);
    const mergeMode = baseConstruct ? "extend" : "draft";
    const heuristicConstruct = baseConstruct
      ? mergeSubjectConstruct(baseConstruct, heuristicDraft, {
        preserveId: true,
        provenance: {
          ...(heuristicDraft.provenance ?? {}),
          source: "builder-heuristic-merge"
        }
      })
      : heuristicDraft;
    const config = getOpenAiAssistStatus();
    let source = "heuristic";
    let assist = null;
    let responseId = null;
    let warning = "";
    let suggestedConstruct = heuristicConstruct;

    if (payload.preferApi !== false && config.enabled) {
      try {
        const assistResult = await generateOpenAiSubjectConstructBuilder({
          input,
          subjectId: heuristicConstruct.subjectId,
          subjectLabel: heuristicConstruct.subjectLabel,
          seedDraft: heuristicConstruct
        });
        const apiConstruct = buildSuggestedConstructFromAssist({
          subjectId: heuristicConstruct.subjectId,
          subjectLabel: heuristicConstruct.subjectLabel,
          assist: assistResult.assist,
          question: input,
          routingMode: "builder"
        });

        suggestedConstruct = mergeSubjectConstruct(heuristicConstruct, preserveBaseFieldsForExtension(baseConstruct, apiConstruct, input), {
          preserveId: true,
          provenance: {
            ...(apiConstruct.provenance ?? {}),
            source: mergeMode === "extend" ? "builder-openai-merge" : "builder-openai"
          }
        });
        source = "openai";
        assist = assistResult.assist;
        responseId = assistResult.responseId;
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
    }

    sendJson(res, 200, {
      ok: true,
      source,
      input,
      mergeMode,
      warning,
      promptMetrics: buildPromptMetrics(input),
      config,
      heuristicConstruct,
      assist,
      suggestedConstruct,
      responseId
    });
    return;
  }

  if (url.pathname === "/api/subjectspace" || url.pathname === "/api/subjectspace/recall") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(url);
    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });

    sendJson(res, 200, buildSubjectspaceAnswerPayload(recall, { question, subjectId }));
    return;
  }

  if (url.pathname === "/api/subjectspace/learn") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const subjectLabel = String(payload.subjectLabel ?? payload.subject ?? "").trim();
    const constructLabel = String(payload.constructLabel ?? payload.name ?? "").trim();

    if (!subjectLabel) {
      sendJson(res, 400, { error: "subjectLabel is required" });
      return;
    }

    if (!constructLabel && !String(payload.target ?? "").trim()) {
      sendJson(res, 400, { error: "constructLabel or target is required" });
      return;
    }

    const saved = upsertSubjectConstruct(db, {
      ...payload,
      provenance: {
        source: payload.provenance?.source ?? "manual",
        learnedFromQuestion: payload.provenance?.learnedFromQuestion ?? payload.question ?? null
      }
    });

    sendJson(res, 200, {
      ok: true,
      construct: saved,
      subjects: listSubjectSpaces(db),
      count: listSubjectConstructs(db, saved.subjectId).length
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/assist") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const config = getOpenAiAssistStatus();
    if (!config.enabled) {
      sendJson(res, 503, {
        error: config.reason,
        config
      });
      return;
    }

    const subjects = listSubjectSpaces(db);
    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall, subjects);

    let assistResult;
    try {
      assistResult = await generateOpenAiSubjectAssist({
        question,
        subjectId,
        subjectLabel,
        recall
      });
    } catch (error) {
      sendJson(res, 502, {
        error: error instanceof Error ? error.message : String(error),
        config,
        recall
      });
      return;
    }

    const suggestedConstruct = buildSuggestedConstructFromAssist({
      subjectId: subjectId || recall.matched?.subjectId || undefined,
      subjectLabel,
      assist: assistResult.assist,
      question,
      routingMode: recall.routing?.mode ?? ""
    });

    let savedConstruct = null;
    if (payload.save === true) {
      savedConstruct = upsertSubjectConstruct(db, suggestedConstruct);
    }

    sendJson(res, 200, {
      ok: true,
      source: "openai",
      config: {
        ...config,
        model: assistResult.model ?? config.model
      },
      recall,
      assist: assistResult.assist,
      suggestedConstruct,
      savedConstruct,
      responseId: assistResult.responseId
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/compare") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const subjects = listSubjectSpaces(db);
    const originalLocal = measureSync(() => recallSubjectSpace(db, {
      question,
      subjectId
    }));
    const prompts = selectSubjectspaceBenchmarkPrompt(db, {
      question,
      subjectId,
      recall: originalLocal.result
    });
    const benchmarkQuestion = prompts.question || question;
    const local = prompts.benchmark.optimized
      ? measureSync(() => recallSubjectSpace(db, {
        question: benchmarkQuestion,
        subjectId
      }))
      : originalLocal;
    const recall = local.result;
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall, subjects);
    const config = getOpenAiAssistStatus();
    let llm = {
      label: "LLM assist round-trip",
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      mode: "assist_round_trip",
      question: benchmarkQuestion,
      latencyMs: null,
      apiAction: null,
      constructLabel: null,
      promptTokens: prompts.benchmark.estimatedTokens,
      promptTokenSource: "estimate",
      outputTokens: null,
      totalTokens: null,
      reason: config.reason,
      error: null
    };

    if (config.enabled) {
      const started = performance.now();
      try {
        const assistResult = await generateOpenAiSubjectAssist({
          question: benchmarkQuestion,
          subjectId,
          subjectLabel,
          recall
        });
        const usage = normalizeUsageMetrics(assistResult.usage);

        llm = {
          ...llm,
          model: assistResult.model ?? llm.model,
          latencyMs: toLatencyMs(performance.now() - started),
          apiAction: assistResult.assist?.apiAction ?? null,
          constructLabel: assistResult.assist?.constructLabel ?? null,
          promptTokens: usage?.inputTokens ?? llm.promptTokens,
          promptTokenSource: usage?.inputTokens ? "usage" : llm.promptTokenSource,
          outputTokens: usage?.outputTokens ?? null,
          totalTokens: usage?.totalTokens ?? null
        };
      } catch (error) {
        llm = {
          ...llm,
          latencyMs: toLatencyMs(performance.now() - started),
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    sendJson(res, 200, {
      ok: true,
      question,
      subjectLabel,
      subjectId: recall.matched?.subjectId ?? subjectId,
      prompts,
      local: {
        label: "Strandbase recall",
        question: benchmarkQuestion,
        latencyMs: local.latencyMs,
        ready: recall.ready,
        route: recall.routing?.mode ?? null,
        confidence: Number(recall.readiness?.confidence ?? 0),
        candidateCount: Number(recall.candidates?.length ?? 0),
        constructLabel: recall.matched?.constructLabel ?? null
      },
      llm,
      comparison: buildSubjectspaceBenchmark(local.latencyMs, llm, prompts),
      recall
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/answer") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });

    sendJson(res, 200, buildSubjectspaceAnswerPayload(recall, { question, subjectId }));
    return;
  }

  if (url.pathname === "/api/soundspace" || url.pathname === "/api/soundspace/recall") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const question = String(url.searchParams.get("q") ?? "").trim();
    const recall = recallSoundspace(db, question);

    sendJson(res, 200, {
      ok: true,
      ...recall,
      libraryCount: listSoundConstructs(db).length
    });
    return;
  }

  if (url.pathname === "/api/soundspace/library") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const constructs = listSoundConstructs(db);
    sendJson(res, 200, {
      ok: true,
      count: constructs.length,
      constructs
    });
    return;
  }

  if (url.pathname === "/api/soundspace/learn") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const saved = upsertSoundConstruct(db, {
      ...payload,
      provenance: {
        source: payload.provenance?.source ?? "manual-or-llm",
        learnedFromQuestion: payload.provenance?.learnedFromQuestion ?? payload.question ?? null
      }
    });

    sendJson(res, 200, {
      ok: true,
      construct: saved,
      count: listSoundConstructs(db).length
    });
    return;
  }

  if (url.pathname === "/api/soundspace/answer") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const question = String(payload.question ?? payload.q ?? "").trim();
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const recalled = recallSoundspace(db, question);
    if (!payload.forceGenerate && recalled.ready && recalled.matched) {
      sendJson(res, 200, soundConstructAnswerPayload("strandspace", question, recalled.matched, recalled));
      return;
    }

    let generated;
    try {
      generated = buildSoundConstructFromQuestion(question, {
        provider: payload.provider ?? "heuristic-llm",
        model: payload.model ?? "soundspace-template-v1"
      });
    } catch (error) {
      sendJson(res, 422, {
        error: error instanceof Error ? error.message : String(error),
        recall: recalled
      });
      return;
    }

    const saved = upsertSoundConstruct(db, generated);
    const refreshed = recallSoundspace(db, question);
    sendJson(res, 200, soundConstructAnswerPayload("generated-and-stored", question, saved, refreshed));
    return;
  }

  sendText(res, 404, "Not found");
}

export async function createApp() {
  await resolveDatabasePath();
  openMemoryDatabase();

  return http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendText(res, 400, "Missing request URL");
        return;
      }

      const url = new URL(req.url, "http://localhost");

      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res);
        return;
      }

      if (req.method === "GET") {
        await handleStatic(req, res);
        return;
      }

      res.writeHead(405, {
        Allow: "GET",
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end("Method not allowed");
    } catch (error) {
      sendJson(res, 500, {
        error: "Internal server error",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await createApp();

  server.listen(port, () => {
    console.log(`Strandspace Studio running at http://localhost:${port}`);
  });
}
