const subjectSelect = document.getElementById("subject-select");
const subjectMetaEl = document.getElementById("subject-meta");
const recallForm = document.getElementById("recall-form");
const recallQuestionInput = document.getElementById("recall-question");
const recallMetaEl = document.getElementById("recall-meta");
const suggestedRowEl = document.getElementById("suggested-row");
const exampleRowEl = document.getElementById("example-row");
const answerPanelEl = document.getElementById("answer-panel");
const traceGridEl = document.getElementById("trace-grid");
const traceSummaryEl = document.getElementById("trace-summary");
const speedMetaEl = document.getElementById("speed-meta");
const speedReportEl = document.getElementById("speed-report");
const speedCompareButton = document.getElementById("speed-compare-button");
const libraryMetaEl = document.getElementById("library-meta");
const libraryListEl = document.getElementById("library-list");
const resetExamplesButton = document.getElementById("reset-examples-button");
const systemStatusBadgeEl = document.getElementById("system-status-badge");
const themeToggleButton = document.getElementById("theme-toggle");
const builderForm = document.getElementById("builder-form");
const builderMetaEl = document.getElementById("builder-meta");
const builderInput = document.getElementById("builder-input");
const builderChecksEl = document.getElementById("builder-checks");
const learnForm = document.getElementById("learn-form");
const learnMetaEl = document.getElementById("learn-meta");
const learnModeMetaEl = document.getElementById("learn-mode-meta");
const learnCancelEditButton = document.getElementById("learn-cancel-edit");
const learnSubmitButton = document.getElementById("learn-submit-button");
const learnSubjectInput = document.getElementById("learn-subject");
const learnConstructInput = document.getElementById("learn-construct");
const learnTargetInput = document.getElementById("learn-target");
const learnObjectiveInput = document.getElementById("learn-objective");
const learnContextInput = document.getElementById("learn-context");
const learnStepsInput = document.getElementById("learn-steps");
const learnNotesInput = document.getElementById("learn-notes");
const learnTagsInput = document.getElementById("learn-tags");
const isBuilderPage = document.body?.classList.contains("builder-page");
const subjectStorageKey = "strandspace:last-subject-id";
const themeStorageKey = "strandspace:theme";
const fallbackSuggestedPrompts = [
  "How do I set gain staging for a full band before soundcheck?",
  "Recall my conference room speech coverage preset.",
  "What is my festival stage scene recall habit?",
  "How should I troubleshoot a vocal that disappears in the mix?"
];

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
let systemHealth = null;
let editorState = {
  mode: "new",
  constructId: "",
  subjectId: "",
  constructLabel: "",
  subjectLabel: ""
};

const recallSubmitButton = recallForm?.querySelector("button[type=\"submit\"]");
const builderSubmitButton = builderForm?.querySelector("button[type=\"submit\"]");

function readStoredSubjectId() {
  try {
    return String(window.localStorage.getItem(subjectStorageKey) ?? "").trim();
  } catch {
    return "";
  }
}

function storeSubjectId(subjectId = "") {
  const value = String(subjectId ?? "").trim();
  if (!value) {
    return;
  }

  try {
    window.localStorage.setItem(subjectStorageKey, value);
  } catch {
    // Ignore localStorage failures.
  }
}

function readStoredTheme() {
  try {
    return String(window.localStorage.getItem(themeStorageKey) ?? "").trim();
  } catch {
    return "";
  }
}

function applyTheme(theme = "") {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  if (themeToggleButton) {
    themeToggleButton.textContent = normalized === "dark" ? "Light Mode" : "Dark Mode";
  }

  try {
    window.localStorage.setItem(themeStorageKey, normalized);
  } catch {
    // Ignore localStorage failures.
  }
}

function renderSystemStatusBadge(health = null) {
  systemHealth = health;
  if (!systemStatusBadgeEl) {
    return;
  }

  if (!health) {
    systemStatusBadgeEl.className = "status-badge warn";
    systemStatusBadgeEl.textContent = "Status unavailable";
    return;
  }

  if (health.openai?.enabled) {
    systemStatusBadgeEl.className = "status-badge assist";
    systemStatusBadgeEl.textContent = `Assist enabled · ${health.openai.model ?? "OpenAI"}`;
    return;
  }

  systemStatusBadgeEl.className = "status-badge local";
  systemStatusBadgeEl.textContent = "Local-only mode";
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function setButtonBusy(button, isBusy, busyText = "Working...") {
  if (!button) {
    return;
  }

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent ?? "";
  }

  button.disabled = Boolean(isBusy);
  button.classList.toggle("is-busy", Boolean(isBusy));
  button.textContent = isBusy ? busyText : button.dataset.defaultLabel;
}

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

