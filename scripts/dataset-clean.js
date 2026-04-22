import { DatabaseSync } from "node:sqlite";
import { cleanSubjectDataset } from "../strandspace/subjectspace.js";
import { resolveDatabasePath } from "../server/persistence.mjs";

function readFlag(name = "") {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((entry) => String(entry).startsWith(prefix));
  return match ? String(match).slice(prefix.length).trim() : "";
}

const subjectId = readFlag("--subject");
const databasePath = await resolveDatabasePath();
const db = new DatabaseSync(databasePath);

try {
  const result = cleanSubjectDataset(db, {
    subjectId,
    maxIssues: 12
  });

  console.log(JSON.stringify({
    ok: true,
    databasePath,
    subjectId: subjectId || null,
    ...result
  }, null, 2));
} finally {
  db.close();
}
