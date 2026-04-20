import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";
import { buildConstructRelevanceSummary } from "./trace.js";
import { computeConstructSimilarity, LINK_SIMILARITY_THRESHOLD, MERGE_SIMILARITY_THRESHOLD } from "./score.js";
import {
  clamp,
  clampConfidence,
  derivePersistentStrandDescriptors,
  extractConstructConcepts,
  humanize,
  mergeSubjectConstruct,
  normalizeArray,
  normalizeBinderPair,
  normalizeConstruct,
  normalizeRelatedConstructIds,
  safeJsonParse,
  slugify,
  uniqueValues,
  buildConstructLinkId,
  buildStrandBinderId
} from "./normalize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const defaultSubjectSeedsPath = join(__dirname, "..", "data", "subject-seeds.json");
export const releaseSubjectSeedsPath = join(__dirname, "..", "data", "release-subject-seeds.json");

function fromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    constructLabel: row.constructLabel,
    target: row.target,
    objective: row.objective,
    context: safeJsonParse(row.contextJson, {}),
    steps: safeJsonParse(row.stepsJson, []),
    notes: row.notes,
    tags: safeJsonParse(row.tagsJson, []),
    strands: safeJsonParse(row.strandsJson, []),
    relatedConstructIds: normalizeRelatedConstructIds(safeJsonParse(row.relatedConstructIdsJson, []), row.id),
    parentConstructId: String(row.parentConstructId ?? "").trim() || null,
    branchReason: String(row.branchReason ?? "").trim() || null,
    changeSummary: String(row.changeSummary ?? "").trim() || null,
    variantType: String(row.variantType ?? "").trim() || null,
    provenance: safeJsonParse(row.provenanceJson, null),
    learnedCount: Number(row.learnedCount ?? 1),
    updatedAt: row.updatedAt
  };
}

function binderFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    subjectId: row.subjectId || "",
    leftTerm: row.leftTerm,
    rightTerm: row.rightTerm,
    weight: Number(row.weight ?? 0),
    reason: row.reason || "",
    source: row.source || "manual",
    updatedAt: row.updatedAt
  };
}

function linkFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sourceConstructId: row.sourceConstructId,
    relatedConstructId: row.relatedConstructId,
    score: Number(row.score ?? 0),
    reason: row.reason || "",
    detail: safeJsonParse(row.detailJson, {}),
    updatedAt: row.updatedAt
  };
}

function subjectStrandFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    subjectId: row.subjectId,
    strandKey: row.strandKey,
    label: row.label,
    normalizedLabel: row.normalizedLabel,
    layer: row.layer,
    role: row.role,
    weight: Number(row.weight ?? 0),
    confidence: Number(row.confidence ?? 0),
    source: row.source || "derived",
    usageCount: Number(row.usageCount ?? 0),
    constructCount: Number(row.constructCount ?? 0),
    lastUsedAt: row.lastUsedAt || null,
    provenance: safeJsonParse(row.provenanceJson, null),
    updatedAt: row.updatedAt
  };
}

function constructStrandFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    constructId: row.constructId,
    subjectId: row.subjectId,
    strandId: row.strandId,
    strandKey: row.strandKey,
    label: row.label || humanize(String(row.strandKey ?? "").replace(/[:_]/g, " ")),
    normalizedLabel: row.normalizedLabel || normalizeText(row.label || row.strandKey),
    layer: row.layer,
    role: row.role,
    weight: Number(row.weight ?? 0),
    confidence: Number(row.confidence ?? 0),
    source: row.source || "derived",
    usageCount: Number(row.usageCount ?? 0),
    constructCount: Number(row.constructCount ?? 0),
    lastUsedAt: row.lastUsedAt || null,
    updatedAt: row.updatedAt
  };
}