function formatTokenCount(value, { approximate = false } = {}) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }

  const rounded = Math.round(Number(value));
  return `${approximate ? "~" : ""}${rounded} token${rounded === 1 ? "" : "s"}`;
}

function previewQuestion(value = "", limit = 112) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1)}...`;
}

function renderSourceLinks(sources = [], { compact = false } = {}) {
  const items = Array.isArray(sources) ? sources : [];
  if (!items.length) {
    return "";
  }

  return items
    .map((source) => `
      <a class="source-link${compact ? " compact" : ""}" href="${escapeHtml(source.url ?? "#")}" target="_blank" rel="noreferrer">
        ${escapeHtml(source.label ?? source.fileName ?? "Open source")}
      </a>
    `)
    .join("");
}

function activeBenchmarkQuestion() {
  return String(recallQuestionInput?.value ?? "").trim() || lastQuestion;
}

function benchmarkSummaryLine(comparisonPayload = null) {
  const local = comparisonPayload?.local ?? {};
  const llm = comparisonPayload?.llm ?? {};
  const comparison = comparisonPayload?.comparison ?? {};
  const prompts = comparisonPayload?.prompts ?? {};
  const promptSavings = Number(prompts.benchmark?.tokenSavings ?? 0);

  if (!comparisonPayload) {
    return "";
  }

  if (comparison.available) {
    return `Strandbase ${formatMilliseconds(local.latencyMs)} | LLM ${formatMilliseconds(llm.latencyMs)} | ${comparison.speedup}x faster${promptSavings > 0 ? ` | ${promptSavings} est. tokens saved` : ""}`;
  }

  if (Number.isFinite(Number(local.latencyMs))) {
    return `Strandbase ${formatMilliseconds(local.latencyMs)} | LLM ${formatMilliseconds(llm.latencyMs)} | ${llm.error ?? llm.reason ?? "LLM unavailable"}${promptSavings > 0 ? ` | ${promptSavings} est. tokens saved` : ""}`;
  }

  return comparison.summary ?? benchmarkState.message ?? "";
}

function latencyBarWidth(value, reference) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(reference)) || Number(reference) <= 0) {
    return 8;
  }

  return Math.max(8, Math.min(100, Math.round((Number(value) / Number(reference)) * 100)));
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

function renderSuggestedPrompts() {
  if (!suggestedRowEl) {
    return;
  }

  const prompts = library.length
    ? library.slice(0, 4).map((construct) => buildExampleQuestion(construct))
    : fallbackSuggestedPrompts;

  suggestedRowEl.innerHTML = prompts
    .map((prompt, index) => `
      <button type="button" class="example-pill subtle-chip" data-suggested-prompt="${escapeHtml(prompt)}" style="--delay:${index * 45}ms">
        ${escapeHtml(previewQuestion(prompt, 72))}
      </button>
    `)
    .join("");
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
    },
    checkedReferences: [],
    buildChecks: []
  };
}

function draftPayload(construct, {
  source = "heuristic",
  input = "",
  mergeMode = "draft",
  checkedReferences = [],
  buildChecks = []
} = {}) {
  const confidence = source === "openai" ? 0.86 : 0.72;
  const draft = {
    ...construct,
    learnedCount: Number(construct.learnedCount ?? 1)
  };
  const mergedIntoExisting = mergeMode === "extend";

  return {
    source: "builder",
    question: input,
    answer: mergedIntoExisting
      ? (source === "openai"
        ? `New input was merged into the active construct with OpenAI assist. Review the changes, tighten anything ambiguous, then update it in Strandspace.`
        : `New input was merged into the active construct locally. Review the changes, tighten anything ambiguous, then update it in Strandspace.`)
      : (source === "openai"
        ? `Construct draft built from your input with OpenAI assist. Review the fields, tighten anything ambiguous, then save it to Strandspace.`
        : `Construct draft built locally from your input. Review the fields, tighten anything ambiguous, then save it to Strandspace.`),
    construct: draft,
    recall: {
      ready: true,
      readiness: {
        matchedScore: 1,
        matchedRatio: 1,
        margin: 1,
        confidence
      },
      candidates: [
        {
          constructLabel: draft.constructLabel,
          score: 1
        }
      ],
      routing: {
        mode: "builder_draft",
        label: mergedIntoExisting
          ? (source === "openai" ? "OpenAI-assisted construct extension" : "Local construct extension")
          : (source === "openai" ? "OpenAI-assisted construct draft" : "Local construct draft"),
        confidence,
        margin: 1,
        matchedRatio: 1,
        apiRecommended: false,
        reason: mergedIntoExisting
          ? (source === "openai"
            ? "The builder merged new notes into the active construct and used the API to refine the update."
            : "The builder merged new notes into the active construct using local parsing only.")
          : (source === "openai"
            ? "The builder converted your notes into a structured construct draft and used the API to refine it."
            : "The builder converted your notes into a structured construct draft using local parsing only."),
        nextAction: mergedIntoExisting
          ? "Review the merged fields, then update the construct when it looks right."
          : "Review the generated fields, then store the construct when it looks right.",
        promptDraft: "",
        missingKeywords: []
      },
      trace: previewTrace(draft)
    },
    checkedReferences,
    buildChecks
  };
}

function serializeContext(context = {}) {
  return contextEntries(context)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function serializeSteps(steps = []) {
  return (Array.isArray(steps) ? steps : [])
    .map((step) => String(step ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function applyConstructDraftToLearnForm(construct = {}) {
  learnSubjectInput.value = construct.subjectLabel ?? "";
  learnConstructInput.value = construct.constructLabel ?? "";
  learnTargetInput.value = construct.target ?? "";
  learnObjectiveInput.value = construct.objective ?? "";
  learnContextInput.value = serializeContext(construct.context);
  learnStepsInput.value = serializeSteps(construct.steps);
  learnNotesInput.value = construct.notes ?? "";
  learnTagsInput.value = Array.isArray(construct.tags) ? construct.tags.join(", ") : "";
}

function clearLearnForm({ subjectLabel = "" } = {}) {
  learnSubjectInput.value = subjectLabel;
  learnConstructInput.value = "";
  learnTargetInput.value = "";
  learnObjectiveInput.value = "";
  learnContextInput.value = "";
  learnStepsInput.value = "";
  learnNotesInput.value = "";
  learnTagsInput.value = "";
}

function renderBuilderChecks({ buildChecks = [], checkedReferences = [] } = {}) {
  if (!builderChecksEl) {
    return;
  }

  const checks = Array.isArray(buildChecks) ? buildChecks : [];
  const references = Array.isArray(checkedReferences) ? checkedReferences : [];

  if (!checks.length && !references.length) {
    builderChecksEl.className = "builder-checks empty";
    builderChecksEl.innerHTML = "<p>Builder checks will appear here after you draft a construct.</p>";
    return;
  }

  builderChecksEl.className = "builder-checks";
  builderChecksEl.innerHTML = `
    ${checks.length
      ? `
        <div class="builder-check-list">
          ${checks.map((check) => `<p>${escapeHtml(check)}</p>`).join("")}
        </div>
      `
      : ""}
    ${references.length
      ? `
        <div class="builder-reference-list">
          ${references.map((reference) => `
            <article class="builder-reference-item">
              <div>
                <strong>${escapeHtml(reference.constructLabel ?? "Reference construct")}</strong>
                <span>${escapeHtml(reference.matchReason || reference.subjectLabel || "Checked reference")}</span>
              </div>
              <div class="source-row">
                ${renderSourceLinks(reference.sources ?? [], { compact: true })}
              </div>
            </article>
          `).join("")}
        </div>
      `
      : ""}
  `;
}

function hasEditorBaseConstruct() {
  return Boolean(editorState.constructId) && editorState.mode !== "new";
}

function currentEditorLabel() {
  return editorState.constructLabel || learnConstructInput.value.trim() || "this construct";
}

function learnModeText() {
  if (editorState.mode === "saved") {
    return `Editing "${currentEditorLabel()}". Save to update this construct in place, or stop editing to create a new one.`;
  }

  if (editorState.mode === "draft") {
    return `Working on a draft. Builder input will keep adding to "${currentEditorLabel()}". Save when the construct looks right.`;
  }

  return "Create a new construct or load one from the library to edit it.";
}

function builderModeText() {
  if (editorState.mode === "saved") {
    return `Add notes here to extend "${currentEditorLabel()}". New details will merge into the loaded construct.`;
  }

  if (editorState.mode === "draft") {
    return `Add more notes to keep extending the current draft before you save it.`;
  }

  return "Paste rough notes and draft a Strandspace construct before saving it.";
}

function syncEditorUi({ learnMessage = null, builderMessage = null } = {}) {
  if (learnModeMetaEl) {
    learnModeMetaEl.textContent = learnMessage ?? learnModeText();
  }

  if (builderMetaEl) {
    builderMetaEl.textContent = builderMessage ?? builderModeText();
  }

  if (learnSubmitButton) {
    learnSubmitButton.textContent = editorState.mode === "saved" ? "Update construct" : "Store construct";
  }

  if (learnCancelEditButton) {
    learnCancelEditButton.hidden = editorState.mode === "new";
    learnCancelEditButton.textContent = editorState.mode === "saved" ? "Stop editing" : "Clear draft";
  }

  learnForm?.classList.toggle("is-editing", editorState.mode === "saved");
  learnForm?.classList.toggle("is-drafting", editorState.mode === "draft");
}

function setEditorState(mode = "new", construct = {}) {
  editorState = {
    mode,
    constructId: String(construct.id ?? "").trim(),
    subjectId: String(construct.subjectId ?? "").trim(),
    constructLabel: String(construct.constructLabel ?? "").trim(),
    subjectLabel: String(construct.subjectLabel ?? "").trim()
  };
  syncEditorUi();
  renderLibrary();
  renderBuilderChecks();
}

function clearEditorState({ resetForm = false, subjectLabel = "" } = {}) {
  editorState = {
    mode: "new",
    constructId: "",
    subjectId: "",
    constructLabel: "",
    subjectLabel: ""
  };

  if (resetForm) {
    clearLearnForm({
      subjectLabel: subjectLabel || currentSubjectLabel()
    });
  }

  syncEditorUi();
  renderLibrary();
  renderBuilderChecks();
}

function buildLearnPayload() {
  const subjectLabel = learnSubjectInput.value.trim() || currentSubjectLabel();
  const activeLabel = currentSubjectLabel().toLowerCase();
  const subjectMatchesActive = subjectLabel.toLowerCase() === activeLabel;

  return {
    id: hasEditorBaseConstruct() ? (editorState.constructId || undefined) : undefined,
    subjectId: hasEditorBaseConstruct()
      ? (editorState.subjectId || (subjectMatchesActive ? (currentSubjectId || undefined) : undefined))
      : (subjectMatchesActive ? (currentSubjectId || undefined) : undefined),
    subjectLabel,
    constructLabel: learnConstructInput.value.trim(),
    target: learnTargetInput.value.trim(),
    objective: learnObjectiveInput.value.trim(),
    context: learnContextInput.value,
    steps: learnStepsInput.value,
    notes: learnNotesInput.value.trim(),
    tags: learnTagsInput.value
  };
}

function loadConstructIntoEditor(construct = {}, { mode = "saved", focus = false } = {}) {
  applyConstructDraftToLearnForm(construct);
  setEditorState(mode, construct);
  learnMetaEl.textContent = mode === "saved"
    ? `Editing "${construct.constructLabel}". Update any field, or add more notes with the builder.`
    : "Draft loaded into the form. Review it, then save it to Strandspace.";

  if (focus) {
    learnConstructInput.focus();
  }
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
  renderSpeedReport();
}

async function loadSystemHealth() {
  try {
    const payload = await fetchJson("/api/system/health");
    renderSystemStatusBadge(payload);
  } catch {
    renderSystemStatusBadge(null);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = [
      payload.error ?? `Request failed with ${response.status}`,
      payload.detail ?? "",
      payload.code ? `Code: ${payload.code}` : ""
    ].filter(Boolean).join(" ");
    throw new Error(message);
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

async function resetWithExamples() {
  setButtonBusy(resetExamplesButton, true, "Resetting...");

  try {
    const payload = await postJson("/api/system/reset-examples", {});
    resetTransientState();
    await loadSubjects("");
    renderIdleState();
    learnMetaEl.textContent = "Bundled examples restored.";
    recallMetaEl.textContent = "Example constructs were reloaded.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset the example constructs.";
    learnMetaEl.textContent = message;
    recallMetaEl.textContent = message;
  } finally {
    setButtonBusy(resetExamplesButton, false);
  }
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
        <p><span class="spinner-inline" aria-hidden="true"></span>${escapeHtml(benchmarkState.message || "Timing both paths now...")}</p>
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
  const prompts = latestComparison.prompts ?? {};
  const originalPrompt = prompts.original ?? {};
  const benchmarkPrompt = prompts.benchmark ?? {};
  const llmReady = Boolean(comparison.available);
  const llmPromptUsesActualTokens = llm.promptTokenSource === "usage";
  const promptSavings = Number(benchmarkPrompt.tokenSavings ?? 0);
  const maxLatency = Math.max(Number(local.latencyMs ?? 0), Number(llm.latencyMs ?? 0), 1);

  speedMetaEl.textContent = benchmarkSummaryLine(latestComparison) || comparison.summary || "Benchmark complete.";
  speedReportEl.className = "speed-report";
  speedReportEl.innerHTML = `
    <div class="speed-prompt-grid">
      <article class="speed-prompt-card">
        <p class="assist-kicker">Original prompt</p>
        <strong class="speed-latency">${escapeHtml(formatTokenCount(originalPrompt.estimatedTokens, { approximate: true }))}</strong>
        <p>"${escapeHtml(previewQuestion(originalPrompt.question ?? benchmarkQuestion, 140))}"</p>
        <div class="speed-notes">
          <span>${escapeHtml(`${Math.round(Number(originalPrompt.wordCount ?? 0))} words`)}</span>
          <span>${escapeHtml(`${Math.round(Number(originalPrompt.characterCount ?? 0))} chars`)}</span>
        </div>
      </article>
      <article class="speed-prompt-card${benchmarkPrompt.optimized ? " optimized" : " disabled"}">
        <p class="assist-kicker">Benchmark prompt</p>
        <strong class="speed-latency">${escapeHtml(formatTokenCount(benchmarkPrompt.estimatedTokens, { approximate: true }))}</strong>
        <p>"${escapeHtml(previewQuestion(benchmarkPrompt.question ?? benchmarkQuestion, 140))}"</p>
        <div class="speed-notes">
          <span>${escapeHtml(benchmarkPrompt.optimized ? "Same construct confirmed locally" : "Original prompt kept")}</span>
          <span>${escapeHtml(promptSavings > 0 ? `${promptSavings} est. tokens saved` : benchmarkPrompt.selectionReason ?? "No prompt shortening available")}</span>
        </div>
      </article>
    </div>
    <div class="speed-grid">
      <article class="speed-card strandbase">
        <p class="assist-kicker">Local path</p>
        <h3>${escapeHtml(local.label ?? "Strandbase recall")}</h3>
        <strong class="speed-latency">${escapeHtml(formatMilliseconds(local.latencyMs))}</strong>
        <div class="speed-bar" aria-hidden="true">
          <span class="speed-bar-fill strandbase" style="width:${latencyBarWidth(local.latencyMs, maxLatency)}%"></span>
        </div>
        <p>${escapeHtml(local.constructLabel ?? "No stable construct matched yet.")}</p>
        <div class="speed-notes">
          <span>${escapeHtml(formatTokenCount(benchmarkPrompt.estimatedTokens, { approximate: true }))}</span>
          <span>Route ${escapeHtml(local.route ?? "unresolved")}</span>
          <span>Confidence ${escapeHtml(formatPercent(local.confidence ?? 0))}</span>
        </div>
      </article>
      <article class="speed-card llm${llmReady ? "" : " disabled"}">
        <p class="assist-kicker">LLM path</p>
        <h3>${escapeHtml(llm.label ?? "LLM assist round-trip")}</h3>
        <strong class="speed-latency">${escapeHtml(formatMilliseconds(llm.latencyMs))}</strong>
        <div class="speed-bar" aria-hidden="true">
          <span class="speed-bar-fill llm" style="width:${latencyBarWidth(llm.latencyMs, maxLatency)}%"></span>
        </div>
        <p>${escapeHtml(llm.constructLabel ?? llm.error ?? llm.reason ?? "No LLM result was captured for this run.")}</p>
        <div class="speed-notes">
          <span>${escapeHtml(llm.model ?? "API")}</span>
          <span>${escapeHtml(formatTokenCount(llm.promptTokens, { approximate: !llmPromptUsesActualTokens }))}${llmPromptUsesActualTokens ? " actual" : " est."}</span>
          ${Number.isFinite(Number(llm.totalTokens))
            ? `<span>${escapeHtml(`${formatTokenCount(llm.totalTokens)} total`)}</span>`
            : ""}
          <span>${escapeHtml(llm.apiAction ?? (llm.enabled ? "assist" : "unavailable"))}</span>
        </div>
      </article>
    </div>
    <div class="speed-summary">
      <p>${escapeHtml(comparison.summary ?? "Benchmark complete.")}</p>
      ${comparison.available
        ? `<p>Delta: ${escapeHtml(formatMilliseconds(comparison.deltaMs))}. Speedup: ${escapeHtml(String(comparison.speedup))}x.${promptSavings > 0 ? ` Compact prompt savings: ${escapeHtml(formatTokenCount(promptSavings, { approximate: true }))}.` : ""}</p>`
        : `<p>Prompt: "${escapeHtml(previewQuestion(benchmarkPrompt.question ?? benchmarkQuestion))}"</p>`}
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
  const sources = Array.isArray(construct.sources) ? construct.sources : [];
  const checkedReferences = Array.isArray(payload.checkedReferences) ? payload.checkedReferences : [];
  const buildChecks = Array.isArray(payload.buildChecks) ? payload.buildChecks : [];
  const stableScore = Number(readiness.matchedScore ?? 0);
  const answerKicker = payload.source === "preview"
    ? "Stored construct preview"
    : payload.source === "builder"
      ? "Construct draft"
      : "Expression field stabilized";
  const constructIsStored = library.some((item) => item.id === construct.id);
  const constructLoaded = editorState.constructId === construct.id
    && ((constructIsStored && editorState.mode === "saved") || (!constructIsStored && editorState.mode === "draft"));
  const answerActionLabel = constructIsStored ? "Edit construct" : "Load draft into editor";
  const answerActions = payload.source === "builder" && constructLoaded
    ? ""
    : `
      <div class="answer-actions">
        <button
          type="button"
          class="assist-action-button"
          data-construct-action="edit"
          data-construct-id="${escapeHtml(construct.id ?? "")}"
          ${constructLoaded ? "disabled" : ""}
        >${escapeHtml(constructLoaded ? "Loaded in editor" : answerActionLabel)}</button>
      </div>
    `;

  answerPanelEl.className = "answer-surface";
  answerPanelEl.innerHTML = `
    <p class="answer-kicker">${escapeHtml(answerKicker)}</p>
    <h2>${escapeHtml(construct.constructLabel)}</h2>
    <p class="answer-copy">${escapeHtml(payload.answer ?? "Strandspace emitted a reusable construct.")}</p>
    <div class="answer-strip">
      <span>${escapeHtml(construct.subjectLabel)}</span>
      <span>${escapeHtml(construct.target || "general target")}</span>
      <span>${escapeHtml(construct.objective || `score ${stableScore.toFixed(1)}`)}</span>
    </div>
    ${answerActions}
    ${renderRoutingPanel(routing, readiness)}
    ${renderAssistResult()}
    ${sources.length
      ? `
        <div class="answer-sources">
          <p class="answer-label">Source documents</p>
          <div class="source-row">
            ${renderSourceLinks(sources)}
          </div>
        </div>
      `
      : ""}
    ${buildChecks.length || checkedReferences.length
      ? `
        <div class="answer-references">
          <p class="answer-label">Checked before draft</p>
          ${buildChecks.length
            ? `
              <div class="reference-checks">
                ${buildChecks.map((check) => `<p>${escapeHtml(check)}</p>`).join("")}
              </div>
            `
            : ""}
          ${checkedReferences.length
            ? `
              <div class="reference-list">
                ${checkedReferences.map((reference) => `
                  <article class="reference-card">
                    <div class="reference-copy">
                      <strong>${escapeHtml(reference.constructLabel ?? "Reference construct")}</strong>
                      <span>${escapeHtml(reference.subjectLabel ?? "")}</span>
                      <small>${escapeHtml(reference.matchReason || reference.objective || reference.target || "")}</small>
                    </div>
                    <div class="reference-actions">
                      <button
                        type="button"
                        class="assist-action-button"
                        data-construct-action="edit"
                        data-construct-id="${escapeHtml(reference.id ?? "")}"
                      >Load reference</button>
                      <div class="source-row">
                        ${renderSourceLinks(reference.sources ?? [], { compact: true })}
                      </div>
                    </div>
                  </article>
                `).join("")}
              </div>
            `
            : ""}
        </div>
      `
      : ""}
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
  if (editorState.mode === "new") {
    learnSubjectInput.value = active?.subjectLabel ?? learnSubjectInput.value;
  }
  syncEditorUi();
}

function renderExamples() {
  renderSuggestedPrompts();

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
      <button
        type="button"
        class="library-item${editorState.mode === "saved" && editorState.constructId === construct.id ? " is-editing" : ""}"
        data-construct-id="${escapeHtml(construct.id)}"
        style="--delay:${index * 55}ms"
      >
        <strong>${escapeHtml(construct.constructLabel)}</strong>
        <span>${escapeHtml(construct.target || construct.objective || construct.subjectLabel)}</span>
        <small>${escapeHtml(contextSummary(construct.context) || "Open to preview context")}</small>
      </button>
    `)
    .join("");

  renderExamples();
}

