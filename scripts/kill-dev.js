import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const normalizedRoot = rootDir.replace(/\\/g, "\\\\");

function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    }).trim();
  } catch {
    return "";
  }
}

if (process.platform === "win32") {
  const script = [
    `$root = "${normalizedRoot}"`,
    "$killed = @()",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -match '^(node|npm)\\.exe$' -and ($_.CommandLine -like \"*$root*\")",
    "} | ForEach-Object {",
    "  $killed += $_.ProcessId",
    "  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue",
    "}",
    "if ($killed.Count -gt 0) {",
    "  Write-Output (\"Stopped project Node process(es): \" + ($killed -join ', '))",
    "} else {",
    "  Write-Output 'No project Node processes found.'",
    "}"
  ].join("; ");

  console.log(run("powershell", ["-NoProfile", "-Command", script]) || "No project Node processes found.");
} else {
  const output = run("pkill", ["-f", `${rootDir}.*(server\\.mjs|npm run dev|node server\\.mjs)`]);
  console.log(output || "Sent stop signal to matching project Node processes, or none were running.");
}
