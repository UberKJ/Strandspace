import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");

async function removeMatchingFiles(directory, matcher) {
  let removed = 0;

  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !matcher(entry.name)) {
        continue;
      }

      await rm(join(directory, entry.name), { force: true });
      removed += 1;
    }
  } catch {
    return removed;
  }

  return removed;
}

const removedDbFiles = await removeMatchingFiles(dataDir, (name) => /^strandspace\.sqlite(?:-(?:shm|wal)|\.(?:shm|wal))?$|^strandspace\.sqlite/.test(name));
const removedLogFiles = await removeMatchingFiles(rootDir, (name) => /^(?:dev-server.*\.log|server\.(?:err|log)|dev-server\.(?:err|out)\.log)$/i.test(name));

console.log(`Cleanup complete. Removed ${removedDbFiles} DB file(s) and ${removedLogFiles} log file(s).`);