function renderIdleState() {
  if (!isBuilderPage && library[0]) {
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
  const storedSubjectId = readStoredSubjectId();
  const preferredExists = preferredSubjectId && subjects.some((subject) => subject.subjectId === preferredSubjectId);
  const storedExists = storedSubjectId && subjects.some((subject) => subject.subjectId === storedSubjectId);
  const currentExists = currentSubjectId && subjects.some((subject) => subject.subjectId === currentSubjectId);

  currentSubjectId = preferredExists
    ? preferredSubjectId
    : storedExists
      ? storedSubjectId
    : currentExists
      ? currentSubjectId
      : payload.defaultSubjectId ?? subjects[0]?.subjectId ?? "";

  storeSubjectId(currentSubjectId);
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
  setButtonBusy(recallSubmitButton, true, "Recalling...");

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
    recallMetaEl.textContent = error instanceof Error ? error.message : "Recall failed.";
    renderAnswer({
      answer: error instanceof Error ? error.message : "Unable to recall that construct.",
      recall: {
        trace: null,
        candidates: []
      }
    });
  } finally {
    setButtonBusy(recallSubmitButton, false);
  }
}

async function handleLearnSubmit(event) {
  event.preventDefault();

  const payload = buildLearnPayload();
  const isUpdatingSavedConstruct = editorState.mode === "saved";

  if (!payload.constructLabel && !payload.target) {
    learnMetaEl.textContent = "Name the construct or at least describe the target.";
    return;
  }

  learnMetaEl.textContent = isUpdatingSavedConstruct
    ? "Updating construct in Strandspace memory..."
    : "Writing construct to Strandspace memory...";
  setButtonBusy(learnSubmitButton, true, isUpdatingSavedConstruct ? "Updating..." : "Storing...");

  try {
    const response = await postJson("/api/subjectspace/learn", payload);

    const saved = response.construct;
    currentSubjectId = saved.subjectId;
    storeSubjectId(currentSubjectId);
    resetTransientState();
    await loadSubjects(saved.subjectId);
    recallQuestionInput.value = buildExampleQuestion(saved);
    renderAnswer(previewPayload(saved));

    if (isUpdatingSavedConstruct) {
      loadConstructIntoEditor(saved, { mode: "saved" });
      learnMetaEl.textContent = `Updated "${saved.constructLabel}" in ${saved.subjectLabel}.`;
    } else {
      clearEditorState({
        resetForm: true,
        subjectLabel: saved.subjectLabel
      });
      learnMetaEl.textContent = `Stored in ${saved.subjectLabel}.`;
    }

    builderInput.value = "";
  } catch (error) {
    learnMetaEl.textContent = error instanceof Error ? error.message : "Unable to save that construct.";
  } finally {
    setButtonBusy(learnSubmitButton, false);
  }
}