export function ensureSubjectspaceTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subject_constructs (
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
      relatedConstructIdsJson TEXT,
      parentConstructId TEXT,
      branchReason TEXT,
      changeSummary TEXT,
      variantType TEXT,
      learnedCount INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_subject ON subject_constructs(subjectId, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_label ON subject_constructs(constructLabel);
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_updated ON subject_constructs(updatedAt DESC);
    CREATE TABLE IF NOT EXISTS strand_binders (
      id TEXT PRIMARY KEY,
      subjectId TEXT NOT NULL DEFAULT '',
      leftTerm TEXT NOT NULL,
      rightTerm TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0,
      reason TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_strand_binders_pair ON strand_binders(subjectId, leftTerm, rightTerm);
    CREATE INDEX IF NOT EXISTS idx_strand_binders_subject ON strand_binders(subjectId, updatedAt DESC);
    CREATE TABLE IF NOT EXISTS construct_links (
      id TEXT PRIMARY KEY,
      sourceConstructId TEXT NOT NULL,
      relatedConstructId TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      reason TEXT,
      detailJson TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_construct_links_pair ON construct_links(sourceConstructId, relatedConstructId);
    CREATE INDEX IF NOT EXISTS idx_construct_links_source ON construct_links(sourceConstructId, score DESC);
    CREATE TABLE IF NOT EXISTS subject_strands (
      id TEXT PRIMARY KEY,
      subjectId TEXT NOT NULL,
      strandKey TEXT NOT NULL,
      label TEXT NOT NULL,
      normalizedLabel TEXT NOT NULL,
      layer TEXT NOT NULL DEFAULT 'anchor',
      role TEXT NOT NULL DEFAULT 'feature',
      weight REAL NOT NULL DEFAULT 1,
      confidence REAL NOT NULL DEFAULT 0.72,
      source TEXT NOT NULL DEFAULT 'derived',
      usageCount INTEGER NOT NULL DEFAULT 0,
      constructCount INTEGER NOT NULL DEFAULT 0,
      lastUsedAt TEXT,
      provenanceJson TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_strands_subject_key ON subject_strands(subjectId, strandKey);
    CREATE INDEX IF NOT EXISTS idx_subject_strands_subject_usage ON subject_strands(subjectId, usageCount DESC, constructCount DESC, updatedAt DESC);
    CREATE TABLE IF NOT EXISTS construct_strands (
      id TEXT PRIMARY KEY,
      constructId TEXT NOT NULL,
      subjectId TEXT NOT NULL,
      strandId TEXT NOT NULL,
      strandKey TEXT NOT NULL,
      layer TEXT NOT NULL DEFAULT 'anchor',
      role TEXT NOT NULL DEFAULT 'feature',
      weight REAL NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'derived',
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_construct_strands_pair ON construct_strands(constructId, strandId);
    CREATE INDEX IF NOT EXISTS idx_construct_strands_construct ON construct_strands(constructId, weight DESC, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_construct_strands_subject ON construct_strands(subjectId, updatedAt DESC);
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      subjectId TEXT,
      title TEXT,
      metadataJson TEXT,
      createdAt TEXT NOT NULL,
      lastMessageAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(lastMessageAt DESC);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      subjectId TEXT,
      constructId TEXT,
      metadataJson TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversationId, createdAt ASC);
    CREATE TABLE IF NOT EXISTS strandspace_benchmark_history (
      id TEXT PRIMARY KEY,
      subjectId TEXT,
      subjectLabel TEXT,
      question TEXT,
      benchmarkQuestion TEXT,
      matchedConstructId TEXT,
      matchedConstructLabel TEXT,
      routeMode TEXT,
      localLatencyMs REAL,
      assistLatencyMs REAL,
      estimatedOriginalTokens INTEGER,
      estimatedCompactTokens INTEGER,
      estimatedSavings INTEGER,
      apiTotalTokens INTEGER,
      confidence REAL,
      margin REAL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_strandspace_benchmark_history_created ON strandspace_benchmark_history(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_strandspace_benchmark_history_subject ON strandspace_benchmark_history(subjectId, createdAt DESC);
  `);

  const columns = db.prepare("PRAGMA table_info(subject_constructs)").all();
  const existingColumns = new Set(columns.map((column) => column.name));
  const additions = [
    ["relatedConstructIdsJson", "TEXT"],
    ["parentConstructId", "TEXT"],
    ["branchReason", "TEXT"],
    ["changeSummary", "TEXT"],
    ["variantType", "TEXT"]
  ];

  for (const [columnName, columnType] of additions) {
    if (!existingColumns.has(columnName)) {
      db.exec(`ALTER TABLE subject_constructs ADD COLUMN ${columnName} ${columnType};`);
    }
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_subject_constructs_parent ON subject_constructs(parentConstructId, updatedAt DESC);");
}

export function seedSubjectspace(db, filePath = defaultSubjectSeedsPath) {
  ensureSubjectspaceTables(db);
  const count = Number(db.prepare("SELECT COUNT(*) as count FROM subject_constructs").get().count ?? 0);
  if (count > 0) {
    return count;
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  for (const item of raw) {
    upsertSubjectConstruct(db, {
      ...item,
      provenance: {
        source: "seed",
        importedFrom: filePath
      }
    });
  }

  return Number(db.prepare("SELECT COUNT(*) as count FROM subject_constructs").get().count ?? 0);
}

export function listSubjectSpaces(db) {
  ensureSubjectspaceTables(db);

  return db.prepare(`
    SELECT
      subjectId,
      subjectLabel,
      COUNT(*) as constructCount,
      MAX(updatedAt) as updatedAt
    FROM subject_constructs
    GROUP BY subjectId, subjectLabel
    ORDER BY subjectLabel ASC
  `).all().map((row) => ({
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    constructCount: Number(row.constructCount ?? 0),
    updatedAt: row.updatedAt,
    descriptor: `${row.subjectLabel} memory field`
  }));
}

export function listSubjectConstructs(db, subjectId = "") {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const query = normalizedSubjectId
    ? db.prepare("SELECT * FROM subject_constructs WHERE subjectId = ? ORDER BY updatedAt DESC, constructLabel ASC")
    : db.prepare("SELECT * FROM subject_constructs ORDER BY subjectLabel ASC, updatedAt DESC, constructLabel ASC");
  const rows = normalizedSubjectId ? query.all(normalizedSubjectId) : query.all();
  return rows.map(fromRow);
}

export function getSubjectConstruct(db, id) {
  ensureSubjectspaceTables(db);
  return fromRow(db.prepare("SELECT * FROM subject_constructs WHERE id = ?").get(String(id)));
}

export function listSubjectStrands(db, subjectId = "", options = {}) {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const limit = Number(options.limit ?? 100) || 100;
  const rows = normalizedSubjectId
    ? db.prepare(`
      SELECT * FROM subject_strands
      WHERE subjectId = ?
      ORDER BY usageCount DESC, constructCount DESC, updatedAt DESC, label ASC
      LIMIT ?
    `).all(normalizedSubjectId, limit)
    : db.prepare(`
      SELECT * FROM subject_strands
      ORDER BY subjectId ASC, usageCount DESC, constructCount DESC, updatedAt DESC, label ASC
      LIMIT ?
    `).all(limit);
  return rows.map(subjectStrandFromRow);
}

export function listConstructStrands(db, constructId = "", options = {}) {
  ensureSubjectspaceTables(db);
  const normalizedConstructId = String(constructId ?? "").trim();
  const limit = Number(options.limit ?? 100) || 100;
  const rows = normalizedConstructId
    ? db.prepare(`
      SELECT cs.*, ss.label, ss.normalizedLabel, ss.confidence, ss.usageCount, ss.constructCount, ss.lastUsedAt, ss.provenanceJson
      FROM construct_strands cs
      LEFT JOIN subject_strands ss ON ss.id = cs.strandId
      WHERE cs.constructId = ?
      ORDER BY cs.weight DESC, cs.updatedAt DESC, cs.layer ASC
      LIMIT ?
    `).all(normalizedConstructId, limit)
    : db.prepare(`
      SELECT cs.*, ss.label, ss.normalizedLabel, ss.confidence, ss.usageCount, ss.constructCount, ss.lastUsedAt, ss.provenanceJson
      FROM construct_strands cs
      LEFT JOIN subject_strands ss ON ss.id = cs.strandId
      ORDER BY cs.updatedAt DESC, cs.weight DESC
      LIMIT ?
    `).all(limit);
  return rows.map(constructStrandFromRow);
}

export function listStrandBinders(db, subjectId = "", options = {}) {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const includeGlobal = options.includeGlobal !== false;

  let rows = [];
  if (normalizedSubjectId && includeGlobal) {
    rows = db.prepare(`
      SELECT * FROM strand_binders
      WHERE subjectId = ? OR subjectId = ''
      ORDER BY subjectId DESC, ABS(weight) DESC, updatedAt DESC
    `).all(normalizedSubjectId);
  } else if (normalizedSubjectId) {
    rows = db.prepare(`
      SELECT * FROM strand_binders
      WHERE subjectId = ?
      ORDER BY ABS(weight) DESC, updatedAt DESC
    `).all(normalizedSubjectId);
  } else {
    rows = db.prepare(`
      SELECT * FROM strand_binders
      ORDER BY subjectId ASC, ABS(weight) DESC, updatedAt DESC
    `).all();
  }

  return rows.map(binderFromRow);
}

export function upsertStrandBinder(db, payload = {}) {
  ensureSubjectspaceTables(db);
  const pair = normalizeBinderPair(payload.leftTerm, payload.rightTerm);
  if (!pair) {
    return null;
  }

  const subjectId = String(payload.subjectId ?? "").trim();
  const source = String(payload.source ?? "manual").trim() || "manual";
  const updatedAt = new Date().toISOString();
  const id = String(payload.id ?? buildStrandBinderId(subjectId, pair[0], pair[1])).trim();
  const weight = Number(clamp(Number(payload.weight ?? 0), -12, 12).toFixed(2));
  const existing = db.prepare(`
    SELECT * FROM strand_binders
    WHERE subjectId = ? AND leftTerm = ? AND rightTerm = ?
  `).get(subjectId, pair[0], pair[1]);

  const nextWeight = existing && String(existing.source ?? "") === "derived" && source === "derived"
    ? Math.max(Number(existing.weight ?? 0), weight)
    : weight;
  const nextReason = String(payload.reason ?? existing?.reason ?? "").trim();

  db.prepare(`
    INSERT INTO strand_binders (id, subjectId, leftTerm, rightTerm, weight, reason, source, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subjectId = excluded.subjectId,
      leftTerm = excluded.leftTerm,
      rightTerm = excluded.rightTerm,
      weight = excluded.weight,
      reason = excluded.reason,
      source = excluded.source,
      updatedAt = excluded.updatedAt
  `).run(
    id,
    subjectId,
    pair[0],
    pair[1],
    nextWeight,
    nextReason || null,
    source,
    updatedAt
  );

  return binderFromRow(db.prepare("SELECT * FROM strand_binders WHERE id = ?").get(id));
}

export function listConstructLinks(db, constructId = "") {
  ensureSubjectspaceTables(db);
  const normalizedConstructId = String(constructId ?? "").trim();
  const rows = normalizedConstructId
    ? db.prepare(`
      SELECT * FROM construct_links
      WHERE sourceConstructId = ?
      ORDER BY score DESC, updatedAt DESC
    `).all(normalizedConstructId)
    : db.prepare(`
      SELECT * FROM construct_links
      ORDER BY updatedAt DESC, score DESC
    `).all();

  return rows.map(linkFromRow);
}

function createDatasetIssueCounter() {
  return {
    missingTarget: 0,
    missingObjective: 0,
    missingSteps: 0,
    missingContext: 0,
    missingTags: 0,
    missingNotes: 0,
    lowAnchorVariety: 0,
    orphanRelatedIds: 0,
    duplicateLabels: 0,
    thinConstructs: 0
  };
}

function computeDatasetAuditFromConstructs(constructs = [], options = {}) {
  const rows = Array.isArray(constructs) ? constructs.map((construct) => normalizeConstruct(construct)) : [];
  const byId = new Map(rows.map((construct) => [construct.id, construct]));
  const labelBuckets = new Map();
  const issueCounts = createDatasetIssueCounter();
  const maxIssues = Math.max(3, Number(options.maxIssues ?? 10) || 10);

  for (const construct of rows) {
    const labelKey = `${construct.subjectId}::${normalizeText(construct.constructLabel)}`;
    const bucket = labelBuckets.get(labelKey) ?? [];
    bucket.push(construct.id);
    labelBuckets.set(labelKey, bucket);
  }

  const duplicateIds = new Set(
    [...labelBuckets.values()]
      .filter((bucket) => bucket.length > 1)
      .flatMap((bucket) => bucket)
  );

  const constructsWithIssues = rows.map((construct) => {
    const relevance = buildConstructRelevanceSummary(construct);
    const issues = [...(relevance.issues ?? [])];
    const orphanRelatedIds = normalizeRelatedConstructIds(construct.relatedConstructIds, construct.id)
      .filter((relatedId) => !byId.has(relatedId));

    if (!construct.target) {
      issueCounts.missingTarget += 1;
    }
    if (!construct.objective) {
      issueCounts.missingObjective += 1;
    }
    if (!construct.steps?.length) {
      issueCounts.missingSteps += 1;
    }
    if (!Object.keys(construct.context ?? {}).length) {
      issueCounts.missingContext += 1;
    }
    if (!construct.tags?.length) {
      issueCounts.missingTags += 1;
    }
    if (!construct.notes) {
      issueCounts.missingNotes += 1;
    }
    if ((relevance.anchors ?? []).length < 4) {
      issueCounts.lowAnchorVariety += 1;
    }
    if (relevance.status === "thin") {
      issueCounts.thinConstructs += 1;
    }
    if (orphanRelatedIds.length) {
      issueCounts.orphanRelatedIds += orphanRelatedIds.length;
      issues.push(`Broken related links: ${orphanRelatedIds.join(", ")}`);
    }
    if (duplicateIds.has(construct.id)) {
      issueCounts.duplicateLabels += 1;
      issues.push("Duplicate construct label inside the same subject");
    }

    return {
      id: construct.id,
      subjectId: construct.subjectId,
      subjectLabel: construct.subjectLabel,
      constructLabel: construct.constructLabel,
      target: construct.target,
      objective: construct.objective,
      relevance,
      orphanRelatedIds,
      issues: uniqueValues(issues)
    };
  });

  const totalScore = constructsWithIssues.reduce((sum, construct) => sum + Number(construct.relevance?.score ?? 0), 0);
  const averageRelevanceScore = rows.length ? Number((totalScore / rows.length).toFixed(1)) : 0;
  const issuePenalty = Math.min(
    55,
    (issueCounts.missingTarget * 3)
      + (issueCounts.missingObjective * 3)
      + (issueCounts.missingSteps * 5)
      + (issueCounts.missingContext * 4)
      + (issueCounts.missingTags * 3)
      + (issueCounts.missingNotes * 2)
      + (issueCounts.lowAnchorVariety * 2)
      + (issueCounts.orphanRelatedIds * 2)
      + (issueCounts.duplicateLabels * 4)
      + (issueCounts.thinConstructs * 3)
  );
  const releaseReadinessScore = rows.length
    ? Number(clamp(Math.round(averageRelevanceScore - (issuePenalty / Math.max(rows.length, 1))), 0, 100))
    : 0;

  return {
    subjectId: String(options.subjectId ?? "").trim() || null,
    constructCount: rows.length,
    averageRelevanceScore,
    releaseReadinessScore,
    status: rows.length === 0
      ? "empty"
      : releaseReadinessScore >= 75
        ? "release-ready"
        : releaseReadinessScore >= 55
          ? "review"
          : "repair",
    issueCounts,
    flaggedConstructs: constructsWithIssues
      .filter((construct) => construct.issues.length)
      .sort((left, right) => {
        const issueDelta = right.issues.length - left.issues.length;
        if (issueDelta !== 0) {
          return issueDelta;
        }
        return Number(left.relevance?.score ?? 0) - Number(right.relevance?.score ?? 0);
      })
      .slice(0, maxIssues)
  };
}

export function auditSubjectDataset(db, { subjectId = "", maxIssues = 10 } = {}) {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const constructs = listSubjectConstructs(db, normalizedSubjectId);
  return computeDatasetAuditFromConstructs(constructs, {
    subjectId: normalizedSubjectId,
    maxIssues
  });
}

export function auditSubjectSeedFile(filePath = defaultSubjectSeedsPath, options = {}) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const constructs = Array.isArray(raw) ? raw : [];
  return {
    filePath,
    ...computeDatasetAuditFromConstructs(constructs, {
      subjectId: String(options.subjectId ?? "").trim(),
      maxIssues: options.maxIssues ?? 8
    })
  };
}

export function cleanSubjectDataset(db, { subjectId = "", maxIssues = 10 } = {}) {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const constructs = listSubjectConstructs(db, normalizedSubjectId);
  const knownIds = new Set(constructs.map((construct) => construct.id));
  const startedAt = new Date().toISOString();
  let normalizedCount = 0;
  let repairedRelatedCount = 0;

  for (const construct of constructs) {
    const cleanedRelatedIds = normalizeRelatedConstructIds(construct.relatedConstructIds, construct.id)
      .filter((relatedId) => knownIds.has(relatedId));
    const cleaned = normalizeConstruct({
      ...construct,
      relatedConstructIds: cleanedRelatedIds,
      provenance: {
        ...(construct.provenance ?? {}),
        datasetCleanedAt: startedAt,
        datasetCleaned: true
      }
    });

    const changed = JSON.stringify({
      subjectLabel: cleaned.subjectLabel,
      constructLabel: cleaned.constructLabel,
      target: cleaned.target,
      objective: cleaned.objective,
      context: cleaned.context,
      steps: cleaned.steps,
      notes: cleaned.notes,
      tags: cleaned.tags,
      strands: cleaned.strands,
      relatedConstructIds: cleaned.relatedConstructIds
    }) !== JSON.stringify({
      subjectLabel: construct.subjectLabel,
      constructLabel: construct.constructLabel,
      target: construct.target,
      objective: construct.objective,
      context: construct.context ?? {},
      steps: construct.steps ?? [],
      notes: construct.notes ?? "",
      tags: construct.tags ?? [],
      strands: construct.strands ?? [],
      relatedConstructIds: construct.relatedConstructIds ?? []
    });

    if (construct.relatedConstructIds?.length !== cleanedRelatedIds.length) {
      repairedRelatedCount += Math.max(0, Number(construct.relatedConstructIds?.length ?? 0) - cleanedRelatedIds.length);
    }

    if (!changed) {
      refreshSubjectConstructRelations(db, construct.id);
      continue;
    }

    upsertSubjectConstruct(db, {
      ...construct,
      ...cleaned,
      provenance: {
        ...(construct.provenance ?? {}),
        ...(cleaned.provenance ?? {}),
        datasetCleanedAt: startedAt,
        datasetCleaned: true
      }
    });
    normalizedCount += 1;
  }

  return {
    ok: true,
    subjectId: normalizedSubjectId || null,
    cleanedAt: startedAt,
    normalizedCount,
    repairedRelatedCount,
    constructCount: constructs.length,
    health: auditSubjectDataset(db, {
      subjectId: normalizedSubjectId,
      maxIssues
    })
  };
}

function saveConstructLink(db, payload = {}) {
  ensureSubjectspaceTables(db);
  const sourceConstructId = String(payload.sourceConstructId ?? "").trim();
  const relatedConstructId = String(payload.relatedConstructId ?? "").trim();
  if (!sourceConstructId || !relatedConstructId || sourceConstructId === relatedConstructId) {
    return null;
  }

  const id = buildConstructLinkId(sourceConstructId, relatedConstructId);
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO construct_links (id, sourceConstructId, relatedConstructId, score, reason, detailJson, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sourceConstructId = excluded.sourceConstructId,
      relatedConstructId = excluded.relatedConstructId,
      score = excluded.score,
      reason = excluded.reason,
      detailJson = excluded.detailJson,
      updatedAt = excluded.updatedAt
  `).run(
    id,
    sourceConstructId,
    relatedConstructId,
    Number(payload.score ?? 0),
    String(payload.reason ?? "").trim() || null,
    JSON.stringify(payload.detail ?? {}),
    updatedAt
  );

  return linkFromRow(db.prepare("SELECT * FROM construct_links WHERE id = ?").get(id));
}

function syncPersistentStrandsForConstruct(db, construct = null) {
  const record = normalizeConstruct(construct ?? {});
  if (!record?.id || !record.subjectId) {
    return [];
  }

  const updatedAt = new Date().toISOString();
  const descriptors = derivePersistentStrandDescriptors(record, {
    limit: 24
  });

  db.prepare("DELETE FROM construct_strands WHERE constructId = ?").run(record.id);

  for (const descriptor of descriptors) {
    const existing = db.prepare(`
      SELECT * FROM subject_strands
      WHERE subjectId = ? AND strandKey = ?
    `).get(record.subjectId, descriptor.strandKey);

    const nextLabel = String(existing?.label ?? descriptor.label ?? "").trim() || humanize(descriptor.strandKey);
    const nextWeight = Number(Math.max(
      Number(existing?.weight ?? 0),
      Number(descriptor.weight ?? 0)
    ).toFixed(2));
    const nextConfidence = clampConfidence(
      Math.max(
        Number(existing?.confidence ?? 0),
        Number(descriptor.confidence ?? 0)
      ),
      descriptor.confidence
    );
    const nextLayer = String(existing?.source ?? "") === "manual"
      ? String(existing?.layer ?? descriptor.layer ?? "anchor")
      : String(descriptor.layer ?? existing?.layer ?? "anchor");
    const nextRole = String(existing?.source ?? "") === "manual"
      ? String(existing?.role ?? descriptor.role ?? "feature")
      : String(descriptor.role ?? existing?.role ?? "feature");
    const nextSource = String(existing?.source ?? descriptor.source ?? "derived").trim() || "derived";
    const nextProvenance = {
      ...(safeJsonParse(existing?.provenanceJson, {}) ?? {}),
      ...(descriptor.provenance ?? {})
    };

    db.prepare(`
      INSERT INTO subject_strands (
        id, subjectId, strandKey, label, normalizedLabel, layer, role, weight, confidence,
        source, usageCount, constructCount, lastUsedAt, provenanceJson, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subjectId = excluded.subjectId,
        strandKey = excluded.strandKey,
        label = excluded.label,
        normalizedLabel = excluded.normalizedLabel,
        layer = excluded.layer,
        role = excluded.role,
        weight = excluded.weight,
        confidence = excluded.confidence,
        source = excluded.source,
        usageCount = COALESCE(subject_strands.usageCount, 0),
        constructCount = COALESCE(subject_strands.constructCount, 0),
        lastUsedAt = COALESCE(subject_strands.lastUsedAt, excluded.lastUsedAt),
        provenanceJson = excluded.provenanceJson,
        updatedAt = excluded.updatedAt
    `).run(
      descriptor.id,
      record.subjectId,
      descriptor.strandKey,
      nextLabel,
      normalizeText(nextLabel),
      nextLayer,
      nextRole,
      nextWeight,
      nextConfidence,
      nextSource,
      Number(existing?.usageCount ?? 0),
      Number(existing?.constructCount ?? 0),
      existing?.lastUsedAt ?? null,
      Object.keys(nextProvenance).length ? JSON.stringify(nextProvenance) : null,
      updatedAt
    );

    db.prepare(`
      INSERT INTO construct_strands (
        id, constructId, subjectId, strandId, strandKey, layer, role, weight, source, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        constructId = excluded.constructId,
        subjectId = excluded.subjectId,
        strandId = excluded.strandId,
        strandKey = excluded.strandKey,
        layer = excluded.layer,
        role = excluded.role,
        weight = excluded.weight,
        source = excluded.source,
        updatedAt = excluded.updatedAt
    `).run(
      `construct-strand:${record.id}:${slugify(descriptor.strandKey)}`,
      record.id,
      record.subjectId,
      descriptor.id,
      descriptor.strandKey,
      descriptor.layer,
      descriptor.role,
      Number(descriptor.weight ?? 1),
      String(descriptor.source ?? "derived").trim() || "derived",
      updatedAt
    );
  }

  db.prepare(`
    UPDATE subject_strands
    SET constructCount = (
      SELECT COUNT(*)
      FROM construct_strands
      WHERE construct_strands.strandId = subject_strands.id
    )
    WHERE subjectId = ?
  `).run(record.subjectId);

  db.prepare(`
    DELETE FROM subject_strands
    WHERE subjectId = ?
      AND source = 'derived'
      AND COALESCE(constructCount, 0) <= 0
  `).run(record.subjectId);

  return listConstructStrands(db, record.id);
}

function touchConstructStrands(db, constructId = "") {
  const normalizedConstructId = String(constructId ?? "").trim();
  if (!normalizedConstructId) {
    return;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(`
    UPDATE subject_strands
    SET usageCount = COALESCE(usageCount, 0) + 1,
        lastUsedAt = ?,
        updatedAt = ?
    WHERE id IN (
      SELECT strandId
      FROM construct_strands
      WHERE constructId = ?
    )
  `).run(updatedAt, updatedAt, normalizedConstructId);
}

function syncDerivedBindersForConstruct(db, record = {}) {
  const terms = extractConstructConcepts(record, { limit: 8 });
  for (let index = 0; index < terms.length; index += 1) {
    for (let pointer = index + 1; pointer < terms.length; pointer += 1) {
      const pair = normalizeBinderPair(terms[index], terms[pointer]);
      if (!pair) {
        continue;
      }

      const existing = db.prepare(`
        SELECT * FROM strand_binders
        WHERE subjectId = ? AND leftTerm = ? AND rightTerm = ?
      `).get(record.subjectId, pair[0], pair[1]);
      if (existing && String(existing.source ?? "").trim() !== "derived") {
        continue;
      }

      const weight = pair[0].includes(" ") || pair[1].includes(" ") ? 1.7 : 1.1;
      upsertStrandBinder(db, {
        subjectId: record.subjectId,
        leftTerm: pair[0],
        rightTerm: pair[1],
        weight,
        reason: `derived:${record.constructLabel}`,
        source: "derived"
      });
    }
  }
}

function syncConstructLinksForRecord(db, record = {}) {
  if (!record?.id || !record?.subjectId) {
    return [];
  }

  const relatedConstructs = listSubjectConstructs(db, record.subjectId).filter((candidate) => candidate.id !== record.id);
  const binders = listStrandBinders(db, record.subjectId);
  db.prepare("DELETE FROM construct_links WHERE sourceConstructId = ? OR relatedConstructId = ?").run(record.id, record.id);

  const savedLinks = [];
  for (const candidate of relatedConstructs) {
    const similarity = computeConstructSimilarity(record, candidate, binders);
    if (similarity.score < LINK_SIMILARITY_THRESHOLD) {
      continue;
    }

    savedLinks.push(saveConstructLink(db, {
      sourceConstructId: record.id,
      relatedConstructId: candidate.id,
      score: similarity.score,
      reason: similarity.reason,
      detail: similarity.detail
    }));
    savedLinks.push(saveConstructLink(db, {
      sourceConstructId: candidate.id,
      relatedConstructId: record.id,
      score: similarity.score,
      reason: similarity.reason,
      detail: similarity.detail
    }));
  }

  return savedLinks.filter(Boolean);
}

export function refreshSubjectConstructRelations(db, constructOrId = null) {
  ensureSubjectspaceTables(db);
  const record = typeof constructOrId === "string"
    ? getSubjectConstruct(db, constructOrId)
    : normalizeConstruct(constructOrId ?? {});

  if (!record?.id) {
    return null;
  }

  syncDerivedBindersForConstruct(db, record);
  syncPersistentStrandsForConstruct(db, record);
  syncConstructLinksForRecord(db, record);
  return getSubjectConstruct(db, record.id);
}

function selectMergeCandidate(db, record = {}, options = {}) {
  if (!record?.subjectId) {
    return null;
  }

  const candidates = listSubjectConstructs(db, record.subjectId).filter((candidate) => candidate.id !== record.id);
  if (!candidates.length) {
    return null;
  }

  const binders = listStrandBinders(db, record.subjectId);
  let strongest = null;
  for (const candidate of candidates) {
    const similarity = computeConstructSimilarity(record, candidate, binders);
    if (similarity.score < Number(options.threshold ?? MERGE_SIMILARITY_THRESHOLD)) {
      continue;
    }

    if (!strongest || similarity.score > strongest.similarity.score) {
      strongest = {
        construct: candidate,
        similarity
      };
    }
  }

  return strongest;
}

function normalizeCueValue(value) {
  return normalizeText(String(value ?? "")).trim();
}

function normalizeCueSet(values = []) {
  const set = new Set();
  for (const value of values) {
    const normalized = normalizeCueValue(value);
    if (normalized) {
      set.add(normalized);
    }
  }
  return set;
}

function intersectionValues(left = new Set(), right = new Set(), limit = 8) {
  const hits = [];
  for (const value of left) {
    if (right.has(value)) {
      hits.push(value);
      if (hits.length >= limit) {
        break;
      }
    }
  }
  return hits;
}

function differenceValues(left = new Set(), right = new Set(), limit = 8) {
  const misses = [];
  for (const value of left) {
    if (!right.has(value)) {
      misses.push(value);
      if (misses.length >= limit) {
        break;
      }
    }
  }
  return misses;
}

function analyzeConstructBranching(base = {}, candidate = {}) {
  const baseRecord = normalizeConstruct(base ?? {});
  const nextRecord = normalizeConstruct(candidate ?? {});

  const baseConcepts = normalizeCueSet(extractConstructConcepts(baseRecord, { limit: 18 }));
  const nextConcepts = normalizeCueSet(extractConstructConcepts(nextRecord, { limit: 18 }));
  const baseTags = normalizeCueSet(normalizeArray(baseRecord.tags));
  const nextTags = normalizeCueSet(normalizeArray(nextRecord.tags));
  const baseSteps = normalizeCueSet(normalizeArray(baseRecord.steps));
  const nextSteps = normalizeCueSet(normalizeArray(nextRecord.steps));

  const baseContextEntries = Object.entries(baseRecord.context ?? {}).map(([key, value]) => `${key}:${value}`);
  const nextContextEntries = Object.entries(nextRecord.context ?? {}).map(([key, value]) => `${key}:${value}`);
  const baseContext = normalizeCueSet(baseContextEntries);
  const nextContext = normalizeCueSet(nextContextEntries);

  const stableConcepts = intersectionValues(baseConcepts, nextConcepts, 6);
  const stableTags = intersectionValues(baseTags, nextTags, 6);
  const stableSteps = intersectionValues(baseSteps, nextSteps, 4);
  const stableContext = intersectionValues(baseContext, nextContext, 4);

  const missingConcepts = differenceValues(baseConcepts, nextConcepts, 6);
  const missingTags = differenceValues(baseTags, nextTags, 6);
  const missingSteps = differenceValues(baseSteps, nextSteps, 4);
  const missingContext = differenceValues(baseContext, nextContext, 4);

  const changedContext = [];
  const baseContextMap = new Map(Object.entries(baseRecord.context ?? {}).map(([key, value]) => [normalizeCueValue(key), normalizeCueValue(value)]));
  const nextContextMap = new Map(Object.entries(nextRecord.context ?? {}).map(([key, value]) => [normalizeCueValue(key), normalizeCueValue(value)]));
  for (const [key, baseValue] of baseContextMap.entries()) {
    if (!key || !nextContextMap.has(key)) {
      continue;
    }
    const nextValue = nextContextMap.get(key);
    if (baseValue && nextValue && baseValue !== nextValue) {
      changedContext.push(key);
      if (changedContext.length >= 4) {
        break;
      }
    }
  }

  const changedFields = [];
  if (normalizeCueValue(baseRecord.target) && normalizeCueValue(nextRecord.target) && normalizeCueValue(baseRecord.target) !== normalizeCueValue(nextRecord.target)) {
    changedFields.push("target");
  }
  if (normalizeCueValue(baseRecord.objective) && normalizeCueValue(nextRecord.objective) && normalizeCueValue(baseRecord.objective) !== normalizeCueValue(nextRecord.objective)) {
    changedFields.push("objective");
  }

  const stableCount = stableConcepts.length + stableTags.length + stableSteps.length + stableContext.length;
  const missingCount = missingConcepts.length + missingTags.length + missingSteps.length + missingContext.length;
  const changedCount = changedContext.length + changedFields.length;

  const severity = (changedCount >= 2 || (changedCount >= 1 && missingCount >= 4))
    ? "branch_worthy"
    : "minor";

  const summaryParts = [];
  if (changedFields.length || changedContext.length) {
    summaryParts.push(`Changed: ${[...changedFields, ...changedContext.map((key) => `context:${key}`)].slice(0, 4).join(", ")}`);
  }
  if (missingTags.length || missingContext.length || missingSteps.length) {
    const missingBuckets = [
      ...missingTags.slice(0, 3).map((tag) => `tag:${tag}`),
      ...missingContext.slice(0, 2).map((entry) => `context:${entry.split(":")[0]}`),
      ...missingSteps.slice(0, 1).map(() => "step")
    ];
    if (missingBuckets.length) {
      summaryParts.push(`Missing: ${missingBuckets.slice(0, 5).join(", ")}`);
    }
  }

  return {
    severity,
    counts: {
      stable: stableCount,
      missing: missingCount,
      changed: changedCount
    },
    stableCues: {
      concepts: stableConcepts,
      tags: stableTags
    },
    changedCues: {
      fields: changedFields,
      contextKeys: changedContext
    },
    missingCues: {
      concepts: missingConcepts,
      tags: missingTags
    },
    summary: summaryParts.join(" | ") || "No significant construct differences detected."
  };
}

function buildVariantConstructId(db, parent = {}, candidate = {}) {
  const baseId = String(parent?.id ?? "").trim() || String(candidate?.id ?? "").trim() || `construct-${Date.now().toString(36)}`;
  const labelSlug = slugify(String(candidate?.constructLabel ?? "variant")).slice(0, 64);
  const prefix = `${baseId}--${labelSlug || "variant"}`.replace(/--+/g, "--");

  let counter = 1;
  let id = `${prefix}-v${counter}`;
  while (getSubjectConstruct(db, id)) {
    counter += 1;
    id = `${prefix}-v${counter}`;
    if (counter > 200) {
      id = `${baseId}--variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      break;
    }
  }

  return id;
}

export function upsertSubjectConstruct(db, payload = {}) {
  ensureSubjectspaceTables(db);
  const explicitId = Boolean(String(payload.id ?? "").trim());
  const normalized = normalizeConstruct(payload);
  const mergeCandidate = explicitId ? null : selectMergeCandidate(db, normalized);
  const branching = mergeCandidate ? analyzeConstructBranching(mergeCandidate.construct, normalized) : null;
  const record = mergeCandidate && branching?.severity === "branch_worthy"
    ? normalizeConstruct({
      ...normalized,
      id: buildVariantConstructId(db, mergeCandidate.construct, normalized),
      parentConstructId: mergeCandidate.construct.id,
      branchReason: `branch_worthy:${mergeCandidate.similarity.reason}`,
      changeSummary: branching.summary,
      variantType: "branch_worthy",
      provenance: {
        ...(normalized.provenance ?? {}),
        branchedFromConstructId: mergeCandidate.construct.id,
        branchScore: mergeCandidate.similarity.score,
        branchReason: mergeCandidate.similarity.reason
      }
    })
    : (mergeCandidate
      ? mergeSubjectConstruct(mergeCandidate.construct, normalized, {
        preserveId: true,
        provenance: {
          ...(mergeCandidate.construct.provenance ?? {}),
          ...(normalized.provenance ?? {}),
          mergedIntoConstructId: mergeCandidate.construct.id,
          mergeReason: mergeCandidate.similarity.reason,
          mergeScore: mergeCandidate.similarity.score
        }
      })
      : normalized);
  const existing = getSubjectConstruct(db, record.id);
  const updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO subject_constructs (
      id, subjectId, subjectLabel, constructLabel, target, objective, contextJson,
      stepsJson, notes, tagsJson, strandsJson, provenanceJson, relatedConstructIdsJson,
      parentConstructId, branchReason, changeSummary, variantType,
      learnedCount, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      relatedConstructIdsJson = excluded.relatedConstructIdsJson,
      parentConstructId = excluded.parentConstructId,
      branchReason = excluded.branchReason,
      changeSummary = excluded.changeSummary,
      variantType = excluded.variantType,
      learnedCount = excluded.learnedCount,
      updatedAt = excluded.updatedAt
  `).run(
    record.id,
    record.subjectId,
    record.subjectLabel,
    record.constructLabel,
    record.target,
    record.objective,
    JSON.stringify(record.context ?? {}),
    JSON.stringify(record.steps ?? []),
    record.notes || null,
    JSON.stringify(record.tags ?? []),
    JSON.stringify(record.strands ?? []),
    record.provenance ? JSON.stringify(record.provenance) : null,
    record.relatedConstructIds?.length ? JSON.stringify(record.relatedConstructIds) : null,
    record.parentConstructId ? String(record.parentConstructId) : null,
    record.branchReason ? String(record.branchReason) : null,
    record.changeSummary ? String(record.changeSummary) : null,
    record.variantType ? String(record.variantType) : null,
    Number(existing?.learnedCount ?? 0) + 1,
    updatedAt
  );

  const saved = getSubjectConstruct(db, record.id);
  return refreshSubjectConstructRelations(db, saved);
}

function buildBenchmarkHistoryId() {
  return `bench-history-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function saveStrandspaceBenchmarkHistory(db, payload = {}) {
  ensureSubjectspaceTables(db);
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO strandspace_benchmark_history (
      id,
      subjectId,
      subjectLabel,
      question,
      benchmarkQuestion,
      matchedConstructId,
      matchedConstructLabel,
      routeMode,
      localLatencyMs,
      assistLatencyMs,
      estimatedOriginalTokens,
      estimatedCompactTokens,
      estimatedSavings,
      apiTotalTokens,
      confidence,
      margin,
      createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    buildBenchmarkHistoryId(),
    String(payload.subjectId ?? "").trim() || null,
    String(payload.subjectLabel ?? "").trim() || null,
    String(payload.question ?? "").trim() || null,
    String(payload.benchmarkQuestion ?? "").trim() || null,
    String(payload.matchedConstructId ?? "").trim() || null,
    String(payload.matchedConstructLabel ?? "").trim() || null,
    String(payload.routeMode ?? "").trim() || null,
    Number.isFinite(Number(payload.localLatencyMs)) ? Number(payload.localLatencyMs) : null,
    Number.isFinite(Number(payload.assistLatencyMs)) ? Number(payload.assistLatencyMs) : null,
    Number.isFinite(Number(payload.estimatedOriginalTokens)) ? Math.round(Number(payload.estimatedOriginalTokens)) : null,
    Number.isFinite(Number(payload.estimatedCompactTokens)) ? Math.round(Number(payload.estimatedCompactTokens)) : null,
    Number.isFinite(Number(payload.estimatedSavings)) ? Math.round(Number(payload.estimatedSavings)) : null,
    Number.isFinite(Number(payload.apiTotalTokens)) ? Math.round(Number(payload.apiTotalTokens)) : null,
    Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : null,
    Number.isFinite(Number(payload.margin)) ? Number(payload.margin) : null,
    createdAt
  );

  return createdAt;
}

export function listStrandspaceBenchmarkHistory(db, options = {}) {
  ensureSubjectspaceTables(db);
  const limit = Math.max(1, Math.min(Number(options.limit ?? 25) || 25, 200));
  const normalizedSubjectId = String(options.subjectId ?? "").trim();

  const rows = normalizedSubjectId
    ? db.prepare(`
      SELECT * FROM strandspace_benchmark_history
      WHERE subjectId = ?
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(normalizedSubjectId, limit)
    : db.prepare(`
      SELECT * FROM strandspace_benchmark_history
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(limit);

  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId || "",
    subjectLabel: row.subjectLabel || "",
    question: row.question || "",
    benchmarkQuestion: row.benchmarkQuestion || "",
    matchedConstructId: row.matchedConstructId || "",
    matchedConstructLabel: row.matchedConstructLabel || "",
    routeMode: row.routeMode || "",
    localLatencyMs: Number.isFinite(Number(row.localLatencyMs)) ? Number(row.localLatencyMs) : null,
    assistLatencyMs: Number.isFinite(Number(row.assistLatencyMs)) ? Number(row.assistLatencyMs) : null,
    estimatedOriginalTokens: Number.isFinite(Number(row.estimatedOriginalTokens)) ? Number(row.estimatedOriginalTokens) : null,
    estimatedCompactTokens: Number.isFinite(Number(row.estimatedCompactTokens)) ? Number(row.estimatedCompactTokens) : null,
    estimatedSavings: Number.isFinite(Number(row.estimatedSavings)) ? Number(row.estimatedSavings) : null,
    apiTotalTokens: Number.isFinite(Number(row.apiTotalTokens)) ? Number(row.apiTotalTokens) : null,
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
    margin: Number.isFinite(Number(row.margin)) ? Number(row.margin) : null,
    createdAt: row.createdAt
  }));
}


export {
  touchConstructStrands
};
