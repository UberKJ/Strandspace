const subjectSelect = document.getElementById("subject-select");
const subjectMetaEl = document.getElementById("subject-meta");
const recallForm = document.getElementById("recall-form");
const recallQuestionInput = document.getElementById("recall-question");
const recallMetaEl = document.getElementById("recall-meta");
const exampleRowEl = document.getElementById("example-row");
const answerPanelEl = document.getElementById("answer-panel");
const traceGridEl = document.getElementById("trace-grid");
const traceSummaryEl = document.getElementById("trace-summary");
const speedMetaEl = document.getElementById("speed-meta");
const speedReportEl = document.getElementById("speed-report");
const speedCompareButton = document.getElementById("speed-compare-button");
const llmActivityEl = document.getElementById("llm-activity");
const llmMetaEl = document.getElementById("llm-meta");
const llmDetailEl = document.getElementById("llm-detail");
const libraryMetaEl = document.getElementById("library-meta");
const libraryListEl = document.getElementById("library-list");
const learnForm = document.getElementById("learn-form");
const learnMetaEl = document.getElementById("learn-meta");
const learnSubjectInput = document.getElementById("learn-subject");
const learnConstructInput = document.getElementById("learn-construct");
const learnTargetInput = document.getElementById("learn-target");
const learnObjectiveInput = document.getElementById("learn-objective");
const learnContextInput = document.getElementById("learn-context");
const learnStepsInput = document.getElementById("learn-steps");
const learnNotesInput = document.getElementById("learn-notes");
const learnTagsInput = document.getElementById("learn-tags");

let subjects = [];
let library = [];
let currentSubjectId = "";
let lastPayload = null;
let lastQuestion = "";
let assistStatus = {
  enabled: false,
  model: "",
  reason: "Loading API assist status..."
};
let latestAssist = null;
let latestComparison = null;
let benchmarkState = {
  phase: "idle",
  message: ""
};
let llmActivity = {
  phase: "idle",
  kind: "",
  provider: "",
  model: "",
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  message: "No LLM requests yet."
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function contextEntries(context = {}) {
  return Object.entries(context ?? {}).filter(([key, value]) => key && value);
}

function contextSummary(context = {}, limit = 3) {
  return contextEntries(context)
    .slice(0, limit)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
}

function currentSubject() {
  return subjects.find((item) => item.subjectId === currentSubjectId) ?? null;
}

function currentSubjectLabel() {
  return currentSubject()?.subjectLabel ?? "Custom Subject";
}

function formatPercent(value = 0) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function formatMilliseconds(value) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }

  return `${Number(value).toFixed(Number(value) >= 10 ? 1 : 3)} ms`;
}

function formatTokens(value) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }

  return `${Math.round(Number(value))}`;
}

function renderLlmActivity() {
  if (!llmActivityEl || !llmMetaEl || !llmDetailEl) {
    return;
  }

  const phase = llmActivity.phase;
  llmActivityEl.className = `llm-activity${phase === "loading" ? " loading" : ""}${phase === "error" ? " error" : ""}`;

  if (phase === "loading") {
    llmMetaEl.textContent = llmActivity.model ? `LLM running on ${llmActivity.model}...` : "LLM running...";
    llmDetailEl.textContent = llmActivity.message || "Sending request...";
    return;
  }

  if (phase === "error") {
    llmMetaEl.textContent = "LLM request failed.";
    llmDetailEl.textContent = llmActivity.message || "The LLM request failed.";
    return;
  }

  if (phase === "done") {
    const modelLabel = llmActivity.model ? ` • ${llmActivity.model}` : "";
    llmMetaEl.textContent = `${llmActivity.kind || "LLM"} finished in ${formatMilliseconds(llmActivity.latencyMs)}${modelLabel}.`;
    llmDetailEl.textContent = `Tokens in ${formatTokens(llmActivity.inputTokens)} • out ${formatTokens(llmActivity.outputTokens)} • total ${formatTokens(llmActivity.totalTokens)}.`;
    return;
  }

  llmMetaEl.textContent = "LLM idle.";
  llmDetailEl.textContent = llmActivity.message || "No LLM requests yet.";
}

function startLlmActivity({ kind = "LLM", provider = "", model = "", message = "" } = {}) {
  llmActivity = {
    phase: "loading",
    kind,
    provider,
    model,
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    message: message || "Sending request..."
  };
  renderLlmActivity();
}

function finishLlmActivity({ kind = "LLM", provider = "", model = "", latencyMs = null, inputTokens = null, outputTokens = null, totalTokens = null, message = "" } = {}) {
  llmActivity = {
    phase: "done",
    kind,
    provider,
    model,
    latencyMs,
    inputTokens,
    outputTokens,
    totalTokens,
    message: message || ""
  };
  renderLlmActivity();
}

