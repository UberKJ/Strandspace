import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  ensureSubjectspaceTables,
  listStrandspaceBenchmarkHistory
} from "../strandspace/subjectspace.js";

function parseArgs(argv = []) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry?.startsWith("--")) {
      continue;
    }

    const key = entry.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    args.set(key, value);
  }
  return args;
}

function clampNumber(value, fallback, { min = null, max = null } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (min !== null && parsed < min) {
    return min;
  }
  if (max !== null && parsed > max) {
    return max;
  }
  return parsed;
}

function safeString(value) {
  return String(value ?? "").trim();
}

function round(value, places = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const factor = 10 ** places;
  return Math.round(parsed * factor) / factor;
}

function sum(values = []) {
  return values.reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
}

function average(values = []) {
  const finite = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!finite.length) {
    return null;
  }
  return sum(finite) / finite.length;
}

function markdownEscape(value = "") {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function buildReport({ dbPath, runs, generatedAt }) {
  const totalRuns = runs.length;
  const localLatencies = runs.map((run) => run.localLatencyMs).filter((value) => value !== null);
  const assistLatencies = runs.map((run) => run.assistLatencyMs).filter((value) => value !== null);
  const savings = runs.map((run) => run.estimatedSavings).filter((value) => value !== null);

  const avgLocal = average(localLatencies);
  const avgAssist = average(assistLatencies);
  const avgSavings = average(savings);

  const perModel = new Map();
  for (const run of runs) {
    const key = safeString(run.routeMode || "unknown");
    if (!perModel.has(key)) {
      perModel.set(key, []);
    }
    perModel.get(key).push(run);
  }

  const modeRows = [...perModel.entries()]
    .map(([mode, entries]) => ({
      mode,
      count: entries.length,
      avgLocal: average(entries.map((run) => run.localLatencyMs).filter((v) => v !== null)),
      avgAssist: average(entries.map((run) => run.assistLatencyMs).filter((v) => v !== null)),
      avgSavings: average(entries.map((run) => run.estimatedSavings).filter((v) => v !== null))
    }))
    .sort((left, right) => right.count - left.count || left.mode.localeCompare(right.mode));

  const lines = [];
  lines.push("# Strandspace Benchmark History");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Database: \`${dbPath}\``);
  lines.push(`Runs: ${totalRuns}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Avg local recall latency: ${avgLocal === null ? "n/a" : `${round(avgLocal, 1)} ms`}`);
  lines.push(`- Avg assist round-trip latency: ${avgAssist === null ? "n/a" : `${round(avgAssist, 1)} ms`}`);
  lines.push(`- Avg estimated token savings: ${avgSavings === null ? "n/a" : `${Math.round(avgSavings)} tokens`}`);
  lines.push("");
  lines.push("## By Route");
  lines.push("");
  lines.push("| routeMode | runs | avgLocalMs | avgAssistMs | avgSavings |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const row of modeRows) {
    lines.push([
      markdownEscape(row.mode),
      row.count,
      row.avgLocal === null ? "n/a" : round(row.avgLocal, 1),
      row.avgAssist === null ? "n/a" : round(row.avgAssist, 1),
      row.avgSavings === null ? "n/a" : Math.round(row.avgSavings)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("");
  lines.push("## Recent Runs");
  lines.push("");
  lines.push("| createdAt | subject | prompt | compactPrompt | routeMode | localMs | assistMs | savings | matchedConstruct | confidence | margin |");
  lines.push("| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: |");

  for (const run of runs.slice(0, 25)) {
    lines.push([
      markdownEscape(run.createdAt),
      markdownEscape(run.subjectLabel || run.subjectId),
      markdownEscape(run.question),
      markdownEscape(run.benchmarkQuestion),
      markdownEscape(run.routeMode),
      run.localLatencyMs === null ? "n/a" : round(run.localLatencyMs, 1),
      run.assistLatencyMs === null ? "n/a" : round(run.assistLatencyMs, 1),
      run.estimatedSavings === null ? "n/a" : Math.round(run.estimatedSavings),
      markdownEscape(run.matchedConstructLabel || run.matchedConstructId),
      run.confidence === null ? "n/a" : round(run.confidence, 2),
      run.margin === null ? "n/a" : round(run.margin, 2)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This report is generated from the local SQLite table `strandspace_benchmark_history`.");
  lines.push("- If `assistMs` is `n/a`, the run likely occurred in local-only mode or usage was unavailable.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = safeString(args.get("db")) || process.env.STRANDSPACE_DB_PATH || join("data", "strandspace.sqlite");
  const outPath = safeString(args.get("out")) || join("docs", "benchmark-history.md");
  const limit = clampNumber(args.get("limit"), 200, { min: 1, max: 2000 });

  const db = new DatabaseSync(dbPath);
  try {
    ensureSubjectspaceTables(db);
    const runs = listStrandspaceBenchmarkHistory(db, { limit });
    const generatedAt = new Date().toISOString();
    const report = buildReport({
      dbPath,
      runs,
      generatedAt
    });

    await writeFile(outPath, report, "utf8");
    console.log(`[benchmark:report] wrote ${outPath} (${report.length} chars, ${runs.length} runs)`);
  } finally {
    db.close();
  }
}

await main();
