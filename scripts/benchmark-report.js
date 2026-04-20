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

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hasTable(db, name) {
  try {
    return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(String(name)));
  } catch {
    return false;
  }
}

function listBenchmarkReports(db, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit ?? 200) || 200, 2000));
  const rows = db.prepare(`
    SELECT *
    FROM benchmark_reports
    ORDER BY createdAt DESC
    LIMIT ?
  `).all(limit);

  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId || "",
    subjectLabel: row.subjectLabel || "",
    testLabel: row.testLabel || "",
    provider: row.provider || "",
    providerLabel: row.providerLabel || row.provider || "",
    model: row.model || "",
    mode: row.mode || "compare",
    grounded: Boolean(row.grounded),
    promptMode: row.promptMode || "",
    question: row.question || "",
    benchmarkQuestion: row.benchmarkQuestion || "",
    localConstructLabel: row.localConstructLabel || "",
    llmConstructLabel: row.llmConstructLabel || "",
    localLatencyMs: Number.isFinite(Number(row.localLatencyMs)) ? Number(row.localLatencyMs) : null,
    llmLatencyMs: Number.isFinite(Number(row.llmLatencyMs)) ? Number(row.llmLatencyMs) : null,
    deltaMs: Number.isFinite(Number(row.deltaMs)) ? Number(row.deltaMs) : null,
    speedup: Number.isFinite(Number(row.speedup)) ? Number(row.speedup) : null,
    comparisonAvailable: Boolean(row.comparisonAvailable),
    faster: row.faster || "",
    summary: row.summary || "",
    debug: safeJsonParse(row.debugJson, null),
    createdAt: row.createdAt
  }));
}

function payloadBenchModeSnapshot(payloadBenchmark = null, mode = "") {
  if (!payloadBenchmark || typeof payloadBenchmark !== "object") {
    return null;
  }

  const modes = Array.isArray(payloadBenchmark.modes) ? payloadBenchmark.modes : [];
  return modes.find((entry) => entry && entry.payloadMode === mode) ?? null;
}

