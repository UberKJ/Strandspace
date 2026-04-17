import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basename, dirname, extname, isAbsolute, join, normalize } from "node:path";
import { readdirSync } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
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
  buildSubjectBenchmarkQuestionCandidates,
  buildSubjectConstructDraftFromInput,
  estimateTextTokens,
  ensureSubjectspaceTables,
  getSubjectConstruct,
  mergeSubjectConstruct,
  listSubjectConstructs,
  listSubjectSpaces,
  recallSubjectSpace,
  seedSubjectspace,
  upsertSubjectConstruct
} from "./strandspace/subjectspace.js";
import {
  buildSuggestedConstructFromAssist,
  generateOpenAiSoundConstructBuilder,
  generateOpenAiSubjectConstructBuilder,
  generateOpenAiSubjectAssist,
  getOpenAiAssistStatus
} from "./strandspace/openai-assist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const docsDir = join(__dirname, "docs");
const configuredDatabasePath = String(process.env.STRANDSPACE_DB_PATH ?? "").trim();
const dataDir = join(__dirname, "data");
const preferredDatabasePath = join(__dirname, "data", "strandspace.sqlite");
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
const SHUTDOWN_GRACE_MS = 10000;
const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
const API_TIMEOUTS_MS = new Map([
  ["/api/subjectspace/build", EXTENDED_API_TIMEOUT_MS],
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
    }
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


export function sanitizeLegacyProvenance(provenance = null) {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    return null;
  }

  const sanitized = Object.fromEntries(
    Object.entries(provenance)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .filter(([key, value]) => !(key === "audience" && String(value).trim().toLowerCase() === "gardener"))
  );

  return Object.keys(sanitized).length ? sanitized : null;
}

function upsertMigratedSubjectConstruct(targetDb, construct = {}) {
  ensureSubjectspaceTables(targetDb);
  const provenance = sanitizeLegacyProvenance(construct.provenance);

  targetDb.prepare(`
    INSERT INTO subject_constructs (
      id, subjectId, subjectLabel, constructLabel, target, objective, contextJson,
      stepsJson, notes, tagsJson, strandsJson, provenanceJson, learnedCount, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subjectId = excluded.subjectId,
      subjectLabel = excluded.subjectLabel,
      constructLabel = excluded.constructLabel,
      target = excluded.target,
      objective = excluded.objective,
      contextJson = excluded.contextJson,
      stepsJson = excluded.stepsJson,
      notes = excluded.notes,
      tagsJson = excluded.tagsJson,
      strandsJson = excluded.strandsJson,
      provenanceJson = excluded.provenanceJson,
      learnedCount = excluded.learnedCount,
      updatedAt = excluded.updatedAt
  `).run(
    String(construct.id ?? ""),
    String(construct.subjectId ?? ""),
    String(construct.subjectLabel ?? ""),
    String(construct.constructLabel ?? ""),
    construct.target ? String(construct.target) : null,
    construct.objective ? String(construct.objective) : null,
    JSON.stringify(construct.context ?? {}),
    JSON.stringify(Array.isArray(construct.steps) ? construct.steps : []),
    construct.notes ? String(construct.notes) : null,
    JSON.stringify(Array.isArray(construct.tags) ? construct.tags : []),
    JSON.stringify(Array.isArray(construct.strands) ? construct.strands : []),
    provenance ? JSON.stringify(provenance) : null,
    Math.max(Number(construct.learnedCount ?? 1) || 1, 1),
    String(construct.updatedAt ?? new Date().toISOString())
  );
}