function idleLlmActivity(message = "No LLM requests yet.") {
  llmActivity = {
    phase: "idle",
    kind: "",
    provider: "",
    model: assistStatus.model ?? "",
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    message
  };
  renderLlmActivity();
}

function failLlmActivity(message = "The LLM request failed.") {
  llmActivity = {
    ...llmActivity,
    phase: "error",
    message
  };
  renderLlmActivity();
}

function previewQuestion(value = "", limit = 112) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1)}...`;
}

function activeBenchmarkQuestion() {
  return String(recallQuestionInput?.value ?? "").trim() || lastQuestion;
}

function benchmarkSummaryLine(comparisonPayload = null) {
  const local = comparisonPayload?.local ?? {};
  const llm = comparisonPayload?.llm ?? {};
  const comparison = comparisonPayload?.comparison ?? {};

  if (!comparisonPayload) {
    return "";
  }

  if (comparison.available) {
    return `Strandbase ${formatMilliseconds(local.latencyMs)} | LLM ${formatMilliseconds(llm.latencyMs)} | ${comparison.speedup}x faster`;
  }

  if (Number.isFinite(Number(local.latencyMs))) {
    return `Strandbase ${formatMilliseconds(local.latencyMs)} | LLM ${formatMilliseconds(llm.latencyMs)} | ${llm.error ?? llm.reason ?? "LLM unavailable"}`;
  }

  return comparison.summary ?? benchmarkState.message ?? "";
}

function subjectMetaText() {
  const active = currentSubject();
  const subjectPart = active
    ? `${active.constructCount} constructs loaded in ${active.subjectLabel}.`
    : "Select a subject to load its constructs.";
  const apiPart = assistStatus.enabled
    ? `API assist ready on ${assistStatus.model}.`
    : assistStatus.reason;

  return `${subjectPart} ${apiPart}`.trim();
}

function buildExampleQuestion(construct) {
  const room = construct.context?.room ?? construct.context?.environment ?? construct.context?.["show type"] ?? "";
  const focus = construct.target || construct.constructLabel;
  return `Recall the ${construct.constructLabel} setup for ${focus}${room ? ` in ${room}` : ""}.`;
}

function previewTrace(construct) {
  return {
    triggerStrands: [
      { name: "preview", detail: "manual selection" },
      { name: `subject:${construct.subjectId}`, detail: construct.subjectLabel }
    ],
    anchorStrands: [
      construct.target ? { name: "target", value: construct.target } : null,
      construct.objective ? { name: "objective", value: construct.objective } : null,
      ...contextEntries(construct.context).slice(0, 4).map(([key, value]) => ({ name: key, value }))
    ].filter(Boolean),
    compositeStrands: [
      { name: construct.constructLabel, value: `${construct.subjectLabel} construct` },
      ...(construct.tags ?? []).slice(0, 4).map((tag) => ({ name: tag, value: "tagged memory" }))
    ],
    stabilizedMemory: [
      { name: construct.constructLabel, score: Number(construct.learnedCount ?? 1), role: "selected" }
    ],
    expressionField: `Previewing a stored construct in ${construct.subjectLabel} before recall is triggered.`
  };
}

function previewPayload(construct) {
  return {
    source: "preview",
    question: buildExampleQuestion(construct),
    answer: construct.notes || `Previewing "${construct.constructLabel}" in ${construct.subjectLabel}.`,
    construct,
    recall: {
      ready: true,
      readiness: {
        matchedScore: Number(construct.learnedCount ?? 1),
        matchedRatio: 1,
        margin: 1,
        confidence: 0.88
      },
      candidates: [
        {
          constructLabel: construct.constructLabel,
          score: Number(construct.learnedCount ?? 1)
        }
      ],
      routing: {
        mode: "preview",
        label: "Stored construct preview",
        confidence: 0.88,
        margin: 1,
        matchedRatio: 1,
        apiRecommended: false,
        reason: "You are looking at a saved construct before running a live recall prompt.",
        nextAction: "Use this as the local baseline, then stress-test it with a real prompt.",
        promptDraft: "",
        missingKeywords: []
      },
      trace: previewTrace(construct)
    }
  };
}

function animateFresh(element) {
  if (!element) {
    return;
  }

  element.classList.remove("is-fresh");
  void element.offsetWidth;
  element.classList.add("is-fresh");
}

async function loadAssistStatus() {
  try {
    const payload = await fetchJson("/api/subjectspace/assist/status");
    assistStatus = {
      enabled: Boolean(payload.enabled),
      model: payload.model ?? "",
      reason: payload.reason ?? ""
    };
  } catch (error) {
    assistStatus = {
      enabled: false,
      model: "",
      reason: error instanceof Error ? error.message : "Unable to load API assist status."
    };
  }

  subjectMetaEl.textContent = subjectMetaText();
  if (llmActivity.phase === "idle") {
    idleLlmActivity(assistStatus.enabled ? "No LLM requests yet." : assistStatus.reason);
  }
  renderSpeedReport();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }

  return payload;
}

function postJson(url, payload = {}) {
  return fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

function resetTransientState({ clearAssist = true, clearComparison = true } = {}) {
  if (clearAssist) {
    latestAssist = null;
  }
  if (clearComparison) {
    latestComparison = null;
    benchmarkState = {
      phase: "idle",
      message: ""
    };
  }

  renderSpeedReport();
}

function renderTrace(trace = null) {
  if (!trace) {
    traceGridEl.className = "trace-grid empty";
    traceGridEl.innerHTML = "<p>The field will populate when Strandspace has something to stabilize.</p>";
    traceSummaryEl.textContent = "Trigger, anchor, composite, and memory layers are waiting for a prompt.";
    return;
  }

  const lanes = [
    { title: "Trigger strands", items: trace.triggerStrands ?? [] },
    { title: "Anchor strands", items: trace.anchorStrands ?? [] },
    { title: "Composite constructs", items: trace.compositeStrands ?? [] },
    { title: "Stabilized memory", items: trace.stabilizedMemory ?? [] }
  ];

  traceGridEl.className = "trace-grid";
  traceGridEl.innerHTML = lanes
    .map((lane, laneIndex) => `
      <section class="trace-lane">
        <header>
          <h3>${escapeHtml(lane.title)}</h3>
        </header>
        <div class="trace-chip-row">
          ${lane.items.length
            ? lane.items.map((item, itemIndex) => `
              <article class="trace-chip" style="--delay:${(laneIndex * 80) + (itemIndex * 55)}ms">
                <strong>${escapeHtml(item.name ?? item.kind ?? "strand")}</strong>
                <span>${escapeHtml(item.value ?? item.detail ?? item.role ?? (item.score !== undefined ? `score ${Number(item.score).toFixed(1)}` : "active"))}</span>
              </article>
            `).join("")
            : "<p class=\"trace-empty\">No active strands in this lane yet.</p>"}
        </div>
      </section>
    `)
    .join("");

  traceSummaryEl.textContent = trace.expressionField ?? "The expression field is forming.";
  animateFresh(traceGridEl);
}

function renderRoutingPanel(routing = {}, readiness = {}) {
  if (!routing || !routing.label) {
    return "";
  }

  const confidence = Number(routing.confidence ?? readiness.confidence ?? 0);
  const matchedRatio = Number(routing.matchedRatio ?? readiness.matchedRatio ?? 0);
  const margin = Number(routing.margin ?? readiness.margin ?? 0);
  const missingKeywords = Array.isArray(routing.missingKeywords) ? routing.missingKeywords : [];
  const routeClass = routing.apiRecommended ? "assist-card api" : "assist-card local";
  const assistControls = routing.apiRecommended
    ? assistStatus.enabled
      ? `
        <div class="assist-actions">
          <button type="button" class="assist-action-button" data-assist-action="run">Run API assist</button>
          <span class="assist-inline-note">Uses ${escapeHtml(assistStatus.model)} only when the local field is close enough.</span>
        </div>
      `
      : `<p class="assist-inline-note">${escapeHtml(assistStatus.reason)}</p>`
    : "";

  return `
    <section class="${routeClass}">
      <div class="assist-head">
        <div>
          <p class="assist-kicker">Decision layer</p>
          <h3>${escapeHtml(routing.label)}</h3>
        </div>
        <span class="assist-badge">${escapeHtml(routing.apiRecommended ? "API ready" : "Local first")}</span>
      </div>
      <div class="confidence-block">
        <div class="confidence-labels">
          <span>Confidence</span>
          <strong>${escapeHtml(formatPercent(confidence))}</strong>
        </div>
        <div class="confidence-track" aria-hidden="true">
          <span class="confidence-fill" style="--confidence:${confidence}"></span>
        </div>
      </div>
      <div class="assist-stats">
        <span>Match ratio ${escapeHtml(formatPercent(matchedRatio))}</span>
        <span>Winner margin ${escapeHtml(margin.toFixed(1))}</span>
      </div>
      <p class="assist-reason">${escapeHtml(routing.reason ?? "")}</p>
      <p class="assist-next"><strong>Next move:</strong> ${escapeHtml(routing.nextAction ?? "")}</p>
      ${missingKeywords.length
        ? `
          <div class="assist-missing">
            ${missingKeywords.map((token) => `<span class="chip subtle">${escapeHtml(token)}</span>`).join("")}
          </div>
        `
        : ""}
      ${assistControls}
      ${routing.promptDraft
        ? `
          <div class="assist-prompt">
            <p class="assist-kicker">API prompt draft</p>
            <p>${escapeHtml(routing.promptDraft)}</p>
          </div>
        `
        : ""}
    </section>
  `;
}

function renderAssistResult() {
  if (!latestAssist) {
    return "";
  }

  const assist = latestAssist.assist ?? {};
  const construct = latestAssist.suggestedConstruct ?? {};
  const assistModel = latestAssist.config?.model ?? assistStatus.model ?? "API";
  const context = contextEntries(construct.context ?? {});
  const steps = Array.isArray(construct.steps) ? construct.steps : [];
  const validationFocus = Array.isArray(assist.validationFocus) ? assist.validationFocus : [];
  const canSave = !latestAssist.savedConstruct;

  return `
    <section class="api-result-card">
      <div class="assist-head">
        <div>
          <p class="assist-kicker">OpenAI assist</p>
          <h3>${escapeHtml(construct.constructLabel ?? assist.constructLabel ?? "API-assisted construct")}</h3>
        </div>
        <span class="assist-badge">${escapeHtml(String(assistModel))}</span>
      </div>
      <p class="assist-reason">${escapeHtml(assist.rationale ?? "The API expanded the local construct into a candidate you can review and store.")}</p>
      ${context.length
        ? `
          <div class="assist-context-grid">
            ${context.map(([key, value]) => `
              <article>
                <strong>${escapeHtml(key)}</strong>
                <span>${escapeHtml(value)}</span>
              </article>
            `).join("")}
          </div>
        `
        : ""}
      ${steps.length
        ? `
          <div class="assist-steps">
            <p class="assist-kicker">Suggested steps</p>
            <ol>
              ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
            </ol>
          </div>
        `
        : ""}
      ${validationFocus.length
        ? `
          <div class="assist-missing">
            ${validationFocus.map((item) => `<span class="chip subtle">${escapeHtml(item)}</span>`).join("")}
          </div>
        `
        : ""}
      <p class="assist-next"><strong>Learn back:</strong> ${escapeHtml(canSave ? "Save this validated draft into Strandspace if it looks right." : "This API draft has already been saved into the local field.")}</p>
      ${canSave
        ? `
          <div class="assist-actions">
            <button type="button" class="assist-action-button" data-assist-action="save">Save API draft to Strandspace</button>
          </div>
        `
        : ""}
    </section>
  `;
}

function renderSpeedReport() {
  if (!speedMetaEl || !speedReportEl) {
    return;
  }

  const benchmarkQuestion = activeBenchmarkQuestion();
  if (speedCompareButton) {
    speedCompareButton.disabled = benchmarkState.phase === "loading";
    speedCompareButton.textContent = benchmarkState.phase === "loading" ? "Running benchmark..." : "Compare local vs LLM";
  }

  if (!benchmarkQuestion) {
    speedMetaEl.textContent = "Benchmark the last live recall prompt against the local field and the LLM path.";
    speedReportEl.className = "speed-report empty";
    speedReportEl.innerHTML = "<p>Run a recall prompt first, then compare local Strandbase recall against the LLM assist round-trip.</p>";
    return;
  }

  if (benchmarkState.phase === "loading") {
    speedMetaEl.textContent = benchmarkState.message || "Benchmark in progress...";
    speedReportEl.className = "speed-report loading";
    speedReportEl.innerHTML = `
      <div class="speed-summary">
        <p>${escapeHtml(benchmarkState.message || "Timing both paths now...")}</p>
        <p>Prompt: "${escapeHtml(previewQuestion(benchmarkQuestion))}"</p>
      </div>
    `;
    return;
  }

  if (benchmarkState.phase === "error") {
    speedMetaEl.textContent = benchmarkState.message || "Benchmark failed.";
    speedReportEl.className = "speed-report error";
    speedReportEl.innerHTML = `
      <div class="speed-summary speed-summary-error">
        <p>${escapeHtml(benchmarkState.message || "Unable to benchmark this prompt.")}</p>
        <p>Prompt: "${escapeHtml(previewQuestion(benchmarkQuestion))}"</p>
      </div>
    `;
    return;
  }

  if (!latestComparison) {
    speedMetaEl.textContent = assistStatus.enabled
      ? `Ready to benchmark the last prompt against ${assistStatus.model}.`
      : `Ready to benchmark local recall. ${assistStatus.reason}`;
    speedReportEl.className = "speed-report empty";
    speedReportEl.innerHTML = `
      <p>
        Current prompt: "${escapeHtml(previewQuestion(benchmarkQuestion))}"
      </p>
      <p>
        Use the benchmark button to time local Strandbase recall${assistStatus.enabled ? ` and the ${escapeHtml(assistStatus.model)} assist round-trip.` : "."}
      </p>
    `;
    return;
  }

  const local = latestComparison.local ?? {};
  const llm = latestComparison.llm ?? {};
  const comparison = latestComparison.comparison ?? {};
  const llmReady = Boolean(comparison.available);

  speedMetaEl.textContent = benchmarkSummaryLine(latestComparison) || comparison.summary || "Benchmark complete.";
  speedReportEl.className = "speed-report";
  speedReportEl.innerHTML = `
    <div class="speed-grid">
      <article class="speed-card strandbase">
        <p class="assist-kicker">Local path</p>
        <h3>${escapeHtml(local.label ?? "Strandbase recall")}</h3>
        <strong class="speed-latency">${escapeHtml(formatMilliseconds(local.latencyMs))}</strong>
        <p>${escapeHtml(local.constructLabel ?? "No stable construct matched yet.")}</p>
        <div class="speed-notes">
          <span>Route ${escapeHtml(local.route ?? "unresolved")}</span>
          <span>Confidence ${escapeHtml(formatPercent(local.confidence ?? 0))}</span>
        </div>
      </article>
      <article class="speed-card llm${llmReady ? "" : " disabled"}">
        <p class="assist-kicker">LLM path</p>
        <h3>${escapeHtml(llm.label ?? "LLM assist round-trip")}</h3>
        <strong class="speed-latency">${escapeHtml(formatMilliseconds(llm.latencyMs))}</strong>
        <p>${escapeHtml(llm.constructLabel ?? llm.error ?? llm.reason ?? "No LLM result was captured for this run.")}</p>
        <div class="speed-notes">
          <span>${escapeHtml(llm.model ?? "API")}</span>
          <span>${escapeHtml(llm.apiAction ?? (llm.enabled ? "assist" : "unavailable"))}</span>
          <span>Tokens in ${escapeHtml(formatTokens(llm.inputTokens))}</span>
        </div>
      </article>
    </div>
    <div class="speed-summary">
      <p>${escapeHtml(comparison.summary ?? "Benchmark complete.")}</p>
      ${comparison.available
        ? `<p>Delta: ${escapeHtml(formatMilliseconds(comparison.deltaMs))}. Speedup: ${escapeHtml(String(comparison.speedup))}x.</p>`
        : `<p>Prompt: "${escapeHtml(previewQuestion(benchmarkQuestion))}"</p>`}
    </div>
  `;
}

function renderAnswer(payload = null) {
  lastPayload = payload;
  lastQuestion = String(payload?.question ?? lastQuestion ?? "").trim();

  if (!payload) {
    answerPanelEl.className = "answer-surface empty";
    answerPanelEl.innerHTML = `
      <p class="answer-kicker">Expression field</p>
      <h2>Teach the first construct</h2>
      <p>Store one reusable scene and Strandspace will start recalling it from partial cues.</p>
    `;
    renderTrace(null);
    renderSpeedReport();
    return;
  }

  const construct = payload.construct ?? null;
  const recall = payload.recall ?? {};
  const candidates = recall.candidates ?? [];
  const routing = recall.routing ?? {};
  const readiness = recall.readiness ?? {};

  if (!construct) {
    answerPanelEl.className = "answer-surface unresolved";
    answerPanelEl.innerHTML = `
      <p class="answer-kicker">Expression field unresolved</p>
      <h2>No stable construct yet</h2>
      <p>${escapeHtml(payload.answer ?? "Strandspace needs a learned construct before it can emit a trusted answer.")}</p>
      ${renderRoutingPanel(routing, readiness)}
      ${renderAssistResult()}
      ${candidates.length
        ? `
          <div class="candidate-stack">
            ${candidates.map((candidate) => `
              <article class="candidate-item">
                <strong>${escapeHtml(candidate.constructLabel ?? "Possible construct")}</strong>
                <span>${escapeHtml(candidate.objective ?? candidate.target ?? "Partial overlap only")}</span>
              </article>
            `).join("")}
          </div>
        `
        : ""}
    `;
    renderTrace(recall.trace ?? null);
    animateFresh(answerPanelEl);
    renderSpeedReport();
    return;
  }

  const context = contextEntries(construct.context);
  const steps = Array.isArray(construct.steps) ? construct.steps : [];
  const tags = Array.isArray(construct.tags) ? construct.tags : [];
  const stableScore = Number(readiness.matchedScore ?? 0);

  answerPanelEl.className = "answer-surface";
  answerPanelEl.innerHTML = `
    <p class="answer-kicker">${escapeHtml(payload.source === "preview" ? "Stored construct preview" : "Expression field stabilized")}</p>
    <h2>${escapeHtml(construct.constructLabel)}</h2>
    <p class="answer-copy">${escapeHtml(payload.answer ?? "Strandspace emitted a reusable construct.")}</p>
    <div class="answer-strip">
      <span>${escapeHtml(construct.subjectLabel)}</span>
      <span>${escapeHtml(construct.target || "general target")}</span>
      <span>${escapeHtml(construct.objective || `score ${stableScore.toFixed(1)}`)}</span>
    </div>
    ${renderRoutingPanel(routing, readiness)}
    ${renderAssistResult()}
    ${context.length
      ? `
        <div class="answer-context">
          ${context.map(([key, value]) => `
            <article>
              <strong>${escapeHtml(key)}</strong>
              <span>${escapeHtml(value)}</span>
            </article>
          `).join("")}
        </div>
      `
      : ""}
    ${steps.length
      ? `
        <div class="answer-steps">
          <p class="answer-label">Working steps</p>
          <ol>
            ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
          </ol>
        </div>
      `
      : ""}
    ${tags.length
      ? `
        <div class="chip-row">
          ${tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
        </div>
      `
      : ""}
  `;

  renderTrace(recall.trace ?? previewTrace(construct));
  animateFresh(answerPanelEl);
  renderSpeedReport();
}

function renderSubjectPicker() {
  if (!subjects.length) {
    subjectSelect.innerHTML = "<option value=\"\">No subjects yet</option>";
    subjectSelect.disabled = true;
    subjectMetaEl.textContent = `Save a construct to create the first subject field. ${assistStatus.reason}`.trim();
    return;
  }

  subjectSelect.disabled = false;
  subjectSelect.innerHTML = subjects
    .map((subject) => `
      <option value="${escapeHtml(subject.subjectId)}">${escapeHtml(subject.subjectLabel)} (${subject.constructCount})</option>
    `)
    .join("");
  subjectSelect.value = currentSubjectId;
  const active = currentSubject();
  subjectMetaEl.textContent = subjectMetaText();
  learnSubjectInput.value = active?.subjectLabel ?? learnSubjectInput.value;
}

function renderExamples() {
  if (!library.length) {
    exampleRowEl.innerHTML = "<p class=\"meta\">No sample prompts yet. Store a construct to generate reusable recall prompts.</p>";
    return;
  }

  exampleRowEl.innerHTML = library
    .slice(0, 3)
    .map((construct) => `
      <button type="button" class="example-pill" data-example-id="${escapeHtml(construct.id)}">
        ${escapeHtml(construct.constructLabel)}
      </button>
    `)
    .join("");
}

function renderLibrary() {
  if (!library.length) {
    libraryMetaEl.textContent = `No constructs stored in ${currentSubjectLabel()} yet.`;
    libraryListEl.className = "library-list empty";
    libraryListEl.innerHTML = "<p>Teach the first construct for this subject and it will start showing up here.</p>";
    renderExamples();
    return;
  }

  libraryMetaEl.textContent = `${library.length} constructs stored in ${currentSubjectLabel()}.`;
  libraryListEl.className = "library-list";
  libraryListEl.innerHTML = library
    .map((construct, index) => `
      <button type="button" class="library-item" data-construct-id="${escapeHtml(construct.id)}" style="--delay:${index * 55}ms">
        <strong>${escapeHtml(construct.constructLabel)}</strong>
        <span>${escapeHtml(construct.target || construct.objective || construct.subjectLabel)}</span>
        <small>${escapeHtml(contextSummary(construct.context) || "Open to preview context")}</small>
      </button>
    `)
    .join("");

  renderExamples();
}

function renderIdleState() {
  if (library[0]) {
    renderAnswer(previewPayload(library[0]));
    return;
  }

  renderAnswer(null);
}

async function loadLibrary() {
  const query = currentSubjectId ? `?subjectId=${encodeURIComponent(currentSubjectId)}` : "";
  const payload = await fetchJson(`/api/subjectspace/library${query}`);
  library = payload.constructs ?? [];
  renderLibrary();

  if (!lastPayload || lastPayload.construct?.subjectId !== currentSubjectId) {
    renderIdleState();
  }
}

async function loadSubjects(preferredSubjectId = "") {
  const payload = await fetchJson("/api/subjectspace/subjects");
  subjects = payload.subjects ?? [];
  const preferredExists = preferredSubjectId && subjects.some((subject) => subject.subjectId === preferredSubjectId);
  const currentExists = currentSubjectId && subjects.some((subject) => subject.subjectId === currentSubjectId);

  currentSubjectId = preferredExists
    ? preferredSubjectId
    : currentExists
      ? currentSubjectId
      : payload.defaultSubjectId ?? subjects[0]?.subjectId ?? "";

  renderSubjectPicker();
  await loadLibrary();
}

async function handleRecallSubmit(event) {
  event.preventDefault();
  const question = recallQuestionInput.value.trim();

  if (!question) {
    recallMetaEl.textContent = "Type a recall prompt first.";
    renderIdleState();
    return;
  }

  resetTransientState();
  lastQuestion = question;
  recallMetaEl.textContent = "Activating strands...";

  try {
    const payload = await postJson("/api/subjectspace/answer", {
      subjectId: currentSubjectId,
      question
    });

    const matchedScore = Number(payload.recall?.readiness?.matchedScore ?? 0);
    const routeLabel = payload.recall?.routing?.label ?? "";
    recallMetaEl.textContent = payload.recall?.ready
      ? `${routeLabel || "Stable recall"} at ${matchedScore.toFixed(1)}`
      : (routeLabel || "Nothing crossed the stability threshold yet.");
    renderAnswer(payload);
  } catch (error) {
    recallMetaEl.textContent = "Recall failed.";
    renderAnswer({
      answer: error instanceof Error ? error.message : "Unable to recall that construct.",
      recall: {
        trace: null,
        candidates: []
      }
    });
  }
}

async function handleLearnSubmit(event) {
  event.preventDefault();

  const subjectLabel = learnSubjectInput.value.trim() || currentSubjectLabel();
  const activeLabel = currentSubjectLabel().toLowerCase();
  const subjectMatchesActive = subjectLabel.toLowerCase() === activeLabel;
  const payload = {
    subjectId: subjectMatchesActive ? (currentSubjectId || undefined) : undefined,
    subjectLabel,
    constructLabel: learnConstructInput.value.trim(),
    target: learnTargetInput.value.trim(),
    objective: learnObjectiveInput.value.trim(),
    context: learnContextInput.value,
    steps: learnStepsInput.value,
    notes: learnNotesInput.value.trim(),
    tags: learnTagsInput.value
  };

  if (!payload.constructLabel && !payload.target) {
    learnMetaEl.textContent = "Name the construct or at least describe the target.";
    return;
  }

  learnMetaEl.textContent = "Writing construct to Strandspace memory...";

  try {
    const response = await postJson("/api/subjectspace/learn", payload);

    const saved = response.construct;
    currentSubjectId = saved.subjectId;
    resetTransientState();
    learnMetaEl.textContent = `Stored in ${saved.subjectLabel}.`;
    await loadSubjects(saved.subjectId);
    recallQuestionInput.value = buildExampleQuestion(saved);
    renderAnswer(previewPayload(saved));

    learnConstructInput.value = "";
    learnTargetInput.value = "";
    learnObjectiveInput.value = "";
    learnContextInput.value = "";
    learnStepsInput.value = "";
    learnNotesInput.value = "";
    learnTagsInput.value = "";
    learnSubjectInput.value = saved.subjectLabel;
  } catch (error) {
    learnMetaEl.textContent = error instanceof Error ? error.message : "Unable to save that construct.";
  }
}

async function runApiAssist() {
  if (!lastQuestion) {
    recallMetaEl.textContent = "Run a recall prompt before asking for API assist.";
    return;
  }

  recallMetaEl.textContent = "Running OpenAI assist...";
  startLlmActivity({
    kind: "OpenAI assist",
    provider: "openai",
    model: assistStatus.model,
    message: "Requesting API validation/expansion..."
  });

  try {
    latestAssist = await postJson("/api/subjectspace/assist", {
      subjectId: currentSubjectId,
      question: lastQuestion
    });

    const llm = latestAssist.llm ?? {};
    finishLlmActivity({
      kind: "OpenAI assist",
      provider: llm.provider ?? "openai",
      model: llm.model ?? assistStatus.model,
      latencyMs: llm.latencyMs ?? null,
      inputTokens: llm.inputTokens ?? null,
      outputTokens: llm.outputTokens ?? null,
      totalTokens: llm.totalTokens ?? null
    });
    recallMetaEl.textContent = `API assist returned ${latestAssist.assist?.apiAction ?? "a draft"}.`;
    renderAnswer(lastPayload);
  } catch (error) {
    recallMetaEl.textContent = error instanceof Error ? error.message : "API assist failed.";
    failLlmActivity(error instanceof Error ? error.message : "API assist failed.");
    latestAssist = null;
    renderAnswer(lastPayload);
  }
}

async function saveApiAssist() {
  if (!latestAssist?.suggestedConstruct) {
    return;
  }

  recallMetaEl.textContent = "Saving API draft into Strandspace...";

  try {
    const response = await postJson("/api/subjectspace/learn", latestAssist.suggestedConstruct);

    latestAssist.savedConstruct = response.construct;
    currentSubjectId = response.construct.subjectId;
    latestComparison = null;
    await loadSubjects(response.construct.subjectId);
    recallQuestionInput.value = buildExampleQuestion(response.construct);
    recallMetaEl.textContent = "API draft saved to local Strandspace memory.";
    renderAnswer(previewPayload(response.construct));
  } catch (error) {
    recallMetaEl.textContent = error instanceof Error ? error.message : "Unable to save the API draft.";
    renderAnswer(lastPayload);
  }
}

async function runSpeedCompare() {
  const question = activeBenchmarkQuestion();

  if (!question) {
    recallMetaEl.textContent = "Type a prompt or run recall before benchmarking.";
    renderSpeedReport();
    return;
  }

  lastQuestion = question;
  benchmarkState = {
    phase: "loading",
    message: assistStatus.enabled
      ? "Timing Strandbase recall against the LLM assist round-trip..."
      : "Timing local Strandbase recall. API assist is currently unavailable."
  };
  renderSpeedReport();
  if (assistStatus.enabled) {
    startLlmActivity({
      kind: "LLM benchmark",
      provider: "openai",
      model: assistStatus.model,
      message: "Timing LLM assist round-trip..."
    });
  } else {
    idleLlmActivity(assistStatus.reason);
  }

  try {
    latestComparison = await postJson("/api/subjectspace/compare", {
      subjectId: currentSubjectId,
      question
    });

    benchmarkState = {
      phase: "done",
      message: latestComparison.comparison?.summary ?? "Benchmark complete."
    };
    recallMetaEl.textContent = latestComparison.comparison?.summary ?? "Benchmark complete.";
    if (latestComparison.llm?.enabled) {
      finishLlmActivity({
        kind: "LLM benchmark",
        provider: latestComparison.llm?.provider ?? "openai",
        model: latestComparison.llm?.model ?? assistStatus.model,
        latencyMs: latestComparison.llm?.latencyMs ?? null,
        inputTokens: latestComparison.llm?.inputTokens ?? null,
        outputTokens: latestComparison.llm?.outputTokens ?? null,
        totalTokens: latestComparison.llm?.totalTokens ?? null
      });
    } else if (assistStatus.enabled) {
      idleLlmActivity(latestComparison.llm?.error ?? latestComparison.llm?.reason ?? "LLM benchmark did not run.");
    }
  } catch (error) {
    latestComparison = null;
    benchmarkState = {
      phase: "error",
      message: error instanceof Error ? error.message : "Unable to benchmark this prompt."
    };
    recallMetaEl.textContent = "Benchmark failed.";
    if (assistStatus.enabled) {
      failLlmActivity(error instanceof Error ? error.message : "Unable to benchmark this prompt.");
    }
  }

  renderSpeedReport();
}

subjectSelect?.addEventListener("change", async () => {
  currentSubjectId = subjectSelect.value;
  resetTransientState();
  renderSubjectPicker();
  await loadLibrary();
});

recallForm?.addEventListener("submit", handleRecallSubmit);
learnForm?.addEventListener("submit", handleLearnSubmit);

libraryListEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-construct-id]") : null;
  if (!button) {
    return;
  }

  const construct = library.find((item) => item.id === button.getAttribute("data-construct-id"));
  if (!construct) {
    return;
  }

  resetTransientState();
  recallQuestionInput.value = buildExampleQuestion(construct);
  renderAnswer(previewPayload(construct));
});

exampleRowEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-example-id]") : null;
  if (!button) {
    return;
  }

  const construct = library.find((item) => item.id === button.getAttribute("data-example-id"));
  if (!construct) {
    return;
  }

  resetTransientState();
  recallQuestionInput.value = buildExampleQuestion(construct);
  recallQuestionInput.focus();
  renderAnswer(previewPayload(construct));
});

answerPanelEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-assist-action]") : null;
  if (!button) {
    return;
  }

  const action = button.getAttribute("data-assist-action");
  if (action === "run") {
    void runApiAssist();
  }
  if (action === "save") {
    void saveApiAssist();
  }
});

speedCompareButton?.addEventListener("click", () => {
  void runSpeedCompare();
});

Promise.all([loadAssistStatus(), loadSubjects()]).catch((error) => {
  subjectMetaEl.textContent = error instanceof Error ? error.message : "Unable to load Strandspace Studio.";
  recallMetaEl.textContent = "Startup failed.";
  renderAnswer({
    answer: error instanceof Error ? error.message : "Unable to load the workspace.",
    recall: {
      trace: null,
      candidates: []
    }
  });
});
