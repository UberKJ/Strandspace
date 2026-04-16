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

let database = null;
let databasePath = "";

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
    String(construct.id ?? ""),
    String(construct.name ?? ""),
    construct.deviceBrand ? String(construct.deviceBrand) : null,
    construct.deviceModel ? String(construct.deviceModel) : null,
    construct.deviceType ? String(construct.deviceType) : null,
    construct.sourceType ? String(construct.sourceType) : null,
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
  return database;
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
        const assistResult = await generateOpenAiSubjectConstructBuilder({
          input,
          subjectId: heuristicConstruct.subjectId,
          subjectLabel: heuristicConstruct.subjectLabel,
          seedDraft: heuristicConstruct,
          references: checkedReferences
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
  console.log(`Using Strandspace database at ${databasePath}`);

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
