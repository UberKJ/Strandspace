import { DatabaseSync } from "node:sqlite";
import { auditSubjectDataset, auditSubjectSeedFile, defaultSubjectSeedsPath, releaseSubjectSeedsPath } from "../strandspace/subjectspace.js";
import { resolveDatabasePath } from "../server/persistence.mjs";

function readFlag(name = "") {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((entry) => String(entry).startsWith(prefix));
  return match ? String(match).slice(prefix.length).trim() : "";
}

const subjectId = readFlag("--subject");
const databasePath = resolveDatabasePath();
const db = new DatabaseSync(databasePath);

try {
  const health = auditSubjectDataset(db, {
    subjectId,
    maxIssues: 12
  });
  const activeSeedFile = auditSubjectSeedFile(defaultSubjectSeedsPath, { maxIssues: 6 });
  const releaseSeedFile = auditSubjectSeedFile(releaseSubjectSeedsPath, { maxIssues: 6 });

  console.log(JSON.stringify({
    ok: true,
    databasePath,
    subjectId: subjectId || null,
    health,
    seedFiles: {
      activeSeedFile,
      releaseSeedFile
    }
  }, null, 2));
} finally {
  db.close();
}