function upsertMigratedSoundConstruct(targetDb, construct = {}) {
  ensureSoundspaceTables(targetDb);
  const provenance = sanitizeLegacyProvenance(construct.provenance);

  targetDb.prepare(`
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
    String(construct.id ?? ""),
    String(construct.name ?? ""),
    construct.deviceBrand ? String(construct.deviceBrand) : null,
    construct.deviceModel ? String(construct.deviceModel) : null,
    construct.deviceType ? String(construct.deviceType) : null,
    construct.sourceType ? String(construct.sourceType) : null,
    construct.sourceBrand ? String(construct.sourceBrand) : null,
    construct.sourceModel ? String(construct.sourceModel) : null,
    construct.presetSystem ? String(construct.presetSystem) : null,
    construct.presetCategory ? String(construct.presetCategory) : null,
    construct.presetName ? String(construct.presetName) : null,
    construct.goal ? String(construct.goal) : null,
    construct.venueSize ? String(construct.venueSize) : null,
    construct.eventType ? String(construct.eventType) : null,
    construct.speakerConfig ? String(construct.speakerConfig) : null,
    JSON.stringify(construct.setup ?? {}),
    JSON.stringify(Array.isArray(construct.tags) ? construct.tags : []),
    JSON.stringify(Array.isArray(construct.strands) ? construct.strands : []),
    construct.llmSummary ? String(construct.llmSummary) : null,
    provenance ? JSON.stringify(provenance) : null,
    Math.max(Number(construct.learnedCount ?? 1) || 1, 1),
    String(construct.updatedAt ?? new Date().toISOString())
  );
}

function countConstructs(db) {
  ensureSubjectspaceTables(db);
  ensureSoundspaceTables(db);

  const subjectCount = Number(db.prepare("SELECT COUNT(*) as count FROM subject_constructs").get().count ?? 0);
  const soundCount = Number(db.prepare("SELECT COUNT(*) as count FROM sound_constructs").get().count ?? 0);

  return {
    subjectCount,
    soundCount
  };
}

async function listLegacyDatabaseCandidates() {
  try {
    return (await readdir(dataDir))
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
  } catch {
    return [];
  }
}

export function migrateLegacyDatabase(sourcePath, targetPath = preferredDatabasePath) {
  const sourceDb = new DatabaseSync(sourcePath);
  const targetDb = new DatabaseSync(targetPath);

  try {
    targetDb.exec("PRAGMA journal_mode = WAL;");
    ensureSubjectspaceTables(targetDb);
    ensureSoundspaceTables(targetDb);

    const subjectConstructs = listSubjectConstructs(sourceDb);
    const soundConstructs = listSoundConstructs(sourceDb);

    targetDb.exec("BEGIN");

    try {
      for (const construct of subjectConstructs) {
        upsertMigratedSubjectConstruct(targetDb, construct);
      }

      for (const construct of soundConstructs) {
        upsertMigratedSoundConstruct(targetDb, construct);
      }

      targetDb.exec("COMMIT");
    } catch (error) {
      try {
        targetDb.exec("ROLLBACK");
      } catch {
        // Best effort rollback.
      }
      throw error;
    }

    return {
      subjectCount: subjectConstructs.length,
      soundCount: soundConstructs.length
    };
  } finally {
    try {
      sourceDb.close();
    } catch {
      // Database may already be closed.
    }

    try {
      targetDb.close();
    } catch {
      // Database may already be closed.
    }
  }
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
  const hydratedConstruct = hydrateConstructForClient(recall.matched);

  return {
    ok: true,
    source: recall.ready ? "strandspace" : "unresolved",
    question,
    subjectId: hydratedConstruct?.subjectId ?? recall.matched?.subjectId ?? subjectId,
    answer: recall.answer,
    construct: hydratedConstruct,
    recall: {
      ...recall,
      matched: hydratedConstruct
    }
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

  let preferredExists = false;
  try {
    await access(preferredDatabasePath);
    preferredExists = true;
  } catch {
    preferredExists = false;
  }

  const legacyCandidates = await listLegacyDatabaseCandidates();
  const legacyPath = legacyCandidates[0] ? join(dataDir, legacyCandidates[0]) : "";

  if (preferredExists) {
    try {
      const preferredDb = new DatabaseSync(preferredDatabasePath);
      const counts = countConstructs(preferredDb);
      preferredDb.close();

      if (counts.subjectCount === 0 && counts.soundCount === 0 && legacyPath) {
        const migrated = migrateLegacyDatabase(legacyPath, preferredDatabasePath);
        console.log(
          `Migrated Strandspace data to ${preferredDatabasePath} from ${legacyPath} (${migrated.subjectCount} subject, ${migrated.soundCount} sound).`
        );
      }
    } catch {
      // If inspection fails, keep the preferred database path and let normal startup surface any issue.
    }

    databasePath = preferredDatabasePath;
    return databasePath;
  }

  if (legacyPath) {
    const migrated = migrateLegacyDatabase(legacyPath, preferredDatabasePath);
    console.log(
      `Migrated Strandspace data to ${preferredDatabasePath} from ${legacyPath} (${migrated.subjectCount} subject, ${migrated.soundCount} sound).`
    );
  }

  databasePath = preferredDatabasePath;
  return databasePath;
}

function resolvePublicPath(pathname = "") {
  if (pathname === "/" || pathname === "/builder" || pathname === "/builder/") {
    return "/index.html";
  }

  if (pathname === "/studio" || pathname === "/studio/") {
    return "/studio/index.html";
  }

  if (pathname === "/soundspace" || pathname === "/soundspace/") {
    return "/soundspace/index.html";
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

  targetDb.exec("BEGIN");
  try {
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

  if (url.pathname === "/api/subjectspace/library") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjectId = url.searchParams.get("subjectId") ?? url.searchParams.get("subject") ?? "";
    const constructs = listSubjectConstructs(db, subjectId).map((construct) => hydrateConstructForClient(construct));

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
      construct: hydrateConstructForClient(saved),
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
    const recallRun = measureSync(() => recallSubjectSpace(db, {
      question,
      subjectId
    }));
    const recall = recallRun.result;
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall, subjects);

    let assistResult;
    try {
      assistResult = await runTimed("Subjectspace assist", () => generateOpenAiSubjectAssist({
        question,
        subjectId,
        subjectLabel,
        recall
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
      savedConstruct: hydrateConstructForClient(savedConstruct),
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
          question: benchmarkQuestion,
          subjectId,
          subjectLabel,
          recall
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
  await resolveDatabasePath();
  openMemoryDatabase();
  const assistStatus = getOpenAiAssistStatus();
  logEvent("info", "Database path selected", {
    databasePath
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

  server.requestTimeout = EXTENDED_API_TIMEOUT_MS + 3000;
  server.headersTimeout = EXTENDED_API_TIMEOUT_MS + 5000;
  server.keepAliveTimeout = 5000;

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await createApp();
  registerGracefulShutdown(server);

  server.listen(port, () => {
    logEvent("info", "Strandspace Studio running", {
      port,
      url: `http://localhost:${port}`
    });
  });
}