async function handleBuilderSubmit(event) {
  event.preventDefault();

  const input = builderInput.value.trim();
  if (!input) {
    builderMetaEl.textContent = "Paste some notes first so the builder has something to shape.";
    return;
  }

  builderMetaEl.textContent = "Building a construct draft...";
  setButtonBusy(builderSubmitButton, true, "Drafting...");

  try {
    const baseConstruct = hasEditorBaseConstruct() ? buildLearnPayload() : null;
    const response = await postJson("/api/subjectspace/build", {
      subjectId: currentSubjectId,
      subjectLabel: learnSubjectInput.value.trim() || currentSubjectLabel(),
      input,
      baseConstruct
    });
    const draft = response.suggestedConstruct ?? {};

    applyConstructDraftToLearnForm(draft);
    setEditorState(editorState.mode === "saved" ? "saved" : "draft", draft);
    renderBuilderChecks({
      buildChecks: response.buildChecks ?? [],
      checkedReferences: response.checkedReferences ?? []
    });
    resetTransientState();
    learnMetaEl.textContent = response.mergeMode === "extend"
      ? "Merged the new input into the current construct. Review the changes, then save them."
      : "Draft loaded into the form. Review it, then save it to Strandspace.";
    builderMetaEl.textContent = response.source === "openai"
      ? (response.mergeMode === "extend"
        ? "OpenAI refined and merged the new details into the active construct."
        : "OpenAI refined the draft from your input.")
      : (response.warning
        ? `Local draft loaded. API refinement was skipped: ${response.warning}`
        : (response.mergeMode === "extend"
          ? "Local construct merge loaded from your input."
          : "Local construct draft loaded from your input."));
    renderAnswer(draftPayload(draft, {
      source: response.source ?? "heuristic",
      input,
      mergeMode: response.mergeMode ?? "draft",
      checkedReferences: response.checkedReferences ?? [],
      buildChecks: response.buildChecks ?? []
    }));
  } catch (error) {
    builderMetaEl.textContent = error instanceof Error ? error.message : "Unable to build a construct draft.";
  } finally {
    setButtonBusy(builderSubmitButton, false);
  }
}