function buildPayloadBenchmarkSection(runs = []) {
  const entries = runs
    .filter((run) => run?.debug?.payloadBenchmark && Array.isArray(run.debug.payloadBenchmark.modes))
    .slice(0, 12);

  if (!entries.length) {
    return "";
  }

  const lines = [];
  lines.push("## Payload Benchmark (Recent)");
  lines.push("");
  lines.push("| createdAt | model | baselineReqTokens | cueOnlyReqTokens | reducedReqTokens | reducedReduction | baselineCost | reducedCost |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const run of entries) {
    const payloadBenchmark = run.debug.payloadBenchmark;
    const baseline = payloadBenchModeSnapshot(payloadBenchmark, "baseline_full");
    const cueOnly = payloadBenchModeSnapshot(payloadBenchmark, "cue_only");
    const reduced = payloadBenchModeSnapshot(payloadBenchmark, "reduced");

    lines.push([
      markdownEscape(run.createdAt),
      markdownEscape(run.model || "unknown"),
      baseline?.requestTokens ?? "n/a",
      cueOnly?.requestTokens ?? "n/a",
      reduced?.requestTokens ?? "n/a",
      reduced?.reductionRequestPct === null || reduced?.reductionRequestPct === undefined ? "n/a" : `${reduced.reductionRequestPct}%`,
      baseline?.estimatedCostUsd === null || baseline?.estimatedCostUsd === undefined || Number(baseline.estimatedCostUsd) <= 0 ? "n/a" : `$${baseline.estimatedCostUsd}`,
      reduced?.estimatedCostUsd === null || reduced?.estimatedCostUsd === undefined || Number(reduced.estimatedCostUsd) <= 0 ? "n/a" : `$${reduced.estimatedCostUsd}`
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("");
  lines.push("Notes:");
  lines.push("");
  lines.push("- `baseline_full` uses the verbose Strandspace assist payload.");
  lines.push("- `cue_only` sends only the compressed cue (no retrieved construct details).");
  lines.push("- `reduced` sends compressed cue + top matches with minimal structured fields.");
  lines.push("- Costs require `STRANDSPACE_OPENAI_PRICING_JSON` or per-1M token env overrides.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function buildBenchmarkHistoryReport({ dbPath, runs, generatedAt }) {
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

function buildBenchmarkReportsReport({ dbPath, runs, generatedAt }) {
  const totalRuns = runs.length;
  const localLatencies = runs.map((run) => run.localLatencyMs).filter((value) => value !== null);
  const assistLatencies = runs.map((run) => run.llmLatencyMs).filter((value) => value !== null);
  const speedups = runs.map((run) => run.speedup).filter((value) => value !== null);

  const avgLocal = average(localLatencies);
  const avgAssist = average(assistLatencies);
  const avgSpeedup = average(speedups);

  const perModel = new Map();
  for (const run of runs) {
    const key = `${safeString(run.provider || "unknown")}:${safeString(run.model || "unknown")}`;
    if (!perModel.has(key)) {
      perModel.set(key, []);
    }
    perModel.get(key).push(run);
  }

  const modelRows = [...perModel.entries()]
    .map(([key, entries]) => ({
      key,
      provider: entries[0]?.providerLabel || entries[0]?.provider || "unknown",
      model: entries[0]?.model || "unknown",
      count: entries.length,
      avgLocal: average(entries.map((run) => run.localLatencyMs).filter((v) => v !== null)),
      avgAssist: average(entries.map((run) => run.llmLatencyMs).filter((v) => v !== null)),
      avgSpeedup: average(entries.map((run) => run.speedup).filter((v) => v !== null))
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

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
  lines.push(`- Avg speedup: ${avgSpeedup === null ? "n/a" : `${round(avgSpeedup, 1)}x`}`);
  lines.push("");
  lines.push("## By Model");
  lines.push("");
  lines.push("| provider | model | runs | avgLocalMs | avgAssistMs | avgSpeedup |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: |");
  for (const row of modelRows) {
    lines.push([
      markdownEscape(row.provider),
      markdownEscape(row.model),
      row.count,
      row.avgLocal === null ? "n/a" : round(row.avgLocal, 1),
      row.avgAssist === null ? "n/a" : round(row.avgAssist, 1),
      row.avgSpeedup === null ? "n/a" : round(row.avgSpeedup, 1)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("");
  lines.push("## Recent Runs");
  lines.push("");
  lines.push("| createdAt | testLabel | provider | model | mode | prompt | compactPrompt | localMs | assistMs | speedup | faster |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |");

  for (const run of runs.slice(0, 25)) {
    lines.push([
      markdownEscape(run.createdAt),
      markdownEscape(run.testLabel),
      markdownEscape(run.providerLabel || run.provider),
      markdownEscape(run.model),
      markdownEscape(run.mode),
      markdownEscape(run.question),
      markdownEscape(run.benchmarkQuestion),
      run.localLatencyMs === null ? "n/a" : round(run.localLatencyMs, 1),
      run.llmLatencyMs === null ? "n/a" : round(run.llmLatencyMs, 1),
      run.speedup === null ? "n/a" : round(run.speedup, 1),
      markdownEscape(run.faster)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("");

  const payloadSection = buildPayloadBenchmarkSection(runs);
  if (payloadSection) {
    lines.push(payloadSection.trimEnd());
    lines.push("");
  }

  lines.push("## Notes");
  lines.push("");
  lines.push("- This report is generated from the local SQLite table `benchmark_reports` (Model Lab reports).");
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
    const useBenchmarkReports = hasTable(db, "benchmark_reports");
    const runs = useBenchmarkReports
      ? listBenchmarkReports(db, { limit })
      : listStrandspaceBenchmarkHistory(db, { limit });
    const generatedAt = new Date().toISOString();
    const report = useBenchmarkReports
      ? buildBenchmarkReportsReport({
        dbPath,
        runs,
        generatedAt
      })
      : buildBenchmarkHistoryReport({
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
