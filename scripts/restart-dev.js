import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

function runNodeScript(scriptName) {
  execFileSync(process.execPath, [join(__dirname, scriptName)], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

runNodeScript("kill-dev.js");

const child = spawn(process.execPath, [join(rootDir, "server.mjs")], {
  cwd: rootDir,
  detached: true,
  stdio: "ignore",
  windowsHide: true
});

child.unref();
console.log("Strandspace dev server restarted in the background.");