async function runApiAssist() {
  if (!lastQuestion) {
    recallMetaEl.textContent = "Run a recall prompt before asking for API assist.";
    return;
  }

  recallMetaEl.textContent = "Running OpenAI assist...";

  try {
    latestAssist = await postJson("/api/subjectspace/assist", {
      subjectId: currentSubjectId,
      question: lastQuestion
    });

    recallMetaEl.textContent = `API assist returned ${latestAssist.assist?.apiAction ?? "a draft"}.`;
    renderAnswer(lastPayload);
  } catch (error) {
    recallMetaEl.textContent = error instanceof Error ? error.message : "API assist failed.";
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
    storeSubjectId(currentSubjectId);
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
  setButtonBusy(speedCompareButton, true, "Benchmarking...");
  renderSpeedReport();

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
  } catch (error) {
    latestComparison = null;
    benchmarkState = {
      phase: "error",
      message: error instanceof Error ? error.message : "Unable to benchmark this prompt."
    };
    recallMetaEl.textContent = "Benchmark failed.";
  }

  setButtonBusy(speedCompareButton, false);
  renderSpeedReport();
}

subjectSelect?.addEventListener("change", async () => {
  currentSubjectId = subjectSelect.value;
  storeSubjectId(currentSubjectId);
  resetTransientState();
  renderSubjectPicker();
  await loadLibrary();
});

