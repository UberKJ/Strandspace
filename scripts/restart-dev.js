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

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "dev"], {
  cwd: rootDir,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
