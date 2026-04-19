import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { access, readdir, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  ensureSubjectspaceTables,
  listSubjectConstructs
} from "../strandspace/subjectspace.js";
import {
  ensureSoundspaceTables,
  listSoundConstructs
} from "../strandspace/soundspace.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configuredDatabasePath = String(process.env.STRANDSPACE_DB_PATH ?? "").trim();
const dataDir = join(__dirname, "..", "data");
const preferredDatabasePath = join(dataDir, "strandspace.sqlite");

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
      stepsJson, notes, tagsJson, strandsJson, provenanceJson, relatedConstructIdsJson, learnedCount, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    Array.isArray(construct.relatedConstructIds) && construct.relatedConstructIds.length
      ? JSON.stringify(construct.relatedConstructIds)
      : null,
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

export function getDatabasePath() {
  if (!databasePath) {
    throw new Error("Database path has not been resolved yet.");
  }
  return databasePath;
}

export async function resolveDatabasePath() {
  if (databasePath) {
    return databasePath;
  }

  if (configuredDatabasePath) {
    if (isAbsolute(configuredDatabasePath)) {
      databasePath = configuredDatabasePath;
    } else {
      databasePath = join(__dirname, "..", configuredDatabasePath);
    }

    try {
      await stat(databasePath);
    } catch {
      // Database file may not exist yet.
    }

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
      const subjectCount = Number(preferredDb.prepare("SELECT COUNT(*) as count FROM subject_constructs").get().count ?? 0);
      const soundCount = Number(preferredDb.prepare("SELECT COUNT(*) as count FROM sound_constructs").get().count ?? 0);
      preferredDb.close();

      if (subjectCount === 0 && soundCount === 0 && legacyPath) {
        migrateLegacyDatabase(legacyPath, preferredDatabasePath);
      }
    } catch {
      // If inspection fails, keep the preferred database path and let startup surface the issue.
    }

    databasePath = preferredDatabasePath;
    return databasePath;
  }

  if (legacyPath) {
    migrateLegacyDatabase(legacyPath, preferredDatabasePath);
  }

  databasePath = preferredDatabasePath;
  return databasePath;
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
      // ignore
    }

    try {
      targetDb.close();
    } catch {
      // ignore
    }
  }
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