recallForm?.addEventListener("submit", handleRecallSubmit);
builderForm?.addEventListener("submit", handleBuilderSubmit);
learnForm?.addEventListener("submit", handleLearnSubmit);
learnCancelEditButton?.addEventListener("click", () => {
  clearEditorState({
    resetForm: true,
    subjectLabel: currentSubjectLabel()
  });
  learnMetaEl.textContent = "Edit mode cleared. The form is ready for a new construct.";
});

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

suggestedRowEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-suggested-prompt]") : null;
  if (!button) {
    return;
  }

  recallQuestionInput.value = button.getAttribute("data-suggested-prompt") ?? "";
  recallQuestionInput.focus();
});

answerPanelEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest("[data-assist-action], [data-construct-action]")
    : null;
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

  const constructAction = button.getAttribute("data-construct-action");
  if (constructAction === "edit") {
    const constructId = button.getAttribute("data-construct-id");
    const previewConstruct = library.find((item) => item.id === constructId)
      ?? (Array.isArray(lastPayload?.checkedReferences)
        ? lastPayload.checkedReferences.find((item) => item.id === constructId)
        : null)
      ?? lastPayload?.construct
      ?? null;

    if (previewConstruct) {
      loadConstructIntoEditor(previewConstruct, {
        mode: previewConstruct.id ? "saved" : "draft",
        focus: true
      });
      recallQuestionInput.value = buildExampleQuestion(previewConstruct);
      renderAnswer(previewPayload(previewConstruct));
    }
  }
});

speedCompareButton?.addEventListener("click", () => {
  void runSpeedCompare();
});

resetExamplesButton?.addEventListener("click", () => {
  void resetWithExamples();
});

themeToggleButton?.addEventListener("click", toggleTheme);

applyTheme(readStoredTheme() || "light");
syncEditorUi();
renderBuilderChecks();
renderSuggestedPrompts();

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
void loadSystemHealth();
