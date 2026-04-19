import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basename, dirname, extname, isAbsolute, join, normalize } from "node:path";
import { readdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import {
  ensureSoundspaceTables,
  listSoundConstructs,
  recallSoundspace,
  seedSoundspace,
  summarizeSoundConstruct,
  upsertSoundConstruct
} from "./strandspace/soundspace.js";
import { buildSoundConstructFromQuestion } from "./strandspace/sound-llm.js";
import {
  auditSubjectDataset,
  auditSubjectSeedFile,
  buildConstructRelevanceSummary,
  buildSubjectBenchmarkQuestionCandidates,
  buildSubjectConstructDraftFromInput,
  defaultSubjectSeedsPath,
  estimateTextTokens,
  ensureSubjectspaceTables,
  getSubjectConstruct,
  ingestConversationToConstructs,
  listConstructLinks,
  listConstructStrands,
  mergeSubjectConstruct,
  listStrandBinders,
  listSubjectConstructs,
  listSubjectStrands,
  listSubjectSpaces,
  recallSubjectSpace,
  releaseSubjectSeedsPath,
  refreshSubjectConstructRelations,
  cleanSubjectDataset,
  seedSubjectspace,
  upsertSubjectConstruct
} from "./strandspace/subjectspace.js";
// === OPENAI ASSIST (uses OPENAI_API_KEY env var) ===
import {
  buildSuggestedConstructFromAssist,
  generateOpenAiSoundConstructBuilder,
  generateOpenAiSubjectAssist,
  generateOpenAiSubjectConstructBuilder,
  generateOpenAiSubjectSuggestions,
  getOpenAiAssistStatus
} from "./strandspace/openai-assist.js";
import {
  assertLocalhostRequest,
  getThreatModel,
  isRemoteAccessAllowed
} from "./server/security.mjs";
import {
  migrateLegacyDatabase,
  resolveDatabasePath
} from "./server/persistence.mjs";
export { migrateLegacyDatabase } from "./server/persistence.mjs";
export { sanitizeLegacyProvenance } from "./server/persistence.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const docsDir = join(__dirname, "docs");
const docFileExtensions = new Set([".pdf", ".docx", ".patch", ".txt", ".md"]);
const builderReferenceStopwords = new Set([
  "a",
  "an",
  "and",
  "build",
  "checks",
  "construct",
  "for",
  "from",
  "handheld",
  "in",
  "microphone",
  "new",
  "of",
  "scene",
  "settings",
  "starting",
  "the",
  "trim",
  "use",
  "with"
]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".patch": "text/x-diff; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

const DEFAULT_API_TIMEOUT_MS = 15000;
const EXTENDED_API_TIMEOUT_MS = 22000;
const LOCAL_MODEL_API_TIMEOUT_MS = 65000;
const DEFAULT_MODEL_LAB_OPENAI_TIMEOUT_MS = 45000;
const SHUTDOWN_GRACE_MS = 10000;
const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
const API_TIMEOUTS_MS = new Map([
  ["/api/backend/overview", DEFAULT_API_TIMEOUT_MS],
  ["/api/backend/db/tables", DEFAULT_API_TIMEOUT_MS],
  ["/api/backend/db/table", DEFAULT_API_TIMEOUT_MS],
  ["/api/backend/db/row", DEFAULT_API_TIMEOUT_MS],
  ["/api/chat", LOCAL_MODEL_API_TIMEOUT_MS],
  ["/api/chat/conversations", DEFAULT_API_TIMEOUT_MS],
  ["/api/chat/history", DEFAULT_API_TIMEOUT_MS],
  ["/api/chat/delete", DEFAULT_API_TIMEOUT_MS],
  ["/api/model-lab/status", DEFAULT_API_TIMEOUT_MS],
  ["/api/model-lab/generate", LOCAL_MODEL_API_TIMEOUT_MS],
  ["/api/model-lab/compare", LOCAL_MODEL_API_TIMEOUT_MS],
  ["/api/model-lab/reports", DEFAULT_API_TIMEOUT_MS],
  ["/api/tts", EXTENDED_API_TIMEOUT_MS],
  ["/api/stats", DEFAULT_API_TIMEOUT_MS],
  ["/api/subjectspace/subject-ideas", EXTENDED_API_TIMEOUT_MS],
  ["/api/subjectspace/build", EXTENDED_API_TIMEOUT_MS],
  ["/api/subjectspace/dataset/health", DEFAULT_API_TIMEOUT_MS],
  ["/api/subjectspace/dataset/clean", EXTENDED_API_TIMEOUT_MS],
  ["/api/subjectspace/ingest-conversation", EXTENDED_API_TIMEOUT_MS],
  ["/api/subjectspace/assist", EXTENDED_API_TIMEOUT_MS],
  ["/api/subjectspace/compare", EXTENDED_API_TIMEOUT_MS],
  ["/api/subjectspace/answer", DEFAULT_API_TIMEOUT_MS],
  ["/api/subjectspace/recall", DEFAULT_API_TIMEOUT_MS],
  ["/api/soundspace/answer", EXTENDED_API_TIMEOUT_MS],
  ["/api/soundspace/recall", DEFAULT_API_TIMEOUT_MS],
  ["/api/soundspace", DEFAULT_API_TIMEOUT_MS]
]);

let database = null;
let databasePath = "";
let shutdownRegistered = false;
let shutdownInProgress = false;
const appStartedAt = Date.now();
const configuredLogLevel = String(process.env.STRANDSPACE_LOG_LEVEL ?? process.env.LOG_LEVEL ?? "info").trim().toLowerCase();
const activeLogLevel = Object.hasOwn(LOG_LEVELS, configuredLogLevel) ? configuredLogLevel : "info";
const BACKEND_TABLES = {
  subject_constructs: {
    label: "Subject Constructs",
    primaryKey: "id",
    editableColumns: [
      "subjectId",
      "subjectLabel",
      "constructLabel",
      "target",
      "objective",
      "contextJson",
      "stepsJson",
      "notes",
      "tagsJson",
      "strandsJson",
      "provenanceJson",
      "relatedConstructIdsJson",
      "learnedCount"
    ],
    searchColumns: [
      "subjectId",
      "subjectLabel",
      "constructLabel",
      "target",
      "objective",
      "notes",
      "tagsJson",
      "strandsJson",
      "relatedConstructIdsJson"
    ],
    orderBy: "updatedAt DESC, constructLabel ASC"
  },
  sound_constructs: {
    label: "Sound Constructs",
    primaryKey: "id",
    editableColumns: [
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
      "setupJson",
      "tagsJson",
      "strandsJson",
      "llmSummary",
      "provenanceJson",
      "learnedCount"
    ],
    searchColumns: [
      "name",
      "deviceBrand",
      "deviceModel",
      "deviceType",
      "sourceType",
      "sourceBrand",
      "sourceModel",
      "goal",
      "venueSize",
      "eventType",
      "speakerConfig",
      "tagsJson",
      "strandsJson"
    ],
    orderBy: "updatedAt DESC, name ASC"
  },
  strand_binders: {
    label: "Strand Binders",
    primaryKey: "id",
    editableColumns: [
      "subjectId",
      "leftTerm",
      "rightTerm",
      "weight",
      "reason",
      "source"
    ],
    searchColumns: [
      "subjectId",
      "leftTerm",
      "rightTerm",
      "reason",
      "source"
    ],
    orderBy: "updatedAt DESC, ABS(weight) DESC"
  },
  construct_links: {
    label: "Construct Links",
    primaryKey: "id",
    editableColumns: [],
    searchColumns: [
      "sourceConstructId",
      "relatedConstructId",
      "reason",
      "detailJson"
    ],
    orderBy: "updatedAt DESC, score DESC"
  },
  subject_strands: {
    label: "Subject Strands",
    primaryKey: "id",
    editableColumns: [
      "subjectId",
      "strandKey",
      "label",
      "normalizedLabel",
      "layer",
      "role",
      "weight",
      "confidence",
      "source",
      "usageCount",
      "constructCount",
      "lastUsedAt",
      "provenanceJson"
    ],
    searchColumns: [
      "subjectId",
      "strandKey",
      "label",
      "normalizedLabel",
      "layer",
      "role",
      "source"
    ],
    orderBy: "subjectId ASC, usageCount DESC, constructCount DESC, updatedAt DESC"
  },
  construct_strands: {
    label: "Construct Strand Membership",
    primaryKey: "id",
    editableColumns: [
      "constructId",
      "subjectId",
      "strandId",
      "strandKey",
      "layer",
      "role",
      "weight",
      "source"
    ],
    searchColumns: [
      "constructId",
      "subjectId",
      "strandId",
      "strandKey",
      "layer",
      "role",
      "source"
    ],
    orderBy: "updatedAt DESC, weight DESC"
  },
  chat_conversations: {
    label: "Chat Conversations",
    primaryKey: "id",
    editableColumns: [
      "subjectId",
      "title",
      "metadataJson"
    ],
    searchColumns: [
      "id",
      "subjectId",
      "title",
      "metadataJson"
    ],
    orderBy: "lastMessageAt DESC"
  },
  chat_messages: {
    label: "Chat Messages",
    primaryKey: "id",
    editableColumns: [],
    searchColumns: [
      "conversationId",
      "role",
      "content",
      "subjectId",
      "constructId",
      "metadataJson"
    ],
    orderBy: "createdAt DESC"
  },
  benchmark_reports: {
    label: "Benchmark Reports",
    primaryKey: "id",
    editableColumns: [],
    searchColumns: [
      "subjectId",
      "subjectLabel",
      "testLabel",
      "provider",
      "providerLabel",
      "model",
      "question",
      "benchmarkQuestion",
      "summary"
    ],
    orderBy: "createdAt DESC"
  }
};

function shouldLog(level = "info") {
  const normalizedLevel = String(level ?? "info").trim().toLowerCase();
  return (LOG_LEVELS[normalizedLevel] ?? LOG_LEVELS.info) >= LOG_LEVELS[activeLogLevel];
}

function logEvent(level = "info", message = "", details = null) {
  if (!shouldLog(level)) {
    return;
  }

  const normalizedLevel = String(level ?? "info").trim().toUpperCase() || "INFO";
  const timestamp = new Date().toISOString();
  const logger = normalizedLevel === "WARN" || normalizedLevel === "ERROR" ? console.error : console.log;

  if (details && typeof details === "object" && Object.keys(details).length) {
    logger(`[${timestamp}] [${normalizedLevel}] ${message}`, details);
    return;
  }

  logger(`[${timestamp}] [${normalizedLevel}] ${message}`);
}

function getApiRouteTimeoutMs(pathname = "") {
  return API_TIMEOUTS_MS.get(String(pathname ?? "").trim()) ?? DEFAULT_API_TIMEOUT_MS;
}

function buildApiTimeoutPayload(pathname = "", timeoutMs = DEFAULT_API_TIMEOUT_MS) {
  return {
    ok: false,
    code: "REQUEST_TIMEOUT",
    error: `The request to ${pathname || "this route"} timed out after ${timeoutMs}ms.`,
    route: pathname,
    timeoutMs
  };
}

function buildApiErrorPayload(error, fallback = "Internal server error") {
  const statusCode = Number(error?.statusCode ?? error?.status ?? 500) || 500;
  const payload = error?.payload && typeof error.payload === "object"
    ? {
      ok: false,
      ...error.payload
    }
    : {
      ok: false,
      code: String(error?.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED")),
      error: error instanceof Error ? error.message : String(error ?? fallback)
    };

  return {
    statusCode,
    payload
  };
}

function buildSystemHealthPayload() {
  const assistStatus = getOpenAiAssistStatus();
  return {
    ok: true,
    mode: assistStatus.enabled ? "assist-enabled" : "local-only",
    uptimeMs: Date.now() - appStartedAt,
    logLevel: activeLogLevel,
    database: {
      connected: Boolean(database),
      path: databasePath
    },
    openai: {
      enabled: Boolean(assistStatus.enabled),
      model: assistStatus.model ?? "",
      timeoutMs: assistStatus.timeoutMs ?? null,
      reason: assistStatus.reason ?? ""
    },
    remoteAllowed: isRemoteAccessAllowed()
  };
}

function ensureBenchmarkTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS benchmark_reports (
      id TEXT PRIMARY KEY,
      subjectId TEXT,
      subjectLabel TEXT,
      testLabel TEXT,
      provider TEXT NOT NULL,
      providerLabel TEXT,
      model TEXT,
      mode TEXT NOT NULL DEFAULT 'compare',
      grounded INTEGER NOT NULL DEFAULT 0,
      promptMode TEXT,
      question TEXT,
      benchmarkQuestion TEXT,
      localConstructLabel TEXT,
      llmConstructLabel TEXT,
      localLatencyMs REAL,
      llmLatencyMs REAL,
      deltaMs REAL,
      speedup REAL,
      comparisonAvailable INTEGER NOT NULL DEFAULT 0,
      faster TEXT,
      summary TEXT,
      promptsJson TEXT,
      localJson TEXT,
      llmJson TEXT,
      comparisonJson TEXT,
      debugJson TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_benchmark_reports_created ON benchmark_reports(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_benchmark_reports_provider_model ON benchmark_reports(provider, model, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_benchmark_reports_subject ON benchmark_reports(subjectId, createdAt DESC);
  `);
}

function buildBenchmarkReportId() {
  return `bench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeJsonParse(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeBenchmarkTestLabel(value = "", fallback = "Manual benchmark") {
  const label = String(value ?? "").trim();
  return label || fallback;
}

function persistBenchmarkReport(db, payload = {}) {
  ensureBenchmarkTables(db);
  const createdAt = new Date().toISOString();
  const prompts = payload.prompts ?? {};
  const local = payload.local ?? {};
  const llm = payload.llm ?? {};
  const comparison = payload.comparison ?? {};
  const debug = payload.debug ?? null;

  db.prepare(`
    INSERT INTO benchmark_reports (
      id, subjectId, subjectLabel, testLabel, provider, providerLabel, model, mode, grounded, promptMode,
      question, benchmarkQuestion, localConstructLabel, llmConstructLabel, localLatencyMs, llmLatencyMs,
      deltaMs, speedup, comparisonAvailable, faster, summary, promptsJson, localJson, llmJson,
      comparisonJson, debugJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    buildBenchmarkReportId(),
    String(payload.subjectId ?? "").trim() || null,
    String(payload.subjectLabel ?? "").trim() || null,
    normalizeBenchmarkTestLabel(payload.testLabel, "Manual benchmark"),
    String(payload.provider ?? "").trim() || "unknown",
    String(llm.providerLabel ?? payload.providerLabel ?? "").trim() || null,
    String(llm.model ?? payload.model ?? "").trim() || null,
    String(payload.mode ?? "compare").trim() || "compare",
    payload.grounded ? 1 : 0,
    String(debug?.promptMode ?? payload.promptMode ?? "").trim() || null,
    String(payload.question ?? "").trim() || null,
    String(prompts?.benchmark?.question ?? payload.question ?? "").trim() || null,
    String(local.constructLabel ?? "").trim() || null,
    String(llm.constructLabel ?? "").trim() || null,
    Number.isFinite(Number(local.latencyMs)) ? Number(local.latencyMs) : null,
    Number.isFinite(Number(llm.latencyMs)) ? Number(llm.latencyMs) : null,
    Number.isFinite(Number(comparison.deltaMs)) ? Number(comparison.deltaMs) : null,
    Number.isFinite(Number(comparison.speedup)) ? Number(comparison.speedup) : null,
    comparison.available ? 1 : 0,
    String(comparison.faster ?? "").trim() || null,
    String(comparison.summary ?? "").trim() || null,
    JSON.stringify(prompts ?? {}),
    JSON.stringify(local ?? {}),
    JSON.stringify(llm ?? {}),
    JSON.stringify(comparison ?? {}),
    debug ? JSON.stringify(debug) : null,
    createdAt
  );
}

function buildBenchmarkReportsPayload(db, options = {}) {
  ensureBenchmarkTables(db);
  const recentLimit = Math.max(1, Math.min(Number(options.recentLimit ?? 10) || 10, 25));
  const summaryLimit = Math.max(1, Math.min(Number(options.summaryLimit ?? 8) || 8, 20));
  const recent = db.prepare(`
    SELECT * FROM benchmark_reports
    ORDER BY createdAt DESC
    LIMIT ?
  `).all(recentLimit).map((row) => ({
    id: row.id,
    subjectId: row.subjectId || "",
    subjectLabel: row.subjectLabel || "",
    testLabel: row.testLabel || "Manual benchmark",
    provider: row.provider || "",
    providerLabel: row.providerLabel || row.provider || "Provider",
    model: row.model || "",
    mode: row.mode || "compare",
    grounded: Boolean(row.grounded),
    promptMode: row.promptMode || "",
    question: row.question || "",
    benchmarkQuestion: row.benchmarkQuestion || "",
    localConstructLabel: row.localConstructLabel || "",
    llmConstructLabel: row.llmConstructLabel || "",
    localLatencyMs: Number.isFinite(Number(row.localLatencyMs)) ? Number(row.localLatencyMs) : null,
    llmLatencyMs: Number.isFinite(Number(row.llmLatencyMs)) ? Number(row.llmLatencyMs) : null,
    deltaMs: Number.isFinite(Number(row.deltaMs)) ? Number(row.deltaMs) : null,
    speedup: Number.isFinite(Number(row.speedup)) ? Number(row.speedup) : null,
    comparisonAvailable: Boolean(row.comparisonAvailable),
    faster: row.faster || "",
    summary: row.summary || "",
    prompts: safeJsonParse(row.promptsJson, {}),
    local: safeJsonParse(row.localJson, {}),
    llm: safeJsonParse(row.llmJson, {}),
    comparison: safeJsonParse(row.comparisonJson, {}),
    debug: safeJsonParse(row.debugJson, null),
    createdAt: row.createdAt
  }));
  const summaryByModel = db.prepare(`
    SELECT
      provider,
      providerLabel,
      model,
      COUNT(*) as runCount,
      AVG(localLatencyMs) as averageLocalLatencyMs,
      AVG(llmLatencyMs) as averageLlmLatencyMs,
      AVG(CASE WHEN comparisonAvailable = 1 THEN speedup END) as averageSpeedup,
      MAX(createdAt) as lastRunAt
    FROM benchmark_reports
    GROUP BY provider, providerLabel, model
    ORDER BY runCount DESC, lastRunAt DESC
    LIMIT ?
  `).all(summaryLimit).map((row) => ({
    provider: row.provider || "",
    providerLabel: row.providerLabel || row.provider || "Provider",
    model: row.model || "",
    runCount: Number(row.runCount ?? 0),
    averageLocalLatencyMs: Number.isFinite(Number(row.averageLocalLatencyMs)) ? Number(row.averageLocalLatencyMs) : null,
    averageLlmLatencyMs: Number.isFinite(Number(row.averageLlmLatencyMs)) ? Number(row.averageLlmLatencyMs) : null,
    averageSpeedup: Number.isFinite(Number(row.averageSpeedup)) ? Number(Number(row.averageSpeedup).toFixed(1)) : null,
    lastRunAt: row.lastRunAt || null
  }));
  const counts = db.prepare(`
    SELECT
      COUNT(*) as totalRuns,
      COUNT(DISTINCT provider || ':' || IFNULL(model, '')) as providerModelCount,
      COUNT(DISTINCT subjectId) as subjectCount
    FROM benchmark_reports
  `).get();

  return {
    totalRuns: Number(counts?.totalRuns ?? 0),
    providerModelCount: Number(counts?.providerModelCount ?? 0),
    subjectCount: Number(counts?.subjectCount ?? 0),
    recent,
    summaryByModel,
    debugEntries: recent
      .map((item) => item.debug)
      .filter((entry) => entry && typeof entry === "object")
  };
}

function selectSoundspaceBaseConstruct(recall = {}) {
  if (recall?.combined?.matches?.length) {
    const primaryCombined = recall.combined.matches.find((match) => String(match.deviceType ?? "").includes("mixer"))
      ?? recall.combined.matches[0];

    if (primaryCombined) {
      return listSoundConstructs(openMemoryDatabase()).find((construct) => construct.id === primaryCombined.id)
        ?? recall.matched
        ?? primaryCombined;
    }
  }

  return recall?.matched ?? null;
}

function beginApiRequest(req, res, pathname = "") {
  const started = performance.now();
  const timeoutMs = getApiRouteTimeoutMs(pathname);
  let finished = false;
  let timedOut = false;
  const timer = setTimeout(() => {
    if (finished || res.writableEnded) {
      return;
    }

    timedOut = true;
    sendJson(res, 504, buildApiTimeoutPayload(pathname, timeoutMs));
    logEvent("warn", "API route timed out", {
      route: pathname,
      timeoutMs
    });
  }, timeoutMs);

  timer.unref?.();

  req.on("aborted", () => {
    if (!finished) {
      logEvent("warn", "API request aborted by client", {
        route: pathname
      });
    }
  });

  function complete() {
    finished = true;
    clearTimeout(timer);
  }

  return {
    pathname,
    timeoutMs,
    get timedOut() {
      return timedOut;
    },
    get elapsedMs() {
      return toLatencyMs(performance.now() - started);
    },
    complete
  };
}

async function runTimed(label, task, meta = {}) {
  const started = performance.now();
  try {
    const result = await task();
    logEvent("info", `${label} completed`, {
      ...meta,
      latencyMs: toLatencyMs(performance.now() - started)
    });
    return result;
  } catch (error) {
    logEvent("warn", `${label} failed`, {
      ...meta,
      latencyMs: toLatencyMs(performance.now() - started),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function countConstructs(db) {
  ensureSubjectspaceTables(db);
  ensureSoundspaceTables(db);
  ensureBenchmarkTables(db);

  const subjectCount = Number(db.prepare("SELECT COUNT(*) as count FROM subject_constructs").get().count ?? 0);
  const soundCount = Number(db.prepare("SELECT COUNT(*) as count FROM sound_constructs").get().count ?? 0);
  const binderCount = Number(db.prepare("SELECT COUNT(*) as count FROM strand_binders").get().count ?? 0);
  const constructLinkCount = Number(db.prepare("SELECT COUNT(*) as count FROM construct_links").get().count ?? 0);
  const subjectStrandCount = Number(db.prepare("SELECT COUNT(*) as count FROM subject_strands").get().count ?? 0);
  const constructStrandCount = Number(db.prepare("SELECT COUNT(*) as count FROM construct_strands").get().count ?? 0);
  const conversationCount = Number(db.prepare("SELECT COUNT(*) as count FROM chat_conversations").get().count ?? 0);
  const chatMessageCount = Number(db.prepare("SELECT COUNT(*) as count FROM chat_messages").get().count ?? 0);
  const benchmarkReportCount = Number(db.prepare("SELECT COUNT(*) as count FROM benchmark_reports").get().count ?? 0);

  return {
    subjectCount,
    soundCount,
    binderCount,
    constructLinkCount,
    subjectStrandCount,
    constructStrandCount,
    conversationCount,
    chatMessageCount,
    benchmarkReportCount
  };
}

function quoteSqlIdentifier(value = "") {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw Object.assign(new Error("Invalid SQL identifier"), {
      statusCode: 400,
      payload: {
        code: "INVALID_IDENTIFIER",
        error: `The identifier "${normalized}" is not allowed.`
      }
    });
  }

  return `"${normalized}"`;
}

function getBackendTableConfig(tableName = "") {
  const normalized = String(tableName ?? "").trim();
  const config = BACKEND_TABLES[normalized] ?? null;

  if (!config) {
    throw Object.assign(new Error(`Unknown table: ${normalized}`), {
      statusCode: 404,
      payload: {
        code: "UNKNOWN_TABLE",
        error: `The table "${normalized}" is not available in the Strandspace backend.`
      }
    });
  }

  return {
    name: normalized,
    ...config
  };
}

function readBackendTableColumns(db, tableName = "") {
  const safeTableName = quoteSqlIdentifier(tableName);
  return db.prepare(`PRAGMA table_info(${safeTableName})`).all().map((column) => ({
    cid: Number(column.cid ?? 0),
    name: String(column.name ?? ""),
    type: String(column.type ?? ""),
    notNull: Boolean(column.notnull),
    defaultValue: column.dflt_value ?? null,
    primaryKey: Number(column.pk ?? 0) > 0
  }));
}

function buildBackendRowMeta(tableName = "", row = null) {
  if (!row || typeof row !== "object") {
    return {
      editable: false,
      reason: "Row data is unavailable."
    };
  }

  if (tableName === "subject_constructs" && /^sound-/.test(String(row.id ?? ""))) {
    return {
      editable: false,
      reason: "This row mirrors a Soundspace construct. Edit it from sound_constructs so both memories stay in sync."
    };
  }

  return {
    editable: true,
    reason: ""
  };
}

function normalizeBackendSearchValue(value = "") {
  return String(value ?? "").trim();
}

function coerceBackendValueByColumn(column = {}, value = "") {
  const columnType = String(column.type ?? "").trim().toUpperCase();

  if (value === "" && !column.notNull) {
    return null;
  }

  if (column.name.endsWith("Json")) {
    if (value === "") {
      return column.notNull ? (column.name.includes("steps") || column.name.includes("tags") || column.name.includes("strands") ? "[]" : "{}") : null;
    }

    try {
      JSON.parse(String(value));
    } catch {
      throw Object.assign(new Error(`"${column.name}" must contain valid JSON.`), {
        statusCode: 400,
        payload: {
          code: "INVALID_JSON_FIELD",
          error: `"${column.name}" must contain valid JSON before it can be saved.`
        }
      });
    }
  }

  if (columnType.includes("INT")) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw Object.assign(new Error(`"${column.name}" must be a valid number.`), {
        statusCode: 400,
        payload: {
          code: "INVALID_NUMERIC_FIELD",
          error: `"${column.name}" must be a valid number before it can be saved.`
        }
      });
    }
    return Math.round(parsed);
  }

  return String(value ?? "");
}

function listBackendTableSummaries(db) {
  return Object.entries(BACKEND_TABLES).map(([name, config]) => {
    const safeTableName = quoteSqlIdentifier(name);
    const rowCount = Number(db.prepare(`SELECT COUNT(*) as count FROM ${safeTableName}`).get().count ?? 0);

    return {
      name,
      label: config.label,
      rowCount,
      primaryKey: config.primaryKey
    };
  });
}

function readBackendTable(db, tableName = "", options = {}) {
  const config = getBackendTableConfig(tableName);
  const columns = readBackendTableColumns(db, config.name);
  const safeTableName = quoteSqlIdentifier(config.name);
  const limit = Math.max(1, Math.min(Number(options.limit ?? 15) || 15, 50));
  const offset = Math.max(0, Number(options.offset ?? 0) || 0);
  const search = normalizeBackendSearchValue(options.search);
  const searchableColumns = config.searchColumns.filter((columnName) => columns.some((column) => column.name === columnName));
  const whereClauses = [];
  const params = [];

  if (search && searchableColumns.length) {
    for (const columnName of searchableColumns) {
      whereClauses.push(`${quoteSqlIdentifier(columnName)} LIKE ?`);
      params.push(`%${search}%`);
    }
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" OR ")}` : "";
  const total = Number(
    db.prepare(`SELECT COUNT(*) as count FROM ${safeTableName} ${whereSql}`)
      .get(...params).count ?? 0
  );
  const rows = db.prepare(`
    SELECT * FROM ${safeTableName}
    ${whereSql}
    ORDER BY ${config.orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset).map((row) => ({
    ...row,
    _editor: buildBackendRowMeta(config.name, row)
  }));

  return {
    table: {
      name: config.name,
      label: config.label,
      primaryKey: config.primaryKey,
      editableColumns: config.editableColumns
    },
    columns: columns.map((column) => ({
      ...column,
      editable: config.editableColumns.includes(column.name)
    })),
    rows,
    pagination: {
      limit,
      offset,
      returned: rows.length,
      total,
      hasPrevious: offset > 0,
      hasNext: offset + rows.length < total
    },
    search
  };
}

function updateBackendTableRow(db, tableName = "", primaryKeyValue = "", changes = {}) {
  const config = getBackendTableConfig(tableName);
  const columns = readBackendTableColumns(db, config.name);
  const safeTableName = quoteSqlIdentifier(config.name);
  const primaryKey = config.primaryKey;
  const safePrimaryKey = quoteSqlIdentifier(primaryKey);
  const existing = db.prepare(`SELECT * FROM ${safeTableName} WHERE ${safePrimaryKey} = ?`).get(String(primaryKeyValue ?? ""));

  if (!existing) {
    throw Object.assign(new Error(`No row found in ${config.name} for ${primaryKey}=${primaryKeyValue}`), {
      statusCode: 404,
      payload: {
        code: "ROW_NOT_FOUND",
        error: `No row found in ${config.name} for ${primaryKey}=${primaryKeyValue}.`
      }
    });
  }

  const rowMeta = buildBackendRowMeta(config.name, existing);
  if (!rowMeta.editable) {
    throw Object.assign(new Error(rowMeta.reason), {
      statusCode: 409,
      payload: {
        code: "ROW_READ_ONLY",
        error: rowMeta.reason
      }
    });
  }

  const editableColumns = new Set(config.editableColumns);
  const entries = Object.entries(changes ?? {})
    .filter(([key]) => editableColumns.has(key))
    .filter(([key]) => key !== primaryKey);

  if (!entries.length) {
    throw Object.assign(new Error("No editable changes were provided."), {
      statusCode: 400,
      payload: {
        code: "NO_CHANGES",
        error: "No editable changes were provided."
      }
    });
  }

  const assignments = [];
  const values = [];

  for (const [columnName, rawValue] of entries) {
    const column = columns.find((item) => item.name === columnName);
    if (!column) {
      continue;
    }

    assignments.push(`${quoteSqlIdentifier(columnName)} = ?`);
    values.push(coerceBackendValueByColumn(column, rawValue));
  }

  if (columns.some((column) => column.name === "updatedAt")) {
    assignments.push(`${quoteSqlIdentifier("updatedAt")} = ?`);
    values.push(new Date().toISOString());
  }

  db.prepare(`
    UPDATE ${safeTableName}
    SET ${assignments.join(", ")}
    WHERE ${safePrimaryKey} = ?
  `).run(...values, String(primaryKeyValue ?? ""));

  if (config.name === "sound_constructs") {
    syncSoundConstructsToSubjectspace(db);
  }

  if (config.name === "subject_constructs") {
    refreshSubjectConstructRelations(db, String(primaryKeyValue ?? ""));
  }

  return db.prepare(`SELECT * FROM ${safeTableName} WHERE ${safePrimaryKey} = ?`).get(String(primaryKeyValue ?? ""));
}

async function buildBackendOverviewPayload(db) {
  const system = buildSystemHealthPayload();
  const counts = countConstructs(db);
  const subjects = listSubjectSpaces(db);
  const tables = listBackendTableSummaries(db);
  const datasetHealth = auditSubjectDataset(db, { maxIssues: 6 });
  const modelLabReports = buildBenchmarkReportsPayload(db, {
    recentLimit: 8,
    summaryLimit: 6
  });
  let releaseDatasetHealth = null;
  let databaseSizeBytes = null;

  try {
    const metadata = await stat(databasePath);
    databaseSizeBytes = Number(metadata.size ?? 0);
  } catch {
    databaseSizeBytes = null;
  }

  try {
    releaseDatasetHealth = {
      activeSeedFile: auditSubjectSeedFile(defaultSubjectSeedsPath, { maxIssues: 4 }),
      releaseSeedFile: auditSubjectSeedFile(releaseSubjectSeedsPath, { maxIssues: 4 })
    };
  } catch {
    releaseDatasetHealth = null;
  }

  return {
    ok: true,
    system,
    database: {
      connected: Boolean(database),
      path: databasePath,
      sizeBytes: databaseSizeBytes
    },
    counts: {
      ...counts,
      subjectSpaceCount: subjects.length
    },
    datasetHealth,
    modelLabReports,
    releaseDatasetHealth,
    tables,
    subjects: subjects.slice(0, 8)
  };
}

function sendJson(res, statusCode, payload) {
  if (!res || res.writableEnded) {
    return;
  }

  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  if (!res || res.writableEnded) {
    return;
  }

  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

function sendBinary(res, statusCode, buffer, mimeType) {
  if (!res || res.writableEnded) return;
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": mimeType,
    "Content-Length": Buffer.byteLength(buffer)
  });
  res.end(buffer);
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

async function synthesizeElevenLabs(text, voice = "alloy", format = "mp3") {
  const key = String(process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  const accept = format === "wav" ? "audio/wav" : "audio/mpeg";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      "Accept": accept
    },
    body: JSON.stringify({ text })
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${resp.status} ${resp.statusText} ${body}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
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

function buildSubjectspaceAnswerPayload(recall, { question = "", subjectId = "", db = null } = {}) {
  const hydratedConstruct = db
    ? hydrateSubjectConstructWithRelations(db, recall.matched)
    : hydrateConstructForClient(recall.matched);
  const hydratedRelatedConstructs = db
    ? hydrateSubjectConstructList(recall.relatedConstructs)
    : (Array.isArray(recall.relatedConstructs) ? recall.relatedConstructs.map((construct) => hydrateConstructForClient(construct)).filter(Boolean) : []);

  return {
    ok: true,
    source: recall.ready ? "strandspace" : "unresolved",
    question,
    subjectId: hydratedConstruct?.subjectId ?? recall.matched?.subjectId ?? subjectId,
    answer: recall.answer,
    construct: hydratedConstruct,
    recall: {
      ...recall,
      matched: hydratedConstruct,
      relatedConstructs: hydratedRelatedConstructs
    }
  };
}

function hydrateSubjectConstructList(constructs = []) {
  return (Array.isArray(constructs) ? constructs : [])
    .map((construct) => hydrateConstructForClient(construct))
    .filter(Boolean);
}

function hydrateSubjectConstructWithRelations(db, construct = null) {
  const hydrated = hydrateConstructForClient(construct);
  if (!hydrated) {
    return null;
  }

  const relatedConstructs = hydrateSubjectConstructList(
    Array.isArray(hydrated.relatedConstructIds)
      ? hydrated.relatedConstructIds.map((relatedId) => getSubjectConstruct(db, relatedId)).filter(Boolean)
      : []
  );
  const linkedConstructs = listConstructLinks(db, hydrated.id)
    .slice(0, 6)
    .map((link) => {
      const related = getSubjectConstruct(db, link.relatedConstructId);
      return {
        ...link,
        constructLabel: related?.constructLabel ?? link.relatedConstructId,
        subjectLabel: related?.subjectLabel ?? hydrated.subjectLabel
      };
    });

  return {
    ...hydrated,
    relatedConstructs,
    linkedConstructs,
    binderPreview: listStrandBinders(db, hydrated.subjectId).slice(0, 6),
    constructStrands: listConstructStrands(db, hydrated.id, { limit: 12 }),
    subjectStrandPreview: listSubjectStrands(db, hydrated.subjectId, { limit: 12 })
  };
}

function intersectionCount(left = [], right = []) {
  const leftSet = new Set((Array.isArray(left) ? left : []).filter(Boolean));
  const rightSet = new Set((Array.isArray(right) ? right : []).filter(Boolean));
  let count = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      count += 1;
    }
  }
  return count;
}

function chooseChatEnrichmentBase(db, recall = {}, suggestedConstruct = null) {
  if (!suggestedConstruct || typeof suggestedConstruct !== "object") {
    return null;
  }

  const draftTokens = extractReferenceTokens(normalizeConstructText(suggestedConstruct));
  const draftStrands = new Set([
    ...(Array.isArray(suggestedConstruct.strands) ? suggestedConstruct.strands : []),
    ...(Array.isArray(suggestedConstruct.tags) ? suggestedConstruct.tags : [])
  ].map((value) => String(value ?? "").trim()).filter(Boolean));
  const candidateIds = [
    recall.matched?.id,
    ...(recall.candidates ?? []).map((candidate) => candidate.id)
  ].filter(Boolean);

  let strongest = null;
  for (const id of candidateIds.slice(0, 3)) {
    const construct = getSubjectConstruct(db, id);
    if (!construct) {
      continue;
    }

    const candidateTokens = extractReferenceTokens(normalizeConstructText(construct));
    const candidateStrands = listConstructStrands(db, construct.id, { limit: 20 });
    const strandKeys = candidateStrands.flatMap((strand) => [
      String(strand.strandKey ?? "").trim(),
      String(strand.label ?? "").trim()
    ]).filter(Boolean);
    const tokenOverlap = intersectionCount(draftTokens, candidateTokens);
    const strandOverlap = intersectionCount(Array.from(draftStrands), strandKeys);
    const recallEntry = construct.id === recall.matched?.id
      ? recall.matched
      : (recall.candidates ?? []).find((candidate) => candidate.id === construct.id);
    const lexicalScore = Number(recallEntry?.score ?? 0);
    const totalScore = tokenOverlap + (strandOverlap * 1.4) + (lexicalScore / 12);

    if (totalScore < 2.35) {
      continue;
    }

    if (!strongest || totalScore > strongest.totalScore) {
      strongest = {
        construct,
        totalScore,
        tokenOverlap,
        strandOverlap
      };
    }
  }

  return strongest;
}

function mergeChatConstructIntoLocalBase(baseConstruct = null, suggestedConstruct = null, meta = {}) {
  if (!baseConstruct?.id) {
    return suggestedConstruct;
  }

  return mergeSubjectConstruct(baseConstruct, suggestedConstruct, {
    preserveId: true,
    provenance: {
      ...(baseConstruct.provenance ?? {}),
      ...(suggestedConstruct?.provenance ?? {}),
      ...meta,
      enrichedBaseConstructId: baseConstruct.id,
      enrichedFromChat: true
    }
  });
}

function buildConversationId() {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildConversationTitle(message = "", subjectLabel = "") {
  const basis = normalizePromptText(`${subjectLabel ? `${subjectLabel}: ` : ""}${message}`);
  return basis.slice(0, 96) || "Strandspace chat";
}

function ensureChatConversation(db, {
  conversationId = "",
  subjectId = "",
  title = "",
  metadata = null
} = {}) {
  ensureSubjectspaceTables(db);
  const id = String(conversationId ?? "").trim() || buildConversationId();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM chat_conversations WHERE id = ?").get(id);

  db.prepare(`
    INSERT INTO chat_conversations (id, subjectId, title, metadataJson, createdAt, lastMessageAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subjectId = excluded.subjectId,
      title = COALESCE(excluded.title, chat_conversations.title),
      metadataJson = COALESCE(excluded.metadataJson, chat_conversations.metadataJson),
      lastMessageAt = excluded.lastMessageAt
  `).run(
    id,
    String(subjectId ?? "").trim() || existing?.subjectId || null,
    String(title ?? "").trim() || existing?.title || null,
    metadata && typeof metadata === "object" ? JSON.stringify(metadata) : existing?.metadataJson ?? null,
    existing?.createdAt ?? now,
    now
  );

  return id;
}

function appendChatMessage(db, {
  conversationId,
  role = "user",
  content = "",
  subjectId = "",
  constructId = "",
  metadata = null
} = {}) {
  ensureSubjectspaceTables(db);
  const messageId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO chat_messages (id, conversationId, role, content, subjectId, constructId, metadataJson, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    String(conversationId ?? "").trim(),
    String(role ?? "user").trim() || "user",
    String(content ?? "").trim(),
    String(subjectId ?? "").trim() || null,
    String(constructId ?? "").trim() || null,
    metadata && typeof metadata === "object" ? JSON.stringify(metadata) : null,
    createdAt
  );

  db.prepare("UPDATE chat_conversations SET lastMessageAt = ? WHERE id = ?").run(createdAt, String(conversationId ?? "").trim());

  return {
    id: messageId,
    conversationId: String(conversationId ?? "").trim(),
    role: String(role ?? "user").trim() || "user",
    content: String(content ?? "").trim(),
    subjectId: String(subjectId ?? "").trim() || null,
    constructId: String(constructId ?? "").trim() || null,
    metadata,
    createdAt
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

function previewQuestionForLogs(question = "", limit = 96) {
  const normalized = normalizePromptText(question);
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(limit - 3, 1))}...`;
}

function humanizeDocName(value = "") {
  return String(value ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeConstructText(construct = {}) {
  return [
    construct.subjectId,
    construct.subjectLabel,
    construct.constructLabel,
    construct.target,
    construct.objective,
    construct.notes,
    ...(construct.tags ?? []),
    ...Object.keys(construct.context ?? {}),
    ...Object.values(construct.context ?? {})
  ]
    .map((item) => String(item ?? "").toLowerCase())
    .join(" ");
}

function extractReferenceTokens(value = "") {
  return [...new Set(
    normalizePromptText(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .filter((token) => token.length > 2 && !builderReferenceStopwords.has(token))
  )];
}

function listDocAssets() {
  try {
    return readdirSync(docsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .filter((entry) => docFileExtensions.has(extname(entry.name).toLowerCase()))
      .map((entry) => ({
        fileName: entry.name,
        fullPath: join(docsDir, entry.name),
        lowerName: entry.name.toLowerCase(),
        url: `/docs/${encodeURIComponent(entry.name)}`
      }))
      .sort((left, right) => left.fileName.localeCompare(right.fileName));
  } catch {
    return [];
  }
}

function extractReferencedDocNames(value = "") {
  const text = String(value ?? "");
  const matches = text.match(/[A-Za-z0-9 _.-]+\.(?:pdf|docx|patch|txt|md)/gi) ?? [];
  return matches
    .map((item) => basename(item.trim()))
    .filter(Boolean);
}

function isManualConstruct(construct = {}) {
  const provenanceSource = String(construct.provenance?.source ?? "").trim().toLowerCase();
  const tags = Array.isArray(construct.tags) ? construct.tags : [];
  const signature = normalizeConstructText(construct);
  const manualSignal = /\bmanual\b|\bowner'?s guide\b|\bquick start\b|\breference\b/.test(signature)
    || tags.some((tag) => /\bmanual\b|\bguide\b|\breference\b/i.test(String(tag ?? "")));

  return provenanceSource === "manual" && manualSignal;
}

function buildConstructSources(construct = {}) {
  if (!construct || typeof construct !== "object") {
    return [];
  }

  const docs = listDocAssets();
  if (!docs.length) {
    return [];
  }

  const sources = new Map();
  const textBuckets = [
    ...Object.entries(construct.context ?? {}).map(([key, value]) => ({
      label: String(key ?? "").replace(/^\s*[-*]\s*/, "").trim() || "Referenced manual",
      value
    })),
    {
      label: "Notes",
      value: construct.notes
    },
    {
      label: "Imported from",
      value: construct.provenance?.importedFrom
    },
    {
      label: "Learned from",
      value: construct.provenance?.learnedFromQuestion
    }
  ];

  for (const bucket of textBuckets) {
    for (const fileName of extractReferencedDocNames(bucket.value)) {
      const asset = docs.find((entry) => entry.lowerName === fileName.toLowerCase());
      if (!asset || sources.has(asset.fileName)) {
        continue;
      }

      sources.set(asset.fileName, {
        label: bucket.label || humanizeDocName(asset.fileName),
        fileName: asset.fileName,
        url: asset.url,
        kind: extname(asset.fileName).slice(1).toLowerCase()
      });
    }
  }

  if (!sources.size && isManualConstruct(construct)) {
    const signature = normalizeConstructText(construct);
    const relatedAssets = (
      /\bt8s\b|\bt4s\b|\btonematch\b|\bbose\b/.test(signature)
        ? docs.filter((entry) => /t4s-t8s|tonematch/i.test(entry.lowerName))
        : []
    ).slice(0, 2);

    for (const asset of relatedAssets) {
      if (sources.has(asset.fileName)) {
        continue;
      }

      sources.set(asset.fileName, {
        label: /qsg|quick/i.test(asset.fileName) ? "Quick Start Guide" : "Owner's Guide",
        fileName: asset.fileName,
        url: asset.url,
        kind: extname(asset.fileName).slice(1).toLowerCase()
      });
    }
  }

  return [...sources.values()];
}

function hydrateConstructForClient(construct = null) {
  if (!construct) {
    return null;
  }

  return {
    ...construct,
    relevance: buildConstructRelevanceSummary(construct),
    provenanceSource: String(construct.provenance?.source ?? "").trim() || null,
    isManualReference: isManualConstruct(construct),
    sources: buildConstructSources(construct)
  };
}

function buildReferencePayload(construct = null, meta = {}) {
  const hydrated = hydrateConstructForClient(construct);
  if (!hydrated) {
    return null;
  }

  return {
    ...hydrated,
    matchScore: Number.isFinite(Number(meta.matchScore)) ? Number(meta.matchScore) : null,
    matchReason: String(meta.matchReason ?? "").trim(),
    matchRoute: String(meta.matchRoute ?? "").trim()
  };
}

function collectReferenceIds(recall = {}) {
  return [
    recall.matched?.id,
    ...(recall.candidates ?? []).map((candidate) => candidate.id)
  ].filter(Boolean);
}

function buildBuilderReferenceSet(db, {
  input = "",
  subjectId = "",
  subjectLabel = "",
  baseConstruct = null,
  limit = 4
} = {}) {
  const references = [];
  const seen = new Set();
  const tokens = extractReferenceTokens(`${subjectLabel} ${input}`.trim());
  const lookups = [
    {
      label: subjectId ? "Active subject recall" : "Recall check",
      recall: recallSubjectSpace(db, {
        question: input,
        subjectId
      })
    },
    {
      label: "Global recall check",
      recall: recallSubjectSpace(db, {
        question: input
      })
    }
  ];

  if (subjectLabel) {
    lookups.push({
      label: "Subject-guided recall check",
      recall: recallSubjectSpace(db, {
        question: `${subjectLabel} ${input}`.trim()
      })
    });
  }

  const manualMatches = listSubjectConstructs(db)
    .map((construct) => ({
      construct,
      tokenMatches: tokens.filter((token) => normalizeConstructText(construct).includes(token)).length
    }))
    .filter((entry) => isManualConstruct(entry.construct) && entry.tokenMatches >= 2)
    .sort((left, right) => right.tokenMatches - left.tokenMatches || left.construct.constructLabel.localeCompare(right.construct.constructLabel))
    .slice(0, 2);

  function pushReference(record, meta = {}) {
    const construct = record
      && typeof record.context === "object"
      && !Array.isArray(record.context)
      ? record
      : getSubjectConstruct(db, record?.id);
    if (!construct || seen.has(construct.id)) {
      return;
    }

    seen.add(construct.id);
    const reference = buildReferencePayload(construct, meta);
    if (reference) {
      references.push(reference);
    }
  }

  if (baseConstruct) {
    pushReference(baseConstruct, {
      matchReason: "Active construct in the editor",
      matchRoute: "editor",
      matchScore: Number(baseConstruct.learnedCount ?? 1)
    });
  }

  for (const lookup of lookups) {
    const ids = collectReferenceIds(lookup.recall).slice(0, 3);

    for (const id of ids) {
      const candidate = getSubjectConstruct(db, id);
      const candidateMeta = (lookup.recall.candidates ?? []).find((item) => item.id === id);

      pushReference(candidate, {
        matchReason: lookup.label,
        matchRoute: lookup.recall.routing?.mode ?? "",
        matchScore: candidateMeta?.score ?? lookup.recall.readiness?.matchedScore ?? null
      });
    }
  }

  for (const match of manualMatches) {
    pushReference(match.construct, {
      matchReason: "Manual reference scan",
      matchRoute: "manual_scan",
      matchScore: 500 + match.tokenMatches
    });
  }

  return references
    .sort((left, right) => {
      const leftPriority = Number(left.matchRoute === "editor") * 1000
        + Number(left.matchRoute === "manual_scan") * 900
        + Number(left.isManualReference) * 100
        + Number(left.matchScore ?? 0);
      const rightPriority = Number(right.matchRoute === "editor") * 1000
        + Number(right.matchRoute === "manual_scan") * 900
        + Number(right.isManualReference) * 100
        + Number(right.matchScore ?? 0);

      return rightPriority - leftPriority
        || left.constructLabel.localeCompare(right.constructLabel);
    })
    .slice(0, limit);
}

function buildBuilderChecks(references = []) {
  if (!references.length) {
    return [
      "No strong existing construct matched the new input, so the builder drafted from the prompt alone."
    ];
  }

  const checks = [
    `Checked ${references.length} related construct${references.length === 1 ? "" : "s"} before drafting.`
  ];
  const manualReferences = references.filter((reference) => reference.isManualReference);

  for (const reference of manualReferences.slice(0, 2)) {
    checks.push(
      reference.sources?.length
        ? `Consulted manual reference "${reference.constructLabel}" with ${reference.sources.length} local document link${reference.sources.length === 1 ? "" : "s"}.`
        : `Consulted manual reference "${reference.constructLabel}" while shaping the new draft.`
    );
  }

  return checks.slice(0, 4);
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
  const llmLabel = String(llm.providerLabel || llm.label || "the LLM assist round-trip").trim() || "the LLM assist round-trip";
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
        ? `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${llmLabel} failed after ${Number(llm.latencyMs).toFixed(3)} ms: ${llm.error}${promptNote}`
        : `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${llmLabel} failed: ${llm.error}${promptNote}`
    };
  }

  if (!Number.isFinite(llm.latencyMs)) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: null,
      summary: `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${llmLabel} failed${llm.error ? `: ${llm.error}` : "."}${promptNote}`.trim()
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
      ? `Strandbase recall was ${speedup}x faster than ${llmLabel} for this prompt.${promptNote}`
      : `${llmLabel} was ${speedup}x faster than Strandbase recall for this prompt.${promptNote}`
  };
}

function buildRecallGroundingBlock(recall = {}) {
  const matched = recall?.matched ?? null;
  if (!matched) {
    return "";
  }

  const contextLines = Object.entries(matched.context ?? {})
    .filter(([key, value]) => key && value)
    .slice(0, 5)
    .map(([key, value]) => `- ${key}: ${value}`);
  const steps = Array.isArray(matched.steps) ? matched.steps.filter(Boolean).slice(0, 4) : [];
  const tags = Array.isArray(matched.tags) ? matched.tags.filter(Boolean).slice(0, 8) : [];

  return [
    "Local Strandspace recall context:",
    `- construct: ${matched.constructLabel || "Untitled construct"}`,
    matched.subjectLabel ? `- subject: ${matched.subjectLabel}` : "",
    matched.target ? `- target: ${matched.target}` : "",
    matched.objective ? `- objective: ${matched.objective}` : "",
    contextLines.length ? `Context:\n${contextLines.join("\n")}` : "",
    steps.length ? `Steps:\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : "",
    tags.length ? `Tags:\n- ${tags.join("\n- ")}` : ""
  ].filter(Boolean).join("\n\n");
}

function buildLocalChatConstructLabel(message = "", matchedConstruct = null) {
  if (matchedConstruct?.constructLabel) {
    return matchedConstruct.constructLabel;
  }

  const normalized = normalizePromptText(message)
    .replace(/^(what|how|why|when|where|can|could|would|should|tell me|give me|show me)\b/i, "")
    .replace(/^[\s:,-]+/, "")
    .replace(/[?!.]+$/g, "")
    .trim();

  if (!normalized) {
    return "Local chat recall";
  }

  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return `${label} recall`.slice(0, 120);
}

function buildFallbackLocalConstructBlock({
  message = "",
  answer = "",
  subjectLabel = "",
  recall = null
} = {}) {
  const matched = recall?.matched ?? null;
  const contextLines = Object.entries(matched?.context ?? {})
    .filter(([key, value]) => key && value)
    .slice(0, 3)
    .map(([key, value]) => `- ${key}: ${value}`);
  const stepLines = Array.isArray(matched?.steps)
    ? matched.steps.filter(Boolean).slice(0, 3).map((step) => `- ${step}`)
    : [];
  const tagLines = Array.isArray(matched?.tags)
    ? matched.tags.filter(Boolean).slice(0, 5).map((tag) => `- ${tag}`)
    : [];

  return [
    `Subject: ${subjectLabel || matched?.subjectLabel || "General Recall"}`,
    `Construct Label: ${buildLocalChatConstructLabel(message, matched)}`,
    matched?.target ? `Target: ${matched.target}` : `Target: ${normalizePromptText(message).slice(0, 180)}`,
    matched?.objective ? `Objective: ${matched.objective}` : "",
    contextLines.length ? `Context:\n${contextLines.join("\n")}` : "",
    stepLines.length ? `Steps:\n${stepLines.join("\n")}` : "",
    answer ? `Notes: ${String(answer ?? "").trim().replace(/\s+/g, " ")}` : "",
    tagLines.length ? `Tags:\n${tagLines.join("\n")}` : ""
  ].filter(Boolean).join("\n");
}

function parseLocalChatAssistOutput(output = "", {
  message = "",
  subjectId = "",
  subjectLabel = "",
  recall = null
} = {}) {
  const raw = String(output ?? "").replace(/\r\n/g, "\n").trim();
  const answerMatch = raw.match(/(?:^|\n)ANSWER:\s*([\s\S]*?)(?=\nCONSTRUCT:\s*|$)/i);
  const constructMatch = raw.match(/(?:^|\n)CONSTRUCT:\s*([\s\S]*)$/i);
  const answer = String(answerMatch?.[1] ?? raw).trim() || String(raw).trim();
  const constructBlock = String(
    constructMatch?.[1]
    ?? buildFallbackLocalConstructBlock({
      message,
      answer,
      subjectLabel,
      recall
    })
  ).trim();
  const drafts = ingestConversationToConstructs({
    subjectId,
    subjectLabel,
    messages: [
      {
        role: "user",
        content: message
      },
      {
        role: "assistant",
        content: constructBlock
      }
    ]
  });
  const draft = drafts[0] ?? buildSubjectConstructDraftFromInput(constructBlock, {
    subjectId,
    subjectLabel
  });

  return {
    answer,
    constructBlock,
    draft
  };
}

function buildProviderBenchmark(localLatencyMs, llm = {}, promptMode = "question-only", providerLabel = "Selected model") {
  const label = String(providerLabel || llm.providerLabel || llm.label || "Selected model").trim() || "Selected model";
  const promptNote = promptMode === "local-grounded"
    ? ` ${label} was grounded with the local construct before generating its reply.`
    : ` ${label} answered from the raw question only.`;

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
        ? `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${label} failed after ${Number(llm.latencyMs).toFixed(3)} ms: ${llm.error}${promptNote}`
        : `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${label} failed: ${llm.error}${promptNote}`
    };
  }

  if (!Number.isFinite(llm.latencyMs)) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: null,
      summary: `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${label} did not return a measurable latency.${promptNote}`
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
      ? `Strandbase recall was ${speedup}x faster than ${label} for this prompt.${promptNote}`
      : `${label} was ${speedup}x faster than Strandbase recall for this prompt.${promptNote}`
  };
}

async function buildModelLabStatusPayload() {
  const openai = getOpenAiAssistStatus();
  const benchmarkTimeoutMs = (() => {
    const parsed = Number.parseInt(
      String(process.env.SUBJECTSPACE_MODEL_LAB_TIMEOUT_MS ?? process.env.MODEL_LAB_OPENAI_TIMEOUT_MS ?? "").trim(),
      10
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MODEL_LAB_OPENAI_TIMEOUT_MS;
  })();
  const providers = [
    {
      provider: "openai",
      label: "OpenAI Assist",
      available: Boolean(openai.enabled),
      enabled: Boolean(openai.enabled),
      defaultModel: String(openai.model ?? "").trim(),
      models: Array.isArray(openai.models) && openai.models.length
        ? openai.models.map((model) => ({
          id: model,
          name: model,
          provider: "openai"
        }))
        : [],
      reason: openai.reason,
      capabilities: ["draft", "compare", "populate"]
    }
  ];

  const defaultProvider = providers.find((provider) => provider.enabled)?.provider
    ?? providers.find((provider) => provider.available)?.provider
    ?? "openai";
  const defaultModel = providers.find((provider) => provider.provider === defaultProvider)?.defaultModel ?? "";

  return {
    ok: true,
    providers,
    defaultProvider,
    defaultModel,
    reason: openai.reason,
    requestTimeoutMs: openai.timeoutMs,
    benchmarkTimeoutMs
  };
}

function normalizeModelProvider(value = "", status = null) {
  return String(status?.defaultProvider ?? "openai").trim() || "openai";
}

function findModelProvider(status = null, provider = "") {
  const providers = Array.isArray(status?.providers) ? status.providers : [];
  return providers.find((entry) => entry.provider === provider) ?? null;
}

function buildModelAlternativeSuggestions(status = null, provider = "", model = "") {
  const providers = Array.isArray(status?.providers) ? status.providers : [];
  const normalizedProvider = String(provider ?? "").trim();
  const normalizedModel = String(model ?? "").trim();

  return providers.flatMap((entry) => {
    const models = Array.isArray(entry.models) ? entry.models : [];
    return models.map((item) => ({
      provider: entry.provider,
      providerLabel: entry.label,
      model: String(item.name ?? item.id ?? "").trim()
    }));
  }).filter((entry) => entry.model && !(entry.provider === normalizedProvider && entry.model === normalizedModel))
    .slice(0, 5);
}

function isModelTestingUnavailableError(error = null) {
  const code = String(error?.payload?.code ?? error?.code ?? "").trim().toUpperCase();
  return ["OPENAI_REQUEST_TIMEOUT"].includes(code);
}

function buildModelTestingUnavailablePayload({
  error = null,
  status = null,
  provider = "",
  providerMeta = null,
  model = "",
  question = "",
  recall = null,
  prompts = null,
  debug = null,
  localLatencyMs = null
} = {}) {
  const code = String(error?.payload?.code ?? error?.code ?? "MODEL_TESTING_UNAVAILABLE").trim().toUpperCase() || "MODEL_TESTING_UNAVAILABLE";
  const detail = String(error?.payload?.detail ?? "").trim();
  const baseError = String(error?.payload?.error ?? error?.message ?? "Model testing is unavailable right now.").trim() || "Model testing is unavailable right now.";
  const suggestions = buildModelAlternativeSuggestions(status, provider, model);
  const suggestionText = suggestions.length
    ? ` Try ${suggestions.map((entry) => `${entry.providerLabel} ${entry.model}`).join(", ")} instead.`
    : " Try another configured model instead.";

  return {
    statusCode: 503,
    payload: {
      ok: false,
      code: "MODEL_TESTING_UNAVAILABLE",
      error: `Model testing unavailable. ${baseError}`.trim(),
      detail: `${detail || baseError}${suggestionText}`.trim(),
      provider,
      providerLabel: providerMeta?.label ?? "",
      model,
      question,
      recall,
      prompts,
      debug,
      localLatencyMs,
      suggestedModels: suggestions
    }
  };
}

function createModelLabDebugEntry({
  mode = "draft",
  provider = "",
  providerLabel = "",
  model = "",
  question = "",
  requestPrompt = "",
  responseText = "",
  constructLabel = "",
  grounded = false,
  localReady = false,
  latencyMs = null,
  localLatencyMs = null,
  promptMode = "",
  error = ""
} = {}) {
  return {
    timestamp: new Date().toISOString(),
    mode,
    provider,
    providerLabel,
    model,
    question,
    requestPrompt,
    responseText,
    constructLabel,
    grounded: Boolean(grounded),
    localReady: Boolean(localReady),
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
    localLatencyMs: Number.isFinite(Number(localLatencyMs)) ? Number(localLatencyMs) : null,
    promptMode,
    error: String(error ?? "").trim()
  };
}

function resolvePublicPath(pathname = "") {
  if (pathname === "/" || pathname === "/landing" || pathname === "/landing/") {
    return "/index.html";
  }

  if (pathname === "/builder" || pathname === "/builder/" || pathname === "/backend" || pathname === "/backend/") {
    return "/backend/index.html";
  }

  if (pathname === "/studio" || pathname === "/studio/") {
    return "/backend/index.html";
  }

  if (pathname === "/subject" || pathname === "/subject/") {
    return "/subject/index.html";
  }

  if (pathname === "/chat" || pathname === "/chat/") {
    return "/chat/index.html";
  }

  return pathname;
}

function resolveStaticFilePath(rootDir, relativePath) {
  const cleanedPath = String(relativePath ?? "").replace(/^\/+/, "");
  const filePath = join(rootDir, cleanedPath);
  const normalizedRoot = normalize(rootDir.endsWith("\\") ? rootDir : `${rootDir}\\`);
  const normalizedFile = normalize(filePath);

  if (!normalizedFile.startsWith(normalizedRoot)) {
    throw Object.assign(new Error("Invalid path"), { statusCode: 400 });
  }

  return filePath;
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
  ensureBenchmarkTables(database);
  seedSubjectspace(database);
  syncSoundConstructsToSubjectspace(database);
  return database;
}

export function closeMemoryDatabase() {
  if (!database) {
    return false;
  }

  try {
    database.close();
    logEvent("info", "SQLite database connection closed", {
      databasePath
    });
  } catch (error) {
    logEvent("warn", "SQLite database close reported an error", {
      databasePath,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    database = null;
  }

  return true;
}

export function resetExampleData(targetDb = openMemoryDatabase()) {
  ensureSubjectspaceTables(targetDb);
  ensureSoundspaceTables(targetDb);
  ensureBenchmarkTables(targetDb);

  targetDb.exec("BEGIN");
  try {
    targetDb.exec("DELETE FROM chat_messages;");
    targetDb.exec("DELETE FROM chat_conversations;");
    targetDb.exec("DELETE FROM benchmark_reports;");
    targetDb.exec("DELETE FROM construct_links;");
    targetDb.exec("DELETE FROM strand_binders;");
    targetDb.exec("DELETE FROM sound_constructs;");
    targetDb.exec("DELETE FROM subject_constructs;");
    targetDb.exec("COMMIT");
  } catch (error) {
    try {
      targetDb.exec("ROLLBACK");
    } catch {
      // Best effort rollback.
    }
    throw error;
  }

  const soundCount = Number(seedSoundspace(targetDb) ?? 0);
  const subjectCount = Number(seedSubjectspace(targetDb) ?? 0);
  syncSoundConstructsToSubjectspace(targetDb);

  return {
    soundCount: Number(targetDb.prepare("SELECT COUNT(*) as count FROM sound_constructs").get().count ?? soundCount),
    subjectCount: Number(targetDb.prepare("SELECT COUNT(*) as count FROM subject_constructs").get().count ?? subjectCount)
  };
}

async function readStaticFile(urlPath, rootDir = publicDir) {
  const filePath = resolveStaticFilePath(rootDir, urlPath);
  return readFile(filePath);
}

async function handleStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/soundspace" || pathname === "/soundspace/") {
    res.writeHead(302, {
      Location: "/subject?subjectId=music-engineering",
      "Cache-Control": "no-store"
    });
    res.end();
    return;
  }

  const isDocsRequest = pathname.startsWith("/docs/");
  const resolvedPath = isDocsRequest
    ? pathname.replace(/^\/docs\/+/, "")
    : resolvePublicPath(pathname);
  const extension = extname(resolvedPath);

  try {
    const data = await readStaticFile(resolvedPath, isDocsRequest ? docsDir : publicDir);
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

function buildSoundSubjectConstruct(soundConstruct = {}) {
  const setup = soundConstruct.setup ?? {};
  const context = Object.fromEntries([
    ["device", [soundConstruct.deviceBrand, soundConstruct.deviceModel].filter(Boolean).join(" ")],
    ["device type", soundConstruct.deviceType ?? ""],
    ["source", [soundConstruct.sourceBrand, soundConstruct.sourceModel, soundConstruct.sourceType].filter(Boolean).join(" ")],
    ["preset", [soundConstruct.presetSystem, soundConstruct.presetCategory, soundConstruct.presetName].filter(Boolean).join(" > ")],
    ["event", soundConstruct.eventType ?? ""],
    ["venue", soundConstruct.venueSize ?? ""],
    ["speaker config", soundConstruct.speakerConfig ?? ""]
  ].filter(([, value]) => String(value ?? "").trim()));
  const steps = [
    setup.toneMatch ? `ToneMatch: ${setup.toneMatch}` : null,
    setup.system ? `System: ${setup.system}` : null,
    setup.gain ? `Gain: ${setup.gain}` : null,
    setup.eq ? `EQ: ${setup.eq}` : null,
    setup.fx ? `FX: ${setup.fx}` : null,
    setup.monitor ? `Monitor: ${setup.monitor}` : null,
    setup.placement ? `Placement: ${setup.placement}` : null
  ].filter(Boolean);

  return {
    id: `sound-${soundConstruct.id}`,
    subjectId: "music-engineering",
    subjectLabel: "Music Engineering",
    constructLabel: soundConstruct.name || "Sound construct",
    target: [soundConstruct.deviceBrand, soundConstruct.deviceModel, soundConstruct.sourceType].filter(Boolean).join(" "),
    objective: soundConstruct.goal || "Reusable sound setup",
    context,
    steps,
    notes: [setup.notes, soundConstruct.llmSummary].filter(Boolean).join("\n\n"),
    tags: Array.from(new Set([
      "soundspace",
      "music engineering",
      ...(soundConstruct.tags ?? [])
    ])),
    strands: Array.from(new Set([
      "subject:music_engineering",
      `sound:${String(soundConstruct.id ?? "").trim()}`,
      ...(soundConstruct.strands ?? [])
    ])),
    provenance: {
      source: soundConstruct.provenance?.source ?? "soundspace",
      learnedFromQuestion: soundConstruct.provenance?.learnedFromQuestion ?? null,
      linkedSoundConstructId: soundConstruct.id ?? null
    }
  };
}

function persistSoundConstruct(db, payload = {}) {
  const soundConstruct = upsertSoundConstruct(db, payload);
  const linkedSubjectConstruct = upsertSubjectConstruct(db, buildSoundSubjectConstruct(soundConstruct));

  return {
    soundConstruct,
    linkedSubjectConstruct
  };
}

function syncSoundConstructsToSubjectspace(db) {
  const soundConstructs = listSoundConstructs(db);
  for (const construct of soundConstructs) {
    const mirrored = buildSoundSubjectConstruct(construct);
    const existing = getSubjectConstruct(db, mirrored.id);
    const unchanged = existing
      && existing.subjectId === mirrored.subjectId
      && existing.subjectLabel === mirrored.subjectLabel
      && existing.constructLabel === mirrored.constructLabel
      && existing.target === mirrored.target
      && existing.objective === mirrored.objective
      && JSON.stringify(existing.context ?? {}) === JSON.stringify(mirrored.context ?? {})
      && JSON.stringify(existing.steps ?? []) === JSON.stringify(mirrored.steps ?? [])
      && String(existing.notes ?? "") === String(mirrored.notes ?? "")
      && JSON.stringify(existing.tags ?? []) === JSON.stringify(mirrored.tags ?? [])
      && JSON.stringify(existing.strands ?? []) === JSON.stringify(mirrored.strands ?? []);

    if (!unchanged) {
      upsertSubjectConstruct(db, mirrored);
    }
  }
}

function buildMusicEngineeringContext(db, question = "", recall = {}) {
  const soundIds = [
    recall.matched?.id,
    ...(recall.combined?.matches ?? []).map((match) => match.id)
  ].filter(Boolean);
  const linkedSubjectConstructs = Array.from(new Set(soundIds))
    .map((id) => getSubjectConstruct(db, `sound-${id}`))
    .filter(Boolean)
    .map((construct) => hydrateConstructForClient(construct));
  const subjectRecall = recallSubjectSpace(db, {
    question,
    subjectId: "music-engineering"
  });

  return {
    linkedSubjectConstructs,
    subjectRecall: {
      ...subjectRecall,
      matched: hydrateConstructForClient(subjectRecall.matched)
    }
  };
}

function formatSoundReviewValue(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ").trim();
  }

  return String(value ?? "").trim();
}

function trimSoundConstructForReview(construct = null) {
  if (!construct) {
    return null;
  }

  return {
    id: construct.id,
    name: construct.name,
    deviceBrand: construct.deviceBrand,
    deviceModel: construct.deviceModel,
    sourceBrand: construct.sourceBrand,
    sourceModel: construct.sourceModel,
    sourceType: construct.sourceType,
    goal: construct.goal,
    eventType: construct.eventType,
    venueSize: construct.venueSize,
    speakerConfig: construct.speakerConfig,
    presetCategory: construct.presetCategory,
    presetName: construct.presetName,
    setup: Object.fromEntries(Object.entries(construct.setup ?? {}).filter(([, value]) => value)),
    tags: Array.isArray(construct.tags) ? construct.tags.slice(0, 10) : [],
    strands: Array.isArray(construct.strands) ? construct.strands.slice(0, 10) : []
  };
}

function buildSoundProposalDiff(baseConstruct = null, proposalConstruct = null) {
  const base = baseConstruct ?? null;
  const proposal = proposalConstruct ?? null;
  const entries = [];
  const setupLabels = {
    toneMatch: "Setup - ToneMatch",
    system: "Setup - System",
    gain: "Setup - Gain",
    eq: "Setup - EQ",
    fx: "Setup - FX",
    monitor: "Setup - Monitor",
    placement: "Setup - Placement",
    notes: "Setup - Notes"
  };
  const fieldEntries = [
    ["Source", [base?.sourceBrand, base?.sourceModel, base?.sourceType].filter(Boolean).join(" "), [proposal?.sourceBrand, proposal?.sourceModel, proposal?.sourceType].filter(Boolean).join(" ")],
    ["Goal", base?.goal, proposal?.goal],
    ["Event", base?.eventType, proposal?.eventType],
    ["Venue", base?.venueSize, proposal?.venueSize],
    ["Speaker config", base?.speakerConfig, proposal?.speakerConfig],
    ["Preset", [base?.presetCategory, base?.presetName].filter(Boolean).join(" > "), [proposal?.presetCategory, proposal?.presetName].filter(Boolean).join(" > ")]
  ];

  const addEntry = (label, previousValue, nextValue) => {
    const baseValue = formatSoundReviewValue(previousValue);
    const proposalValue = formatSoundReviewValue(nextValue);
    if (!baseValue && !proposalValue) {
      return;
    }
    if (baseValue === proposalValue) {
      return;
    }

    entries.push({
      label,
      baseValue: baseValue || "Not stored yet",
      proposalValue: proposalValue || "Not set in proposal"
    });
  };

  for (const [label, previousValue, nextValue] of fieldEntries) {
    addEntry(label, previousValue, nextValue);
  }

  const setupKeys = Array.from(new Set([
    ...Object.keys(base?.setup ?? {}),
    ...Object.keys(proposal?.setup ?? {})
  ]));

  for (const key of setupKeys) {
    addEntry(setupLabels[key] ?? `Setup - ${key}`, base?.setup?.[key], proposal?.setup?.[key]);
  }

  return {
    hasBase: Boolean(base),
    baseLabel: base?.name ?? "Closest stored memory",
    proposalLabel: proposal?.name ?? "Proposal",
    summary: base
      ? (entries.length
          ? `Showing the main differences between the closest stored memory and this proposal.`
          : "This proposal matches the closest stored memory at the compared fields.")
      : "No close stored construct was selected as a base, so this proposal would create a fresh memory.",
    entries: entries.slice(0, 16)
  };
}

function buildSoundProposalReview(question, construct, recall = {}, source = "generated-proposal", baseConstruct = null) {
  const preview = summarizeSoundConstruct(question, construct, {
    clarification: recall.clarification ?? null
  });
  const parsed = preview.parsed ?? {};
  const missingInformation = [];
  const assumptions = [];
  const changeSummary = [];
  const closestStoredConstruct = baseConstruct ?? recall.matched ?? null;
  const diff = buildSoundProposalDiff(closestStoredConstruct, construct);
  const constructLabel = [construct?.deviceBrand, construct?.deviceModel].filter(Boolean).join(" ");
  const isNewDeviceProposal = Boolean(
    construct?.deviceModel
    && (!closestStoredConstruct?.deviceModel || construct.deviceModel !== closestStoredConstruct.deviceModel)
  );

  if (!parsed.deviceModel) {
    missingInformation.push("Exact device model is still missing.");
  }
  if (preview.clarification?.prompt) {
    missingInformation.push(preview.clarification.prompt);
  }
  if (!parsed.sourceType) {
    missingInformation.push("Strandspace still needs to know whether this is for microphones, instruments, playback, or speakers.");
  }
  if (!parsed.eventType) {
    assumptions.push("Show type was not specified, so this proposal is using a general live-sound starting point.");
  }
  if (!parsed.venueSize) {
    assumptions.push("Coverage size was not specified, so this proposal is using a small-room starting point.");
  }
  if (closestStoredConstruct?.id) {
    changeSummary.push(`This proposal builds on the closest stored construct: ${closestStoredConstruct.name}.`);
    if (construct?.deviceModel && closestStoredConstruct?.deviceModel && construct.deviceModel !== closestStoredConstruct.deviceModel) {
      changeSummary.push(`${constructLabel || construct.deviceModel} is not stored in Soundspace yet, so this review would add it as a new construct while borrowing the nearest ${closestStoredConstruct.deviceModel} speaker memory as a base.`);
    }
  } else {
    changeSummary.push("This proposal would create a new sound construct in Strandspace.");
    if (construct?.deviceModel) {
      changeSummary.push(`${constructLabel || construct.deviceModel} is not stored in Soundspace yet, so this review would add it as a new construct if you commit it.`);
    }
  }
  if (construct.sourceModel && construct.sourceModel !== closestStoredConstruct?.sourceModel) {
    changeSummary.push(`It adds source-specific detail for ${[construct.sourceBrand, construct.sourceModel].filter(Boolean).join(" ")}.`);
  }
  if (construct.sourceType === "speaker system") {
    changeSummary.push("It treats the question as a front-of-house speaker-system construct instead of a mixer channel strip.");
  }
  changeSummary.push("Saving it will also mirror the result into the shared Music Engineering construct field.");

  const canLearn = Boolean(construct?.deviceModel)
    && Boolean(construct?.sourceType)
    && !preview.clarification
    && construct?.shouldLearn !== false;
  const summary = canLearn
    ? isNewDeviceProposal
      ? `${constructLabel || "This device"} is not stored yet. Review these starting settings, then add the construct only if they match the rig you meant.`
      : "This proposal is ready for review. Add it only if the assumptions look right."
    : "Strandspace needs one more detail before this can be trusted enough to store.";
  const title = canLearn
    ? isNewDeviceProposal
      ? `Add this to Strandspace? ${constructLabel || "This device"} settings are ready for review.`
      : "Would you like to add this to Strandspace?"
    : "Need more information before storing";
  const nextAction = canLearn
    ? isNewDeviceProposal
      ? `Review the ${constructLabel || "device"} settings, then commit the construct if this is the speaker rig you want Strandspace to learn.`
      : "Review the proposal, then add it if it matches the rig you meant."
    : "Refine the question with the missing details, then ask again.";

  return {
    canLearn,
    summary,
    title,
    changeSummary,
    assumptions,
    missingInformation,
    nextAction,
    sourceLabel: source.includes("openai") ? "OpenAI proposal" : "Local proposal",
    focusKeys: preview.focusKeys ?? [],
    focusedSetup: preview.focusedSetup ?? {},
    answerPreview: preview.answer ?? null,
    baseConstruct: trimSoundConstructForReview(closestStoredConstruct),
    diff,
    parsed
  };
}

function pickDefaultSubjectId(subjects = []) {
  const items = Array.isArray(subjects) ? subjects : [];
  if (!items.length) {
    return "";
  }

  return [...items]
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.updatedAt ?? "")) || 0;
      const rightTime = Date.parse(String(right.updatedAt ?? "")) || 0;
      return rightTime - leftTime || left.subjectLabel.localeCompare(right.subjectLabel);
    })[0]?.subjectId ?? items[0]?.subjectId ?? "";
}

async function handleApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const db = openMemoryDatabase();
  const requestState = beginApiRequest(req, res, url.pathname);

  try {
  if (url.pathname === "/api/subjectspace/subjects") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjects = listSubjectSpaces(db);
    const defaultSubjectId = pickDefaultSubjectId(subjects);

    sendJson(res, 200, {
      ok: true,
      defaultSubjectId,
      subjects
    });
    return;
  }

  if (url.pathname === "/api/system/reset-examples") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    const counts = resetExampleData(db);
    logEvent("info", "Example data reset", counts);
    sendJson(res, 200, {
      ok: true,
      message: "Strandspace was reset with the bundled example constructs.",
      ...counts,
      subjects: listSubjectSpaces(db)
    });
    return;
  }

  if (url.pathname === "/api/system/health") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, buildSystemHealthPayload());
    return;
  }

  if (url.pathname === "/api/system/threat-model") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, {
      ok: true,
      ...getThreatModel()
    });
    return;
  }

  if (url.pathname === "/api/stats") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const overview = await buildBackendOverviewPayload(db);
    sendJson(res, 200, {
      ok: true,
      database: overview.database,
      counts: overview.counts,
      datasetHealth: overview.datasetHealth,
      modelLabReports: overview.modelLabReports,
      releaseDatasetHealth: overview.releaseDatasetHealth,
      tables: overview.tables,
      subjects: overview.subjects,
      openai: buildSystemHealthPayload().openai
    });
    return;
  }

  if (url.pathname === "/api/model-lab/status") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, await buildModelLabStatusPayload());
    return;
  }

  if (url.pathname === "/api/model-lab/generate") {
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

    const status = await buildModelLabStatusPayload();
    const provider = normalizeModelProvider(payload.provider, status);
    const providerMeta = findModelProvider(status, provider);
    const prompt = normalizePromptText(payload.prompt ?? payload.question ?? "");
    const subjectId = String(payload.subjectId ?? payload.subject ?? "").trim();
    const model = String(payload.model ?? providerMeta?.defaultModel ?? "").trim();
    const groundWithLocalRecall = payload.groundWithLocalRecall !== false;
    const requestTimeoutMs = Number(status?.benchmarkTimeoutMs ?? DEFAULT_MODEL_LAB_OPENAI_TIMEOUT_MS);

    if (!prompt) {
      sendJson(res, 400, {
        ok: false,
        code: "PROMPT_REQUIRED",
        error: "prompt is required"
      });
      return;
    }

    if (!providerMeta?.available) {
      sendJson(res, 503, {
        ok: false,
        code: "PROVIDER_UNAVAILABLE",
        error: providerMeta?.reason ?? "The selected model provider is unavailable.",
        provider,
        status
      });
      return;
    }

    const recallRun = measureSync(() => recallSubjectSpace(db, {
      question: prompt,
      subjectId
    }));
    const recall = recallRun.result;
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall);

    const config = getOpenAiAssistStatus();
    if (!config.enabled) {
      sendJson(res, 503, {
        ok: false,
        code: "OPENAI_DISABLED",
        error: config.reason,
        provider,
        status
      });
      return;
    }

    let assistResult;
    const started = performance.now();
    try {
      assistResult = await runTimed("Model lab OpenAI draft", () => generateOpenAiSubjectAssist({
        question: prompt,
        subjectId,
        subjectLabel,
        recall,
        model,
        requestTimeoutMs
      }), {
        route: url.pathname,
        provider,
        question: previewQuestionForLogs(prompt),
        subjectId: subjectId || recall.matched?.subjectId || ""
      });
    } catch (error) {
      const normalizedError = buildApiErrorPayload(error, "Unable to run the selected OpenAI model.");
      if (isModelTestingUnavailableError(error)) {
        const unavailable = buildModelTestingUnavailablePayload({
          error,
          status,
          provider,
          providerMeta,
          model: model || config.model,
          question: prompt,
          recall,
          debug: createModelLabDebugEntry({
            mode: "draft",
            provider,
            providerLabel: providerMeta.label,
            model: model || config.model,
            question: prompt,
            requestPrompt: prompt,
            grounded: Boolean(recall.matched),
            localReady: Boolean(recall.ready),
            localLatencyMs: recallRun.latencyMs,
            error: normalizedError.payload.error
          }),
          localLatencyMs: recallRun.latencyMs
        });
        sendJson(res, unavailable.statusCode, unavailable.payload);
        return;
      }
      sendJson(res, normalizedError.statusCode, {
        ...normalizedError.payload,
        provider,
        recall,
        recallLatencyMs: recallRun.latencyMs,
        debug: createModelLabDebugEntry({
          mode: "draft",
          provider,
          providerLabel: providerMeta.label,
          model: model || config.model,
          question: prompt,
          requestPrompt: prompt,
          grounded: Boolean(recall.matched),
          localReady: Boolean(recall.ready),
          localLatencyMs: recallRun.latencyMs,
          error: normalizedError.payload.error
        })
      });
      return;
    }

    const suggestedConstruct = buildSuggestedConstructFromAssist({
      subjectId: subjectId || recall.matched?.subjectId || undefined,
      subjectLabel,
      assist: assistResult.assist,
      question: prompt,
      routingMode: recall.routing?.mode ?? "",
      model: assistResult.model ?? model ?? config.model
    });
    const usage = normalizeUsageMetrics(assistResult.usage);
    const answerText = [
      assistResult.assist?.rationale ?? "",
      assistResult.assist?.nextQuestion ? `Next question: ${assistResult.assist.nextQuestion}` : ""
    ].filter(Boolean).join("\n\n").trim() || `OpenAI returned a draft for ${suggestedConstruct.constructLabel}.`;
    const latencyMs = toLatencyMs(performance.now() - started);

    sendJson(res, 200, {
      ok: true,
      provider,
      prompt,
      grounded: Boolean(recall.matched),
      subjectId: recall.matched?.subjectId ?? subjectId,
      subjectLabel,
      recall,
      recallLatencyMs: recallRun.latencyMs,
      suggestedConstruct: hydrateConstructForClient(suggestedConstruct),
      model: {
        provider,
        providerLabel: providerMeta.label,
        label: "OpenAI assist",
        enabled: true,
        model: assistResult.model ?? config.model,
        latencyMs,
        output: answerText,
        answer: answerText,
        apiAction: assistResult.assist?.apiAction ?? null,
        usage,
        stats: usage,
        draft: hydrateConstructForClient(suggestedConstruct)
      },
      debug: createModelLabDebugEntry({
        mode: "draft",
        provider,
        providerLabel: providerMeta.label,
        model: assistResult.model ?? config.model,
        question: prompt,
        requestPrompt: prompt,
        responseText: answerText,
        constructLabel: suggestedConstruct.constructLabel,
        grounded: Boolean(recall.matched),
        localReady: Boolean(recall.ready),
        latencyMs,
        localLatencyMs: recallRun.latencyMs,
        promptMode: "subjectspace-assist"
      })
    });
    return;

  }

  if (url.pathname === "/api/model-lab/compare") {
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
      sendJson(res, 400, {
        ok: false,
        code: "QUESTION_REQUIRED",
        error: "question is required"
      });
      return;
    }

    const status = await buildModelLabStatusPayload();
    const provider = normalizeModelProvider(payload.provider, status);
    const providerMeta = findModelProvider(status, provider);
    const model = String(payload.model ?? providerMeta?.defaultModel ?? "").trim();
    const groundWithLocalRecall = payload.groundWithLocalRecall !== false;
    const requestTimeoutMs = Number(status?.benchmarkTimeoutMs ?? DEFAULT_MODEL_LAB_OPENAI_TIMEOUT_MS);
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
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall);

    if (!providerMeta?.available) {
      sendJson(res, 503, {
        ok: false,
        code: "PROVIDER_UNAVAILABLE",
        error: providerMeta?.reason ?? "The selected model provider is unavailable.",
        provider,
        prompts,
        recall
      });
      return;
    }

    let llm = {
      label: provider === "openai" ? "OpenAI assist round-trip" : "Selected model round-trip",
      enabled: true,
      provider,
      providerLabel: providerMeta.label,
      model,
      mode: "assist_round_trip",
      question: benchmarkQuestion,
      latencyMs: null,
      apiAction: null,
      constructLabel: null,
      promptTokens: prompts.benchmark.estimatedTokens,
      promptTokenSource: "estimate",
      outputTokens: null,
      totalTokens: null,
      reason: providerMeta.reason,
      error: null,
      output: ""
    };
    let debug = null;

    const config = getOpenAiAssistStatus();
    if (!config.enabled) {
      llm = {
        ...llm,
        enabled: false,
        reason: config.reason
      };
    } else {
      const started = performance.now();
      try {
        const assistResult = await runTimed("Model lab OpenAI compare", () => generateOpenAiSubjectAssist({
          question: benchmarkQuestion,
          subjectId,
          subjectLabel,
          recall,
          model,
          requestTimeoutMs
        }), {
          route: url.pathname,
          provider,
          question: previewQuestionForLogs(benchmarkQuestion),
          subjectId: subjectId || recall.matched?.subjectId || ""
        });
        const usage = normalizeUsageMetrics(assistResult.usage);
        const answerText = [
          assistResult.assist?.rationale ?? "",
          assistResult.assist?.nextQuestion ? `Next question: ${assistResult.assist.nextQuestion}` : ""
        ].filter(Boolean).join("\n\n").trim();

        llm = {
          ...llm,
          model: assistResult.model ?? config.model,
          latencyMs: toLatencyMs(performance.now() - started),
          apiAction: assistResult.assist?.apiAction ?? null,
          constructLabel: assistResult.assist?.constructLabel ?? null,
          promptTokens: usage?.inputTokens ?? llm.promptTokens,
          promptTokenSource: usage?.inputTokens ? "usage" : llm.promptTokenSource,
          outputTokens: usage?.outputTokens ?? null,
          totalTokens: usage?.totalTokens ?? null,
          output: answerText
        };
        debug = createModelLabDebugEntry({
          mode: "compare",
          provider,
          providerLabel: providerMeta.label,
          model: assistResult.model ?? config.model,
          question,
          requestPrompt: benchmarkQuestion,
          responseText: answerText,
          constructLabel: assistResult.assist?.constructLabel ?? "",
          grounded: false,
          localReady: Boolean(recall.ready),
          latencyMs: llm.latencyMs,
          localLatencyMs: local.latencyMs,
          promptMode: "subjectspace-assist"
        });
      } catch (error) {
        if (isModelTestingUnavailableError(error)) {
          const unavailableDebug = createModelLabDebugEntry({
            mode: "compare",
            provider,
            providerLabel: providerMeta.label,
            model: model || config.model,
            question,
            requestPrompt: benchmarkQuestion,
            localReady: Boolean(recall.ready),
            latencyMs: toLatencyMs(performance.now() - started),
            localLatencyMs: local.latencyMs,
            error: error instanceof Error ? error.message : String(error),
            promptMode: "subjectspace-assist"
          });
          const unavailable = buildModelTestingUnavailablePayload({
            error,
            status,
            provider,
            providerMeta,
            model: model || config.model,
            question,
            recall,
            prompts,
            debug: unavailableDebug,
            localLatencyMs: local.latencyMs
          });
          logEvent("warn", "Model lab compare unavailable", {
            route: url.pathname,
            provider,
            model: model || config.model,
            question: previewQuestionForLogs(question),
            error: unavailable.payload.error
          });
          sendJson(res, unavailable.statusCode, unavailable.payload);
          return;
        }
        llm = {
          ...llm,
          latencyMs: toLatencyMs(performance.now() - started),
          error: error instanceof Error ? error.message : String(error)
        };
        debug = createModelLabDebugEntry({
          mode: "compare",
          provider,
          providerLabel: providerMeta.label,
          model: model || config.model,
          question,
          requestPrompt: benchmarkQuestion,
          localReady: Boolean(recall.ready),
          latencyMs: llm.latencyMs,
          localLatencyMs: local.latencyMs,
          error: llm.error,
          promptMode: "subjectspace-assist"
        });
      }
    }

    logEvent("info", "Model lab compare completed", {
      route: url.pathname,
      provider,
      model: llm.model,
      localLatencyMs: local.latencyMs,
      llmLatencyMs: llm.latencyMs,
      question: previewQuestionForLogs(question),
      subjectId: recall.matched?.subjectId ?? subjectId ?? "",
      localReady: recall.ready
    });

    const resultPayload = {
      ok: true,
      provider,
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
        constructLabel: recall.matched?.constructLabel ?? null,
        answer: recall.answer
      },
      llm,
      comparison: buildSubjectspaceBenchmark(local.latencyMs, llm, prompts),
      recall,
      debug
    };
    persistBenchmarkReport(db, {
      ...resultPayload,
      mode: "compare",
      testLabel: payload.testLabel ?? payload.variantMode ?? "Manual benchmark"
    });
    sendJson(res, 200, resultPayload);
    return;
  }

  if (url.pathname === "/api/model-lab/reports") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, {
      ok: true,
      reports: buildBenchmarkReportsPayload(db, {
        recentLimit: Number(url.searchParams.get("recent") ?? 10) || 10,
        summaryLimit: Number(url.searchParams.get("summary") ?? 8) || 8
      })
    });
    return;
  }

  if (url.pathname === "/api/backend/overview") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, await buildBackendOverviewPayload(db));
    return;
  }

  if (url.pathname === "/api/subjectspace/dataset/health") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjectId = String(url.searchParams.get("subjectId") ?? url.searchParams.get("subject") ?? "").trim();
    sendJson(res, 200, {
      ok: true,
      subjectId: subjectId || null,
      health: auditSubjectDataset(db, {
        subjectId,
        maxIssues: Number(url.searchParams.get("maxIssues") ?? 10) || 10
      })
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/dataset/clean") {
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

    const subjectId = String(payload.subjectId ?? payload.subject ?? "").trim();
    const result = cleanSubjectDataset(db, {
      subjectId,
      maxIssues: Number(payload.maxIssues ?? 10) || 10
    });

    sendJson(res, 200, {
      ok: true,
      ...result
    });
    return;
  }

  if (url.pathname === "/api/backend/db/tables") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, {
      ok: true,
      tables: listBackendTableSummaries(db)
    });
    return;
  }

  if (url.pathname === "/api/backend/db/table") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const tableName = String(url.searchParams.get("table") ?? "").trim();
    if (!tableName) {
      sendJson(res, 400, {
        ok: false,
        code: "TABLE_REQUIRED",
        error: "table is required"
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      ...readBackendTable(db, tableName, {
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
        search: url.searchParams.get("search")
      })
    });
    return;
  }

  if (url.pathname === "/api/backend/db/row") {
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

    const tableName = String(payload.table ?? "").trim();
    const primaryKeyValue = String(payload.id ?? payload.primaryKeyValue ?? "").trim();
    const changes = payload.changes && typeof payload.changes === "object" ? payload.changes : {};

    if (!tableName) {
      sendJson(res, 400, {
        ok: false,
        code: "TABLE_REQUIRED",
        error: "table is required"
      });
      return;
    }

    if (!primaryKeyValue) {
      sendJson(res, 400, {
        ok: false,
        code: "ROW_ID_REQUIRED",
        error: "id is required"
      });
      return;
    }

    const updatedRow = updateBackendTableRow(db, tableName, primaryKeyValue, changes);
    sendJson(res, 200, {
      ok: true,
      table: tableName,
      row: {
        ...updatedRow,
        _editor: buildBackendRowMeta(tableName, updatedRow)
      }
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
    const constructs = listSubjectConstructs(db, subjectId).map((construct) => hydrateSubjectConstructWithRelations(db, construct));

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

  if (url.pathname === "/api/subjectspace/subject-ideas") {
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

    const description = String(payload.description ?? payload.input ?? "").trim();
    const requestedSubjectLabel = String(payload.subjectLabel ?? "").trim();

    if (!description) {
      sendJson(res, 400, { error: "description is required" });
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

    let result;
    try {
      result = await runTimed("Subjectspace subject mapper", () => generateOpenAiSubjectSuggestions({
        description,
        requestedSubjectLabel
      }), {
        route: url.pathname,
        subjectLabel: requestedSubjectLabel || "",
        description: previewQuestionForLogs(description)
      });
    } catch (error) {
      const normalizedError = buildApiErrorPayload(error, "Unable to generate suggested constructs for this subject.");
      sendJson(res, normalizedError.statusCode, {
        ...normalizedError.payload,
        config
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      source: "openai-subject-mapper",
      config: {
        ...config,
        model: result.model ?? config.model
      },
      requestedSubjectLabel,
      description,
      suggestions: result.suggestions,
      responseId: result.responseId,
      usage: result.usage ?? null
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
      sendJson(res, 400, {
        ok: false,
        code: "INPUT_REQUIRED",
        error: "input is required"
      });
      return;
    }

    const heuristicDraft = preserveBaseFieldsForExtension(baseConstruct, buildSubjectConstructDraftFromInput(input, {
      subjectId,
      subjectLabel: requestedSubjectLabel
    }), input);
    const mergeMode = baseConstruct ? "extend" : "draft";
    const checkedReferences = buildBuilderReferenceSet(db, {
      input,
      subjectId,
      subjectLabel: requestedSubjectLabel,
      baseConstruct
    });
    const buildChecks = buildBuilderChecks(checkedReferences);
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
        const assistResult = await runTimed("Subjectspace builder assist", () => generateOpenAiSubjectConstructBuilder({
          input,
          subjectId: heuristicConstruct.subjectId,
          subjectLabel: heuristicConstruct.subjectLabel,
          seedDraft: heuristicConstruct,
          references: checkedReferences
        }), {
          route: url.pathname,
          subjectId: heuristicConstruct.subjectId,
          input: previewQuestionForLogs(input)
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
        warning = buildApiErrorPayload(error, "OpenAI builder assist failed.").payload.error;
      }
    }

    sendJson(res, 200, {
      ok: true,
      source,
      input,
      mergeMode,
      buildChecks,
      checkedReferences,
      warning,
      promptMetrics: buildPromptMetrics(input),
      config,
      heuristicConstruct: hydrateConstructForClient(heuristicConstruct),
      assist,
      suggestedConstruct: hydrateConstructForClient(suggestedConstruct),
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
    const recallRun = measureSync(() => recallSubjectSpace(db, {
      question,
      subjectId
    }));
    const recall = recallRun.result;
    logEvent("info", "Subjectspace recall completed", {
      route: url.pathname,
      latencyMs: recallRun.latencyMs,
      question: previewQuestionForLogs(question),
      ready: recall.ready,
      subjectId: recall.matched?.subjectId ?? subjectId ?? ""
    });

    sendJson(res, 200, buildSubjectspaceAnswerPayload(recall, { question, subjectId, db }));
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
      construct: hydrateSubjectConstructWithRelations(db, saved),
      subjects: listSubjectSpaces(db),
      count: listSubjectConstructs(db, saved.subjectId).length
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/ingest-conversation") {
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

    const transcript = String(payload.transcript ?? "").trim();
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (!transcript && !messages.length) {
      sendJson(res, 400, { error: "transcript or messages is required" });
      return;
    }

    const drafts = ingestConversationToConstructs({
      transcript,
      messages,
      subjectId: String(payload.subjectId ?? "").trim(),
      subjectLabel: String(payload.subjectLabel ?? payload.subject ?? "").trim()
    });
    const savedConstructs = drafts.map((draft) => upsertSubjectConstruct(db, {
      ...draft,
      provenance: {
        ...(draft.provenance ?? {}),
        source: "conversation-ingest",
        learnedFromQuestion: transcript || messages.map((entry) => String(entry?.content ?? "").trim()).filter(Boolean).join("\n")
      }
    }));

    sendJson(res, 200, {
      ok: true,
      source: "conversation-ingest",
      count: savedConstructs.length,
      constructs: savedConstructs.map((construct) => hydrateSubjectConstructWithRelations(db, construct))
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
    const recallRun = measureSync(() => recallSubjectSpace(db, {
      question,
      subjectId
    }));
    const recall = recallRun.result;
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall, subjects);

    let assistResult;
    try {
      assistResult = await runTimed("Subjectspace assist", () => generateOpenAiSubjectAssist({
        parsed: { raw: question },
        subjectLabel
      }), {
        route: url.pathname,
        question: previewQuestionForLogs(question),
        subjectId: subjectId || recall.matched?.subjectId || ""
      });
    } catch (error) {
      const normalizedError = buildApiErrorPayload(error, "Unable to complete OpenAI assist.");
      sendJson(res, normalizedError.statusCode, {
        ...normalizedError.payload,
        config,
        recall,
        recallLatencyMs: recallRun.latencyMs
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
      recallLatencyMs: recallRun.latencyMs,
      assist: assistResult.assist,
      suggestedConstruct: hydrateConstructForClient(suggestedConstruct),
      savedConstruct: hydrateSubjectConstructWithRelations(db, savedConstruct),
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
        const assistResult = await runTimed("Subjectspace compare assist", () => generateOpenAiSubjectAssist({
          parsed: { raw: benchmarkQuestion },
          subjectLabel
        }), {
          route: url.pathname,
          question: previewQuestionForLogs(benchmarkQuestion),
          subjectId: subjectId || recall.matched?.subjectId || ""
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

    logEvent("info", "Subjectspace compare completed", {
      route: url.pathname,
      localLatencyMs: local.latencyMs,
      llmLatencyMs: llm.latencyMs,
      question: previewQuestionForLogs(question),
      subjectId: recall.matched?.subjectId ?? subjectId ?? "",
      localReady: recall.ready
    });

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

    const recallRun = measureSync(() => recallSubjectSpace(db, {
      question,
      subjectId
    }));
    const recall = recallRun.result;
    logEvent("info", "Subjectspace answer completed", {
      route: url.pathname,
      latencyMs: recallRun.latencyMs,
      question: previewQuestionForLogs(question),
      ready: recall.ready,
      subjectId: recall.matched?.subjectId ?? subjectId ?? ""
    });

    sendJson(res, 200, buildSubjectspaceAnswerPayload(recall, { question, subjectId, db }));
    return;
  }

  if (url.pathname === "/api/chat") {
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

    const message = String(payload.message ?? "").trim();
    const subjectId = String(payload.subjectId ?? "").trim();
    if (!message) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }

    const initialRecall = measureSync(() => recallSubjectSpace(db, {
      question: message,
      subjectId
    }));
    const recall = initialRecall.result;
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall);
    const conversationId = ensureChatConversation(db, {
      conversationId: String(payload.conversationId ?? "").trim(),
      subjectId: subjectId || recall.matched?.subjectId || "",
      title: buildConversationTitle(message, subjectLabel),
      metadata: {
        route: "/api/chat"
      }
    });

    appendChatMessage(db, {
      conversationId,
      role: "user",
      content: message,
      subjectId: subjectId || recall.matched?.subjectId || "",
      metadata: {
        routing: recall.routing?.mode ?? "",
        confidence: recall.readiness?.confidence ?? null
      }
    });

    const localAnswerIsSufficient = Boolean(recall.ready && recall.routing?.mode === "local_recall");
    if (localAnswerIsSufficient) {
      appendChatMessage(db, {
        conversationId,
        role: "assistant",
        content: recall.answer,
        subjectId: recall.matched?.subjectId ?? subjectId,
        constructId: recall.matched?.id ?? "",
        metadata: {
          source: "local"
        }
      });

      sendJson(res, 200, {
        ok: true,
        source: "local",
        conversationId,
        answer: recall.answer,
        construct: hydrateSubjectConstructWithRelations(db, recall.matched),
        recall,
        recallLatencyMs: initialRecall.latencyMs
      });
      return;
    }

    const config = getOpenAiAssistStatus();
    if (!config.enabled) {
      appendChatMessage(db, {
        conversationId,
        role: "assistant",
        content: recall.answer,
        subjectId: subjectId || recall.matched?.subjectId || "",
        metadata: {
          source: "local-only",
          unresolved: true
        }
      });

      sendJson(res, 200, {
        ok: true,
        source: "local-only",
        conversationId,
        answer: recall.answer,
        recall,
        recallLatencyMs: initialRecall.latencyMs,
        config
      });
      return;
    }

    let assistResult;
    try {
      assistResult = await runTimed("Subjectspace chat assist", () => generateOpenAiSubjectAssist({
        parsed: { raw: message },
        subjectLabel
      }), {
        route: url.pathname,
        question: previewQuestionForLogs(message),
        subjectId: subjectId || recall.matched?.subjectId || ""
      });
    } catch (error) {
      const normalizedError = buildApiErrorPayload(error, "Unable to complete AI chat assist.");
      sendJson(res, normalizedError.statusCode, {
        ...normalizedError.payload,
        conversationId,
        recall,
        config
      });
      return;
    }

    const suggestedConstruct = buildSuggestedConstructFromAssist({
      subjectId: subjectId || recall.matched?.subjectId || undefined,
      subjectLabel,
      assist: assistResult.assist,
      question: message,
      routingMode: recall.routing?.mode ?? ""
    });
    const chatMergeBase = chooseChatEnrichmentBase(db, recall, suggestedConstruct);
    const chatDraft = mergeChatConstructIntoLocalBase(chatMergeBase?.construct, suggestedConstruct, {
      source: "chatbot-derived",
      conversationId,
      chatbotDerived: true,
      responseId: assistResult.responseId,
      learnedFromQuestion: message,
      enrichmentScore: Number(chatMergeBase?.totalScore ?? 0),
      enrichmentTokenOverlap: Number(chatMergeBase?.tokenOverlap ?? 0),
      enrichmentStrandOverlap: Number(chatMergeBase?.strandOverlap ?? 0)
    });
    const savedConstruct = upsertSubjectConstruct(db, mergeSubjectConstruct(chatDraft, {
      provenance: {
        ...(chatDraft.provenance ?? {}),
        source: "chatbot-derived",
        conversationId,
        chatbotDerived: true
      }
    }, {
      preserveId: false,
      provenance: {
        ...(chatDraft.provenance ?? {}),
        source: "chatbot-derived",
        conversationId,
        chatbotDerived: true
      }
    }));
    const refreshedRecall = recallSubjectSpace(db, {
      question: message,
      subjectId: savedConstruct.subjectId
    });
    const answer = refreshedRecall.ready ? refreshedRecall.answer : (assistResult.assist?.notes ?? recall.answer);

    appendChatMessage(db, {
      conversationId,
      role: "assistant",
      content: answer,
      subjectId: savedConstruct.subjectId,
      constructId: savedConstruct.id,
      metadata: {
        source: "chatbot-derived",
        responseId: assistResult.responseId
      }
    });

    sendJson(res, 200, {
      ok: true,
      source: "chatbot-derived",
      conversationId,
      answer,
      recall: refreshedRecall,
      recallLatencyMs: initialRecall.latencyMs,
      assist: assistResult.assist,
      savedConstruct: hydrateSubjectConstructWithRelations(db, savedConstruct),
      responseId: assistResult.responseId,
      config: {
        ...config,
        model: assistResult.model ?? config.model
      }
    });
    return;
  }

  if (url.pathname === "/api/tts") {
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

    const text = String(payload.text ?? payload.message ?? "").trim();
    if (!text) {
      sendJson(res, 400, { error: "text is required" });
      return;
    }

    const voice = String(payload.voice ?? process.env.STRANDSPACE_TTS_VOICE ?? "alloy");
    const format = String(payload.format ?? "mp3");
    const provider = String(process.env.STRANDSPACE_TTS_PROVIDER ?? process.env.TTS_PROVIDER ?? "elevenlabs").trim();

    try {
      let audioBuffer;
      let mime = "audio/mpeg";

      if (provider === "elevenlabs") {
        audioBuffer = await synthesizeElevenLabs(text, voice, format);
        mime = format === "wav" ? "audio/wav" : "audio/mpeg";
      } else {
        sendJson(res, 501, { ok: false, error: "No TTS provider configured. Set STRANDSPACE_TTS_PROVIDER=elevenlabs and ELEVENLABS_API_KEY." });
        return;
      }

      // Return raw audio bytes
      sendBinary(res, 200, audioBuffer, mime);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 502, { ok: false, error: "TTS generation failed", details: message });
      return;
    }
  }

  if (url.pathname === "/api/chat/conversations") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjectId = String(url.searchParams.get("subjectId") ?? "").trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    try {
      const conversations = db.prepare(`
        SELECT 
          id, 
          subjectId, 
          title, 
          createdAt, 
          lastMessageAt, 
          (SELECT COUNT(*) FROM chat_messages WHERE conversationId = chat_conversations.id) as messageCount
        FROM chat_conversations
        WHERE subjectId = ? OR ? = ''
        ORDER BY lastMessageAt DESC
        LIMIT ? OFFSET ?
      `).all(subjectId, subjectId, limit, offset);

      const totalCount = db.prepare(`
        SELECT COUNT(*) as count FROM chat_conversations
        WHERE subjectId = ? OR ? = ''
      `).get(subjectId, subjectId)?.count ?? 0;

      sendJson(res, 200, {
        ok: true,
        conversations,
        totalCount,
        limit,
        offset
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (url.pathname.match(/^\/api\/chat\/history\/.+$/)) {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const conversationId = String(url.pathname.split("/").pop()).trim();
    if (!conversationId) {
      sendJson(res, 400, { error: "conversationId is required" });
      return;
    }

    try {
      const conversation = db.prepare(`
        SELECT id, subjectId, title, createdAt, lastMessageAt
        FROM chat_conversations
        WHERE id = ?
      `).get(conversationId) ?? null;
      const messages = db.prepare(`
        SELECT 
          id, 
          conversationId, 
          role, 
          content, 
          subjectId, 
          constructId, 
          metadataJson, 
          createdAt
        FROM chat_messages
        WHERE conversationId = ?
        ORDER BY createdAt ASC
      `).all(conversationId);

      if (!messages.length) {
        sendJson(res, 404, { ok: false, error: "Conversation not found" });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        conversationId,
        conversation,
        messages: messages.map(msg => ({
          ...msg,
          metadata: msg.metadataJson ? JSON.parse(msg.metadataJson) : null,
          metadataJson: undefined
        }))
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (url.pathname.match(/^\/api\/chat\/delete\/.+$/) && req.method === "POST") {
    const conversationId = String(url.pathname.split("/").pop()).trim();
    if (!conversationId) {
      sendJson(res, 400, { error: "conversationId is required" });
      return;
    }

    try {
      db.prepare("DELETE FROM chat_messages WHERE conversationId = ?").run(conversationId);
      db.prepare("DELETE FROM chat_conversations WHERE id = ?").run(conversationId);
      
      sendJson(res, 200, { ok: true, deleted: conversationId });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (url.pathname === "/api/soundspace" || url.pathname === "/api/soundspace/recall") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const question = String(url.searchParams.get("q") ?? "").trim();
    const recallRun = measureSync(() => recallSoundspace(db, question));
    const recall = recallRun.result;
    const musicEngineering = buildMusicEngineeringContext(db, question, recall);
    logEvent("info", "Soundspace recall completed", {
      route: url.pathname,
      latencyMs: recallRun.latencyMs,
      question: previewQuestionForLogs(question),
      ready: recall.ready,
      deviceModel: recall.matched?.deviceModel ?? ""
    });

    sendJson(res, 200, {
      ok: true,
      ...recall,
      ...musicEngineering,
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

    const persisted = persistSoundConstruct(db, {
      ...payload,
      provenance: {
        source: payload.provenance?.source ?? "manual-or-llm",
        learnedFromQuestion: payload.provenance?.learnedFromQuestion ?? payload.question ?? null
      }
    });
    const preview = summarizeSoundConstruct(String(payload.question ?? "").trim(), persisted.soundConstruct);

    sendJson(res, 200, {
      ok: true,
      construct: persisted.soundConstruct,
      linkedSubjectConstruct: hydrateConstructForClient(persisted.linkedSubjectConstruct),
      preview,
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
    const reviewBeforeStore = payload.reviewBeforeStore === true;
    const forceAssist = payload.forceAssist === true;

    const recallRun = measureSync(() => recallSoundspace(db, question));
    const recalled = recallRun.result;
    const preferAssistForQuery = Boolean(recalled.readiness?.prefersAssist && payload.preferApi !== false);
    const shouldUseStoredConstruct = !payload.forceGenerate
      && !forceAssist
      && recalled.ready
      && recalled.matched
      && !preferAssistForQuery
      && ["use_strandspace", "use_strandspace_combined"].includes(recalled.recommendation);

    if (shouldUseStoredConstruct) {
      logEvent("info", "Soundspace answer returned stored construct", {
        route: url.pathname,
        latencyMs: recallRun.latencyMs,
        question: previewQuestionForLogs(question),
        deviceModel: recalled.matched?.deviceModel ?? ""
      });
      sendJson(res, 200, {
        ...soundConstructAnswerPayload("strandspace", question, recalled.matched, recalled),
        ...buildMusicEngineeringContext(db, question, recalled)
      });
      return;
    }

    let generated;
    try {
      generated = buildSoundConstructFromQuestion(question, {
        provider: payload.provider ?? "heuristic-llm",
        model: payload.model ?? "soundspace-template-v1",
        baseConstruct: (recalled.ready || (recalled.parsed?.deviceModel && recalled.matched))
          ? selectSoundspaceBaseConstruct(recalled)
          : null
      });
    } catch (error) {
      if (recalled.searchGuidance || recalled.answer) {
        sendJson(res, 200, {
          ok: true,
          source: "search-guidance",
          question,
          answer: recalled.answer ?? (error instanceof Error ? error.message : String(error)),
          construct: recalled.matched ?? null,
          recall: recalled,
          ...buildMusicEngineeringContext(db, question, recalled)
        });
        return;
      }

      sendJson(res, 422, {
        error: error instanceof Error ? error.message : String(error),
        recall: recalled
      });
      return;
    }

    let source = "generated-and-stored";
    const config = getOpenAiAssistStatus();
    if (payload.preferApi !== false && config.enabled) {
      try {
        const assisted = await runTimed("Soundspace assist", () => generateOpenAiSoundConstructBuilder({
          question,
          recall: recalled,
          seedConstruct: generated
        }), {
          route: url.pathname,
          question: previewQuestionForLogs(question),
          deviceModel: generated.deviceModel ?? recalled.matched?.deviceModel ?? ""
        });

        generated = {
          ...generated,
          ...assisted.construct,
          provenance: {
            source: "openai-responses",
            model: assisted.model ?? config.model,
            learnedFromQuestion: question,
            derivedFromConstructId: generated?.provenance?.derivedFromConstructId ?? recalled.matched?.id ?? null
          }
        };
        source = "openai-generated-and-stored";
      } catch {
        // Fall back to the local heuristic construct when API refinement is unavailable.
      }
    }

    if (reviewBeforeStore) {
      const reviewSource = source === "openai-generated-and-stored" ? "openai-proposal" : "generated-proposal";
      const review = buildSoundProposalReview(
        question,
        generated,
        recalled,
        reviewSource,
        selectSoundspaceBaseConstruct(recalled) ?? recalled.matched ?? null
      );
      const proposalRecall = {
        question,
        parsed: review.parsed,
        ready: review.canLearn,
        matched: generated,
        candidates: recalled.candidates,
        clarification: recalled.clarification ?? null,
        focusedSetup: review.focusedSetup,
        focusKeys: review.focusKeys,
        answer: review.answerPreview,
        recommendation: review.canLearn ? "review_before_store" : "needs_more_information",
        readiness: {
          ...recalled.readiness,
          requiresReview: true,
          missingInformationCount: review.missingInformation.length
        }
      };

      sendJson(res, 200, {
        ok: true,
        needsReview: true,
        review,
        source: reviewSource,
        question,
        answer: review.summary,
        construct: generated,
        recall: proposalRecall
      });
      return;
    }

    const persisted = persistSoundConstruct(db, generated);
    const refreshedRun = measureSync(() => recallSoundspace(db, question));
    const refreshed = refreshedRun.result;
    logEvent("info", "Soundspace answer completed", {
      route: url.pathname,
      recallLatencyMs: recallRun.latencyMs,
      refreshedLatencyMs: refreshedRun.latencyMs,
      question: previewQuestionForLogs(question),
      source,
      deviceModel: persisted.soundConstruct?.deviceModel ?? ""
    });
    sendJson(res, 200, {
      ...soundConstructAnswerPayload(source, question, persisted.soundConstruct, refreshed),
      linkedSubjectConstruct: hydrateConstructForClient(persisted.linkedSubjectConstruct),
      ...buildMusicEngineeringContext(db, question, refreshed)
    });
    return;
  }

  sendText(res, 404, "Not found");
  } finally {
    requestState.complete();
  }
}

function registerGracefulShutdown(server) {
  if (shutdownRegistered) {
    return;
  }

  shutdownRegistered = true;

  async function handleShutdown(signal = "SIGTERM") {
    if (shutdownInProgress) {
      return;
    }

    shutdownInProgress = true;
    logEvent("info", "Shutdown signal received", {
      signal
    });

    const forceExitTimer = setTimeout(() => {
      logEvent("warn", "Forced shutdown after grace period elapsed", {
        signal,
        graceMs: SHUTDOWN_GRACE_MS
      });
      closeMemoryDatabase();
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceExitTimer.unref?.();

    server.close(() => {
      clearTimeout(forceExitTimer);
      closeMemoryDatabase();
      logEvent("info", "HTTP server closed cleanly", {
        signal
      });
      process.exit(0);
    });
  }

  process.on("SIGINT", () => {
    void handleShutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM");
  });
}

export async function createApp() {
  databasePath = await resolveDatabasePath();
  openMemoryDatabase();
  const assistStatus = getOpenAiAssistStatus();
  logEvent("info", "Database path selected", {
    databasePath,
    remoteAllowed: isRemoteAccessAllowed()
  });
  logEvent(assistStatus.enabled ? "info" : "warn", assistStatus.enabled ? "OpenAI assist enabled" : "OpenAI assist disabled", {
    model: assistStatus.model,
    timeoutMs: assistStatus.timeoutMs,
    reason: assistStatus.reason
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendText(res, 400, "Missing request URL");
        return;
      }

      assertLocalhostRequest(req);
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
      const isApiRequest = Boolean(req.url && new URL(req.url, "http://localhost").pathname.startsWith("/api/"));
      const { statusCode, payload } = buildApiErrorPayload(error, "Internal server error");
      logEvent("warn", "Unhandled request error", {
        route: req.url ?? "",
        error: error instanceof Error ? error.message : String(error)
      });

      if (isApiRequest) {
        sendJson(res, statusCode, payload);
        return;
      }

      sendJson(res, 500, {
        ok: false,
        error: "Internal server error",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  });

  server.requestTimeout = LOCAL_MODEL_API_TIMEOUT_MS + 5000;
  server.headersTimeout = LOCAL_MODEL_API_TIMEOUT_MS + 7000;
  server.keepAliveTimeout = 5000;

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await createApp();
  registerGracefulShutdown(server);

  server.listen(port, () => {
    logEvent("info", "Strandspace backend running", {
      port,
      url: `http://localhost:${port}`
    });
  });
}
