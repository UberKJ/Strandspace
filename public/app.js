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
const graphPanelEl = document.getElementById("graph-panel");
const graphMetaEl = document.getElementById("graph-meta");
const speedMetaEl = document.getElementById("speed-meta");
const speedReportEl = document.getElementById("speed-report");
const speedCompareButton = document.getElementById("speed-compare-button");
const benchmarkHistoryMetaEl = document.getElementById("benchmark-history-meta");
const benchmarkHistoryReportEl = document.getElementById("benchmark-history-report");
const benchmarkHistoryRefreshButton = document.getElementById("benchmark-history-refresh-button");
const benchmarkVariantMetaEl = document.getElementById("benchmark-variant-meta");
const benchmarkVariantModeEl = document.getElementById("benchmark-variant-mode");
const benchmarkWordBudgetEl = document.getElementById("benchmark-word-budget");
const benchmarkRepeatValueEl = document.getElementById("benchmark-repeat-value");
const benchmarkRepeatCountEl = document.getElementById("benchmark-repeat-count");
const benchmarkPreviewEl = document.getElementById("benchmark-preview");
const benchmarkUseVariantButton = document.getElementById("benchmark-use-variant-button");
const benchmarkRunVariantButton = document.getElementById("benchmark-run-variant-button");
const modelLabMetaEl = document.getElementById("model-lab-meta");
const llmProviderEl = document.getElementById("llm-provider");
const modelLabModelEl = document.getElementById("model-lab-model");
const modelLabPromptEl = document.getElementById("model-lab-prompt");
const modelLabReportEl = document.getElementById("model-lab-report");
const modelLabUseLastButton = document.getElementById("model-lab-use-last-button");
const modelLabGenerateButton = document.getElementById("model-lab-generate-button");
const modelLabCompareButton = document.getElementById("model-lab-compare-button");
const llmDebugMetaEl = document.getElementById("llm-debug-meta");
const llmDebugReportEl = document.getElementById("llm-debug-report");
const libraryMetaEl = document.getElementById("library-meta");
const libraryListEl = document.getElementById("library-list");
const resetExamplesButton = document.getElementById("reset-examples-button");
const systemStatusBadgeEl = document.getElementById("system-status-badge");
const themeToggleButton = document.getElementById("theme-toggle");
const builderForm = document.getElementById("builder-form");
const builderMetaEl = document.getElementById("builder-meta");
const builderInput = document.getElementById("builder-input");
const builderChecksEl = document.getElementById("builder-checks");
const subjectIdeasForm = document.getElementById("subject-ideas-form");
const subjectIdeasLabelInput = document.getElementById("subject-ideas-label");
const subjectIdeasInput = document.getElementById("subject-ideas-input");
const subjectIdeasMetaEl = document.getElementById("subject-ideas-meta");
const subjectIdeasResultsEl = document.getElementById("subject-ideas-results");
const subjectIdeasSubmitButton = document.getElementById("subject-ideas-submit");
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
const backendModeLabelEl = document.getElementById("backend-mode-label");
const backendModeDetailEl = document.getElementById("backend-mode-detail");
const backendSubjectCountEl = document.getElementById("backend-subject-count");
const backendConstructCountEl = document.getElementById("backend-construct-count");
const backendSoundCountEl = document.getElementById("backend-sound-count");
const backendSubjectStrandCountEl = document.getElementById("backend-subject-strand-count");
const backendLinkCountEl = document.getElementById("backend-link-count");
const backendDbPathEl = document.getElementById("backend-db-path");
const datasetHealthMetaEl = document.getElementById("dataset-health-meta");
const datasetHealthPanelEl = document.getElementById("dataset-health-panel");
const datasetHealthRefreshButton = document.getElementById("dataset-health-refresh");
const datasetCleanButton = document.getElementById("dataset-clean-button");
const backendDbSizeEl = document.getElementById("backend-db-size");
const backendDbMetaEl = document.getElementById("backend-db-meta");
const backendDbTableListEl = document.getElementById("backend-db-tables");
const backendDbRowsEl = document.getElementById("backend-db-rows");
const backendDbSchemaEl = document.getElementById("backend-db-schema");
const backendDbSearchInput = document.getElementById("backend-db-search");
const backendDbRefreshButton = document.getElementById("backend-db-refresh");
const backendDbPrevButton = document.getElementById("backend-db-prev");
const backendDbNextButton = document.getElementById("backend-db-next");
const backendDbEditorForm = document.getElementById("backend-db-editor-form");
const backendDbEditorFieldsEl = document.getElementById("backend-db-editor-fields");
const backendDbEditorMetaEl = document.getElementById("backend-db-editor-meta");
const isBuilderPage = document.body?.classList.contains("builder-page");
const subjectStorageKey = "strandspace:last-subject-id";
const themeStorageKey = "strandspace:theme";
const pendingDraftStorageKey = "strandspace:pending-draft";
const defaultModelLabProviders = [
  {
    provider: "openai",
    label: "OpenAI Assist",
    available: false,
    enabled: false,
    defaultModel: "gpt-5.4-mini",
    models: [
      { id: "gpt-5.4-mini", name: "gpt-5.4-mini", provider: "openai" },
      { id: "gpt-5.4", name: "gpt-5.4", provider: "openai" },
      { id: "gpt-5.2", name: "gpt-5.2", provider: "openai" }
    ],
    reason: "Configured fallback model list loaded in the browser.",
    capabilities: ["draft", "compare", "populate"]
  }
];
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
let modelLabStatus = {
  providers: defaultModelLabProviders,
  defaultProvider: "openai",
  defaultModel: "gpt-5.4-mini",
  reason: "Checking OpenAI model access...",
  requestTimeoutMs: 20000,
  benchmarkTimeoutMs: 45000
};
let latestModelLabRun = null;
let modelLabState = {
  phase: "idle",
  message: ""
};
let modelDebugEntries = [];
let benchmarkReports = null;
let systemHealth = null;
let latestSubjectIdeas = null;
let backendOverview = null;
let datasetHealth = null;
let lastRenderedTrace = null;
let lastRenderedGraphConstruct = null;
const pagedListSize = 5;
const MODEL_LAB_STATUS_FETCH_TIMEOUT_MS = 8000;
const MODEL_LAB_REPORTS_FETCH_TIMEOUT_MS = 8000;

function normalizedTimeoutMs(value, fallbackMs) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function modelLabRequestTimeoutMs(mode = "request") {
  const fallback = mode === "benchmark" ? 45000 : 20000;
  const base = normalizedTimeoutMs(
    mode === "benchmark" ? modelLabStatus.benchmarkTimeoutMs : modelLabStatus.requestTimeoutMs,
    fallback
  );
  return Math.max(8000, Math.min(base + 5000, 65000));
}

function modelLabTimeoutMessage(mode = "request") {
  const timeoutMs = modelLabRequestTimeoutMs(mode);
  const label = mode === "benchmark" ? "Benchmark compare" : "Model lab request";
  return `${label} timed out after ${formatMilliseconds(timeoutMs)}. Try \`gpt-5.4-mini\`, shorten the prompt, or run the compare again.`;
}
let pagerState = {
  suggestedPrompts: 0,
  examplePrompts: 0
};
let tracePagerState = {};
let backendDbState = {
  table: "subject_constructs",
  label: "",
  primaryKey: "id",
  editableColumns: [],
  columns: [],
  rows: [],
  offset: 0,
  limit: 15,
  total: 0,
  search: "",
  selectedRowId: "",
  selectedRow: null
};
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

function readPendingDraft() {
  try {
    const raw = window.sessionStorage.getItem(pendingDraftStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingDraft() {
  try {
    window.sessionStorage.removeItem(pendingDraftStorageKey);
  } catch {
    // Ignore sessionStorage failures.
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
    systemStatusBadgeEl.textContent = `Assist enabled - ${health.openai.model ?? "OpenAI"}`;
    return;
  }

  systemStatusBadgeEl.className = "status-badge local";
  systemStatusBadgeEl.textContent = "Local-only mode";
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function formatBytes(value = 0) {
  const size = Number(value ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "n/a";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
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

function formatTimestamp(value = "") {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
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

function pageItems(items = [], page = 0, pageSize = pagedListSize) {
  const values = Array.isArray(items) ? items : [];
  const totalPages = Math.max(1, Math.ceil(values.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
  const start = safePage * pageSize;

  return {
    items: values.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    totalItems: values.length
  };
}

function pagerControlsMarkup({ target = "", page = 0, totalPages = 1, compact = false } = {}) {
  if (totalPages <= 1) {
    return "";
  }

  return `
    <div class="pager-controls${compact ? " compact" : ""}">
      <button type="button" class="secondary-button subtle-button pager-button" data-page-target="${escapeHtml(target)}" data-page-action="prev" ${page <= 0 ? "disabled" : ""}>Back</button>
      <span class="pager-status">Page ${page + 1} of ${totalPages}</span>
      <button type="button" class="secondary-button subtle-button pager-button" data-page-target="${escapeHtml(target)}" data-page-action="next" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
    </div>
  `;
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

function activeModelLabPrompt() {
  return String(modelLabPromptEl?.value ?? "").trim() || activeBenchmarkQuestion();
}

function selectedModelProvider() {
  return String(llmProviderEl?.value ?? modelLabStatus.defaultProvider ?? "openai").trim() || "openai";
}

function selectedProviderMeta() {
  const provider = selectedModelProvider();
  const providers = Array.isArray(modelLabStatus.providers) ? modelLabStatus.providers : [];
  return providers.find((entry) => entry.provider === provider) ?? null;
}

function selectedModelLabel() {
  const providerMeta = selectedProviderMeta();
  const model = String(modelLabModelEl?.value ?? providerMeta?.defaultModel ?? "").trim();
  if (!providerMeta) {
    return model || "OpenAI model";
  }

  return model ? `${providerMeta.label} - ${model}` : providerMeta.label;
}

function activeModelGrounding() {
  return true;
}

function activeBenchmarkBasePrompt() {
  return String(
    latestComparison?.prompts?.benchmark?.question
    ?? latestComparison?.question
    ?? activeBenchmarkQuestion()
    ?? ""
  ).trim();
}

function promptKeywords(value = "") {
  return [...new Set(
    String(value ?? "")
      .trim()
      .split(/[^A-Za-z0-9]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item.length > 2)
  )];
}

function currentConstructForTesting() {
  const construct = lastPayload?.construct ?? lastPayload?.recall?.matched ?? null;
  return construct && typeof construct === "object" ? construct : null;
}

function extendPromptWithConstruct(basePrompt = "", wordBudget = 8) {
  const construct = currentConstructForTesting();
  const segments = [
    basePrompt,
    construct?.target,
    construct?.objective,
    ...(construct?.tags ?? []).slice(0, 4),
    ...contextEntries(construct?.context ?? {}).slice(0, 2).map(([key, value]) => `${key} ${value}`)
  ]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  const words = [];

  for (const segment of segments) {
    for (const token of segment.split(/\s+/)) {
      if (!token) {
        continue;
      }
      words.push(token);
      if (words.length >= wordBudget) {
        return words.join(" ");
      }
    }
  }

  return words.join(" ").trim();
}

function buildBenchmarkVariantPrompt() {
  const basePrompt = activeBenchmarkBasePrompt();
  const mode = String(benchmarkVariantModeEl?.value ?? "fewer").trim() || "fewer";
  const wordBudget = Math.max(3, Math.min(Number(benchmarkWordBudgetEl?.value ?? 8) || 8, 48));
  const repeatValue = String(benchmarkRepeatValueEl?.value ?? "").trim();
  const repeatCount = Math.max(0, Math.min(Number(benchmarkRepeatCountEl?.value ?? 3) || 0, 8));
  const keywords = promptKeywords(basePrompt);
  const compactPrompt = keywords.slice(0, wordBudget).join(" ").trim() || basePrompt;
  const expandedPrompt = extendPromptWithConstruct(basePrompt, Math.max(wordBudget, basePrompt.split(/\s+/).filter(Boolean).length));
  const repeatedCue = repeatValue
    ? Array.from({ length: repeatCount }, () => repeatValue).join(" ").trim()
    : "";

  let question = basePrompt;
  let modeLabel = "Base prompt";
  if (mode === "fewer") {
    question = compactPrompt;
    modeLabel = "Fewer cue words";
  } else if (mode === "more") {
    question = expandedPrompt || basePrompt;
    modeLabel = "More context words";
  } else if (mode === "repetitive") {
    question = [basePrompt, repeatedCue].filter(Boolean).join(" ").trim() || basePrompt;
    modeLabel = "Repeated cue value";
  } else if (mode === "mixed") {
    question = [compactPrompt, repeatedCue].filter(Boolean).join(" ").trim() || compactPrompt;
    modeLabel = "Fewer words plus repeat cue";
  }

  const words = question ? question.split(/\s+/).filter(Boolean).length : 0;
  return {
    basePrompt,
    question: question.trim() || basePrompt,
    mode,
    modeLabel,
    wordBudget,
    repeatValue,
    repeatCount,
    wordCount: words,
    tokenEstimate: Math.max(1, Math.round(words * 1.35)),
    changed: normalizePrompt(question) !== normalizePrompt(basePrompt)
  };
}

function normalizePrompt(value = "") {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
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

function buildRecallSearchQuery(construct = {}) {
  const constructLabel = String(construct.constructLabel ?? "").trim();
  if (constructLabel) {
    return constructLabel;
  }

  const target = String(construct.target ?? construct.name ?? "").trim();
  if (target) {
    return target;
  }

  const objective = String(construct.objective ?? "").trim();
  if (objective) {
    return objective;
  }

  return "Stored construct";
}

function buildExampleQuestion(construct) {
  return buildRecallSearchQuery(construct);
}

function syncEditorToRecalledConstruct(payload = null, { focus = false } = {}) {
  const recalledConstruct = payload?.construct ?? payload?.recall?.matched ?? null;
  if (!recalledConstruct?.constructLabel) {
    return false;
  }

  loadConstructIntoEditor(recalledConstruct, {
    mode: recalledConstruct.id ? "saved" : "draft",
    focus
  });
  learnMetaEl.textContent = `Recalled "${recalledConstruct.constructLabel}" and loaded it into the editor.`;
  builderMetaEl.textContent = "Local recall loaded the matched construct into the backend editor so you can inspect it, refine it, or extend it.";
  return true;
}

async function loadPendingDraftIfPresent() {
  const draft = readPendingDraft();
  if (!draft || typeof draft !== "object") {
    return;
  }

  const targetSubjectId = String(draft.subjectId ?? "").trim();
  if (targetSubjectId && subjects.some((subject) => subject.subjectId === targetSubjectId) && targetSubjectId !== currentSubjectId) {
    currentSubjectId = targetSubjectId;
    storeSubjectId(currentSubjectId);
    renderSubjectPicker();
    await loadLibrary();
  }

  resetTransientState();
  applyConstructDraftToLearnForm(draft);
  setEditorState("draft", draft);
  renderBuilderChecks();
  renderAnswer(draftPayload(draft, {
    source: String(draft.provenance?.source ?? "").includes("openai") ? "openai" : "heuristic",
    input: draft.provenance?.learnedFromQuestion ?? ""
  }));
  builderMetaEl.textContent = "Pending draft loaded from the landing page. Review it, refine it, then save it into Strandspace.";
  learnMetaEl.textContent = `Loaded "${draft.constructLabel ?? "pending draft"}" into the backend editor.`;
  clearPendingDraft();
}

function renderSuggestedPrompts() {
  if (!suggestedRowEl) {
    return;
  }

  const prompts = library.length
    ? library.map((construct) => ({
      query: buildRecallSearchQuery(construct),
      constructId: construct.id,
      label: construct.constructLabel || buildRecallSearchQuery(construct)
    }))
    : fallbackSuggestedPrompts.map((prompt) => ({
      query: prompt,
      constructId: "",
      label: prompt
    }));
  const paged = pageItems(prompts, pagerState.suggestedPrompts);
  pagerState.suggestedPrompts = paged.page;

  suggestedRowEl.innerHTML = `
    <div class="example-pill-grid">
      ${paged.items
    .map((prompt, index) => `
      <button
        type="button"
        class="example-pill subtle-chip"
        data-suggested-prompt="${escapeHtml(prompt.query)}"
        data-suggested-construct-id="${escapeHtml(prompt.constructId)}"
        style="--delay:${index * 45}ms"
      >
        ${escapeHtml(previewQuestion(prompt.label, 72))}
      </button>
    `)
    .join("")}
    </div>
    ${pagerControlsMarkup({
      target: "suggestedPrompts",
      page: paged.page,
      totalPages: paged.totalPages
    })}
  `;
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
    persistentStrands: (construct.constructStrands ?? []).slice(0, 6).map((strand) => ({
      name: strand.label ?? strand.strandKey,
      value: `${strand.layer ?? "anchor"}/${strand.role ?? "feature"}`
    })),
    activatedStrands: (construct.constructStrands ?? []).slice(0, 3).map((strand) => ({
      name: strand.label ?? strand.strandKey,
      value: "preview activation"
    })),
    linkedStrands: (construct.linkedConstructs ?? []).slice(0, 4).map((item) => ({
      name: item.constructLabel ?? item.relatedConstructId,
      value: item.reason ?? "related construct"
    })),
    binderStrands: (construct.binderPreview ?? []).slice(0, 4).map((item) => ({
      name: `${item.leftTerm} + ${item.rightTerm}`,
      value: `weight ${Number(item.weight ?? 0).toFixed(2)}`
    })),
    stabilizedMemory: [
      { name: construct.constructLabel, score: Number(construct.learnedCount ?? 1), role: "selected" }
    ],
    expressionField: `Previewing a stored construct in ${construct.subjectLabel} before recall is triggered.`
  };
}

function renderGraph(construct = null) {
  lastRenderedGraphConstruct = construct;
  if (!graphPanelEl || !graphMetaEl) {
    return;
  }

  if (!construct) {
    graphMetaEl.textContent = "Inspect the current construct as strands, binders, and linked memories, then jump into the editable graph tables.";
    graphPanelEl.className = "trace-grid empty";
    graphPanelEl.innerHTML = "<p>Load or recall a construct to see its local strand graph.</p>";
    return;
  }

  const constructStrands = Array.isArray(construct.constructStrands) ? construct.constructStrands : [];
  const subjectStrands = Array.isArray(construct.subjectStrandPreview) ? construct.subjectStrandPreview : [];
  const linkedConstructs = Array.isArray(construct.linkedConstructs) ? construct.linkedConstructs : [];
  const binders = Array.isArray(construct.binderPreview) ? construct.binderPreview : [];

  graphMetaEl.textContent = `${constructStrands.length} construct strands, ${subjectStrands.length} subject strands, ${linkedConstructs.length} links, and ${binders.length} binder cues around "${construct.constructLabel}".`;
  graphPanelEl.className = "trace-grid";
  graphPanelEl.innerHTML = `
    <section class="trace-lane">
      <header><h3>Construct strands</h3></header>
      <div class="trace-chip-row">
        ${constructStrands.length
          ? constructStrands.slice(0, 10).map((strand) => `
              <article class="trace-chip">
                <strong>${escapeHtml(strand.label ?? strand.strandKey ?? "strand")}</strong>
                <span>${escapeHtml(`${strand.layer ?? "anchor"}/${strand.role ?? "feature"} - ${Number(strand.weight ?? 0).toFixed(2)}`)}</span>
              </article>
            `).join("")
          : "<p class=\"trace-empty\">No construct strands are attached yet.</p>"}
      </div>
    </section>
    <section class="trace-lane">
      <header><h3>Top subject strands</h3></header>
      <div class="trace-chip-row">
        ${subjectStrands.length
          ? subjectStrands.slice(0, 10).map((strand) => `
              <article class="trace-chip">
                <strong>${escapeHtml(strand.label ?? strand.strandKey ?? "strand")}</strong>
                <span>${escapeHtml(`${strand.constructCount ?? 0} constructs - ${strand.usageCount ?? 0} recalls`)}</span>
              </article>
            `).join("")
          : "<p class=\"trace-empty\">No subject strand summary is available yet.</p>"}
      </div>
    </section>
    <section class="trace-lane">
      <header><h3>Linked constructs</h3></header>
      <div class="trace-chip-row">
        ${linkedConstructs.length
          ? linkedConstructs.slice(0, 8).map((item) => `
              <article class="trace-chip">
                <strong>${escapeHtml(item.constructLabel ?? item.relatedConstructId ?? "linked construct")}</strong>
                <span>${escapeHtml(item.reason ?? `score ${Number(item.score ?? 0).toFixed(2)}`)}</span>
              </article>
            `).join("")
          : "<p class=\"trace-empty\">No linked constructs are attached yet.</p>"}
      </div>
    </section>
    <section class="trace-lane">
      <header><h3>Binder reinforcement</h3></header>
      <div class="trace-chip-row">
        ${binders.length
          ? binders.slice(0, 8).map((item) => `
              <article class="trace-chip">
                <strong>${escapeHtml(`${item.leftTerm ?? ""} + ${item.rightTerm ?? ""}`)}</strong>
                <span>${escapeHtml(`weight ${Number(item.weight ?? 0).toFixed(2)} - ${item.reason ?? item.source ?? "binder"}`)}</span>
              </article>
            `).join("")
          : "<p class=\"trace-empty\">No binder cues are available yet.</p>"}
      </div>
    </section>
  `;
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

function suggestionToDraftConstruct(suggestion = {}, subjectLabel = "") {
  const resolvedSubjectLabel = String(subjectLabel ?? "").trim() || currentSubjectLabel();
  const matchingSubject = subjects.find((item) => item.subjectLabel.toLowerCase() === resolvedSubjectLabel.toLowerCase());

  return {
    subjectId: matchingSubject?.subjectId ?? "",
    subjectLabel: resolvedSubjectLabel,
    constructLabel: suggestion.constructLabel ?? "Suggested construct",
    target: suggestion.target ?? "",
    objective: suggestion.objective ?? "",
    context: suggestion.context ?? {},
    steps: Array.isArray(suggestion.starterSteps) ? suggestion.starterSteps : [],
    notes: suggestion.rationale ?? "",
    tags: Array.isArray(suggestion.tags) ? suggestion.tags : []
  };
}

function renderSubjectIdeas() {
  if (!subjectIdeasResultsEl) {
    return;
  }

  const suggestions = Array.isArray(latestSubjectIdeas?.suggestedConstructs) ? latestSubjectIdeas.suggestedConstructs : [];
  if (!suggestions.length) {
    subjectIdeasResultsEl.className = "subject-ideas-results empty";
    subjectIdeasResultsEl.innerHTML = "<p>Suggested constructs will appear here after you describe a subject.</p>";
    return;
  }

  subjectIdeasResultsEl.className = "subject-ideas-results";
  subjectIdeasResultsEl.innerHTML = `
    <div class="subject-ideas-summary">
      <strong>${escapeHtml(latestSubjectIdeas.subjectLabel ?? "Suggested subject")}</strong>
      <p>${escapeHtml(latestSubjectIdeas.subjectSummary ?? "AI suggested starter constructs for this subject.")}</p>
    </div>
    <div class="subject-ideas-grid">
      ${suggestions.map((suggestion, index) => `
        <article class="subject-idea-card">
          <div class="section-head compact">
            <div>
              <p class="eyebrow small">Suggested construct ${index + 1}</p>
              <h3>${escapeHtml(suggestion.constructLabel ?? "Suggested construct")}</h3>
            </div>
            <button type="button" class="assist-action-button" data-subject-idea-index="${index}">Load into builder</button>
          </div>
          <p class="meta"><strong>Target:</strong> ${escapeHtml(suggestion.target ?? "")}</p>
          <p class="meta"><strong>Objective:</strong> ${escapeHtml(suggestion.objective ?? "")}</p>
          <p class="meta">${escapeHtml(suggestion.rationale ?? "")}</p>
          ${Array.isArray(suggestion.starterSteps) && suggestion.starterSteps.length ? `
            <div class="review-list">
              <strong>Starter steps</strong>
              <ul>
                ${suggestion.starterSteps.slice(0, 5).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
              </ul>
            </div>
          ` : ""}
          ${Array.isArray(suggestion.tags) && suggestion.tags.length ? `
            <div class="chip-row">
              ${suggestion.tags.slice(0, 8).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
            </div>
          ` : ""}
        </article>
      `).join("")}
    </div>
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
  renderModelLabReport();
}

async function loadSystemHealth() {
  try {
    const payload = await fetchJson("/api/system/health");
    renderSystemStatusBadge(payload);
  } catch {
    renderSystemStatusBadge(null);
  }
}

function syncModelLabModelOptions() {
  if (!modelLabModelEl || !llmProviderEl) {
    return;
  }

  const providers = Array.isArray(modelLabStatus.providers) && modelLabStatus.providers.length
    ? modelLabStatus.providers
    : defaultModelLabProviders;
  const currentProvider = selectedModelProvider();
  if (!providers.length) {
    llmProviderEl.innerHTML = `<option value="">OpenAI unavailable</option>`;
    llmProviderEl.disabled = true;
    modelLabModelEl.innerHTML = `<option value="">No models available</option>`;
    modelLabModelEl.disabled = true;
    return;
  }

  llmProviderEl.disabled = false;
  llmProviderEl.innerHTML = providers.map((provider) => `
    <option value="${escapeHtml(provider.provider)}">${escapeHtml(provider.label)}</option>
  `).join("");
  llmProviderEl.value = providers.some((provider) => provider.provider === currentProvider)
    ? currentProvider
    : (modelLabStatus.defaultProvider ?? providers[0].provider);

  const providerMeta = selectedProviderMeta();
  const models = Array.isArray(providerMeta?.models) ? providerMeta.models : [];
  const selectedValue = String(modelLabModelEl.value ?? "").trim()
    || String(providerMeta?.defaultModel ?? modelLabStatus.defaultModel ?? "").trim();

  if (!models.length) {
    const fallbackModels = defaultModelLabProviders[0]?.models ?? [];
    if (!fallbackModels.length) {
      modelLabModelEl.innerHTML = `<option value="">${escapeHtml(providerMeta?.available ? "No models available" : (providerMeta?.reason || "Provider unavailable"))}</option>`;
      modelLabModelEl.disabled = true;
      return;
    }

    modelLabModelEl.disabled = false;
    modelLabModelEl.innerHTML = fallbackModels.map((model) => `
      <option value="${escapeHtml(model.name ?? model.id ?? "")}">${escapeHtml(model.name ?? model.id ?? "")}</option>
    `).join("");
    modelLabModelEl.value = String(providerMeta?.defaultModel ?? modelLabStatus.defaultModel ?? fallbackModels[0].name ?? fallbackModels[0].id ?? "");
    return;
  }

  modelLabModelEl.disabled = false;
  modelLabModelEl.innerHTML = models.map((model) => `
    <option value="${escapeHtml(model.name ?? model.id ?? "")}">${escapeHtml(model.name ?? model.id ?? "")}</option>
  `).join("");

  const exactMatch = models.find((model) => (model.name ?? model.id) === selectedValue);
  modelLabModelEl.value = String(exactMatch?.name ?? exactMatch?.id ?? models[0].name ?? models[0].id ?? "");
}

function renderModelLabOutput(text = "") {
  const value = String(text ?? "").trim();
  if (!value) {
    return "<p class=\"meta\">No model output was returned for this run.</p>";
  }

  return `<p class="model-lab-output">${escapeHtml(value).replaceAll("\n", "<br />")}</p>`;
}

function renderModelLabStats(stats = null) {
  if (!stats || typeof stats !== "object") {
    return "";
  }

  const items = [
    Number.isFinite(Number(stats.promptEvalCount)) && Number(stats.promptEvalCount) > 0
      ? `${Math.round(Number(stats.promptEvalCount))} prompt eval`
      : "",
    Number.isFinite(Number(stats.evalCount)) && Number(stats.evalCount) > 0
      ? `${Math.round(Number(stats.evalCount))} output eval`
      : "",
    Number.isFinite(Number(stats.totalDurationMs))
      ? `${formatMilliseconds(stats.totalDurationMs)} total`
      : ""
  ].filter(Boolean);

  return items.length
    ? `<div class="speed-notes">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
}

function appendModelDebugEntry(entry = null) {
  if (!entry || typeof entry !== "object") {
    return;
  }

  modelDebugEntries = [entry, ...modelDebugEntries].slice(0, 10);
  renderModelDebugWindow();
}

function renderModelDebugWindow() {
  if (!llmDebugReportEl || !llmDebugMetaEl) {
    return;
  }

  if (!modelDebugEntries.length) {
    llmDebugMetaEl.textContent = "The backend keeps the latest model prompts and returns here so you can inspect how each provider is shaping Strandspace input.";
    llmDebugReportEl.className = "trace-grid empty";
    llmDebugReportEl.innerHTML = "<p>Run a model draft or benchmark compare to inspect the raw question, request prompt, and model return.</p>";
    return;
  }

  llmDebugMetaEl.textContent = `${modelDebugEntries.length} recent model call${modelDebugEntries.length === 1 ? "" : "s"} captured from the backend lab.`;
  llmDebugReportEl.className = "trace-grid debug-grid";
  llmDebugReportEl.innerHTML = modelDebugEntries.map((entry) => `
    <article class="debug-card">
      <div class="assist-head">
        <div>
          <p class="assist-kicker">${escapeHtml(entry.mode === "compare" ? "Compare call" : "Draft call")}</p>
          <h3>${escapeHtml(entry.providerLabel || entry.provider || "OpenAI model")}</h3>
        </div>
        <span class="assist-badge">${escapeHtml(entry.model || "default model")}</span>
      </div>
      <div class="speed-notes">
        <span>${escapeHtml(entry.grounded ? "grounded" : "raw question")}</span>
        ${entry.promptMode ? `<span>${escapeHtml(entry.promptMode)}</span>` : ""}
        ${Number.isFinite(Number(entry.latencyMs)) ? `<span>${escapeHtml(formatMilliseconds(entry.latencyMs))}</span>` : ""}
      </div>
      <div class="debug-block">
        <p class="answer-label">Question</p>
        <pre>${escapeHtml(entry.question || "")}</pre>
      </div>
      <div class="debug-block">
        <p class="answer-label">Request prompt</p>
        <pre>${escapeHtml(entry.requestPrompt || entry.question || "")}</pre>
      </div>
      <div class="debug-block">
        <p class="answer-label">Return</p>
        <pre>${escapeHtml(entry.error || entry.responseText || "(no return text)")}</pre>
      </div>
      ${entry.constructLabel
        ? `<p class="meta">Draft construct: ${escapeHtml(entry.constructLabel)}</p>`
        : ""}
    </article>
  `).join("");
}

function renderBenchmarkReports() {
  if (!benchmarkHistoryMetaEl || !benchmarkHistoryReportEl) {
    return;
  }

  const reports = benchmarkReports ?? backendOverview?.modelLabReports ?? null;
  const recent = Array.isArray(reports?.recent) ? reports.recent : [];
  const summaryByModel = Array.isArray(reports?.summaryByModel) ? reports.summaryByModel : [];

  if (!reports || (!recent.length && !summaryByModel.length)) {
    benchmarkHistoryMetaEl.textContent = "Manual benchmark runs will be stored here after you trigger them from the backend.";
    benchmarkHistoryReportEl.className = "speed-report empty";
    benchmarkHistoryReportEl.innerHTML = "<p>Use the benchmark buttons above to save repeatable test runs, then refresh this page and keep comparing OpenAI models against the same Strandspace field.</p>";
    return;
  }

  benchmarkHistoryMetaEl.textContent = `${reports.totalRuns ?? recent.length} stored manual benchmark run${Number(reports.totalRuns ?? recent.length) === 1 ? "" : "s"} across ${reports.providerModelCount ?? summaryByModel.length} OpenAI model paths.`;
  benchmarkHistoryReportEl.className = "speed-report";
  benchmarkHistoryReportEl.innerHTML = `
    <div class="benchmark-report-summary">
      <article class="speed-card strandbase">
        <p class="assist-kicker">Stored runs</p>
        <h3>${escapeHtml(String(reports.totalRuns ?? recent.length))}</h3>
        <p>Only backend-triggered compare actions are stored, so refreshing the page keeps the same test history.</p>
      </article>
      <article class="speed-card llm">
        <p class="assist-kicker">Covered paths</p>
        <h3>${escapeHtml(String(reports.providerModelCount ?? summaryByModel.length))}</h3>
        <p>${escapeHtml(String(reports.subjectCount ?? 0))} subjects have benchmark history attached to them.</p>
      </article>
    </div>
    ${summaryByModel.length
      ? `
        <div class="benchmark-model-grid">
          ${summaryByModel.map((item) => `
            <article class="benchmark-model-card">
              <div class="assist-head">
                <div>
                  <p class="assist-kicker">${escapeHtml(item.providerLabel ?? "OpenAI")}</p>
                  <h3>${escapeHtml(item.model || "default model")}</h3>
                </div>
                <span class="assist-badge">${escapeHtml(`${item.runCount ?? 0} runs`)}</span>
              </div>
              <div class="speed-notes">
                <span>Local avg ${escapeHtml(formatMilliseconds(item.averageLocalLatencyMs))}</span>
                <span>Model avg ${escapeHtml(formatMilliseconds(item.averageLlmLatencyMs))}</span>
                ${Number.isFinite(Number(item.averageSpeedup)) ? `<span>${escapeHtml(`${item.averageSpeedup}x avg speedup`)}</span>` : ""}
              </div>
              <p class="meta">Last run ${escapeHtml(formatTimestamp(item.lastRunAt))}</p>
            </article>
          `).join("")}
        </div>
      `
      : ""}
    <div class="benchmark-history-list">
      ${recent.map((item) => `
        <article class="benchmark-history-item">
          <div class="assist-head">
            <div>
              <p class="assist-kicker">${escapeHtml(item.testLabel || "Manual benchmark")}</p>
              <h3>${escapeHtml(item.providerLabel || item.provider || "OpenAI")} - ${escapeHtml(item.model || "default model")}</h3>
            </div>
            <span class="assist-badge">${escapeHtml(formatTimestamp(item.createdAt))}</span>
          </div>
          <p class="meta">${escapeHtml(previewQuestion(item.benchmarkQuestion || item.question || "", 180))}</p>
          <div class="speed-notes">
            <span>Local ${escapeHtml(formatMilliseconds(item.localLatencyMs))}</span>
            <span>Model ${escapeHtml(formatMilliseconds(item.llmLatencyMs))}</span>
            ${Number.isFinite(Number(item.speedup)) ? `<span>${escapeHtml(`${item.speedup}x`)}</span>` : ""}
            <span>${escapeHtml(item.grounded ? "grounded" : "raw question")}</span>
          </div>
          <p>${escapeHtml(item.summary || "Benchmark stored.")}</p>
          <div class="action-row">
            <button
              type="button"
              class="secondary-button subtle-button"
              data-benchmark-question="${escapeHtml(item.question || item.benchmarkQuestion || "")}"
            >Use this prompt</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderModelLabReport() {
  if (!modelLabMetaEl || !modelLabReportEl) {
    return;
  }

  syncModelLabModelOptions();
  const providerMeta = selectedProviderMeta();
  const reachable = Boolean(providerMeta?.available);
  const prompt = activeModelLabPrompt();
  const hasPrompt = Boolean(normalizePrompt(prompt));
  const modelLabel = String(modelLabModelEl?.value ?? providerMeta?.defaultModel ?? modelLabStatus.defaultModel ?? "").trim();
  const isLoading = modelLabState.phase === "loading";
  const loadingText = modelLabState.message || "Running selected OpenAI model...";

  if (modelLabUseLastButton) {
    modelLabUseLastButton.disabled = !activeBenchmarkQuestion();
  }
  if (modelLabGenerateButton) {
    modelLabGenerateButton.disabled = !reachable || isLoading || !hasPrompt;
    modelLabGenerateButton.textContent = isLoading ? "Running..." : "Build construct draft";
  }
  if (modelLabCompareButton) {
    modelLabCompareButton.disabled = !reachable || isLoading || !hasPrompt;
    modelLabCompareButton.textContent = isLoading ? "Comparing..." : "Compare local vs OpenAI";
  }

  if (!reachable) {
    modelLabMetaEl.textContent = providerMeta?.reason || modelLabStatus.reason || "No OpenAI model is available.";
    modelLabReportEl.className = "speed-report empty";
    modelLabReportEl.innerHTML = `
      <p>${escapeHtml(providerMeta?.reason || modelLabStatus.reason || "No OpenAI model is available.")}</p>
      <p>Check your API key and configured OpenAI model list, then try again. Benchmark timeout budget: ${escapeHtml(formatMilliseconds(modelLabStatus.benchmarkTimeoutMs ?? modelLabStatus.requestTimeoutMs ?? 45000))}.</p>
    `;
    renderBenchmarkVariantLab();
    return;
  }

  if (isLoading) {
    modelLabMetaEl.textContent = loadingText;
    modelLabReportEl.className = "speed-report loading";
    modelLabReportEl.innerHTML = `
      <div class="speed-summary">
        <p><span class="spinner-inline" aria-hidden="true"></span>${escapeHtml(loadingText)}</p>
        <p>Prompt: "${escapeHtml(previewQuestion(prompt || activeBenchmarkQuestion()))}"</p>
      </div>
    `;
    renderBenchmarkVariantLab();
    return;
  }

  if (modelLabState.phase === "error") {
    modelLabMetaEl.textContent = modelLabState.message || "Model request failed.";
    modelLabReportEl.className = "speed-report error";
    modelLabReportEl.innerHTML = `
      <div class="speed-summary speed-summary-error">
        <p>${escapeHtml(modelLabState.message || "Model request failed.")}</p>
      </div>
    `;
    renderBenchmarkVariantLab();
    return;
  }

  if (!latestModelLabRun) {
    modelLabMetaEl.textContent = hasPrompt
      ? (providerMeta?.reason || `${providerMeta?.label || "OpenAI"} is ready.`)
      : "Enter a backend prompt before running model tests.";
    modelLabReportEl.className = "speed-report empty";
    modelLabReportEl.innerHTML = `
      <p>Ready on ${escapeHtml(modelLabel || "the first available model")}.</p>
      <p>${escapeHtml(prompt ? `Current prompt: "${previewQuestion(prompt)}"` : "Paste a prompt or load one from recall before running draft or compare mode.")}</p>
    `;
    renderBenchmarkVariantLab();
    return;
  }

  const payload = latestModelLabRun.payload ?? {};
  const local = payload.local ?? {};
  const recall = payload.recall ?? {};
  const modelRun = payload.model ?? payload.llm ?? {};
  const comparison = payload.comparison ?? {};
  const grounded = Boolean(payload.grounded ?? payload.debug?.grounded);
  const modeLabel = latestModelLabRun.mode === "compare" ? "Compare mode" : "Draft mode";
  const maxLatency = Math.max(Number(local.latencyMs ?? payload.recallLatencyMs ?? 0), Number(modelRun.latencyMs ?? 0), 1);
  const providerLabel = String(modelRun.providerLabel ?? providerMeta?.label ?? "OpenAI model").trim();

  modelLabMetaEl.textContent = grounded
    ? `${modeLabel}. ${providerLabel} was grounded with the best local construct before answering.`
    : `${modeLabel}. ${providerLabel} answered from the raw question only.`;

  if (latestModelLabRun.mode === "generate") {
    const generatedDraft = payload.suggestedConstruct ?? modelRun.draft ?? null;
    modelLabReportEl.className = "speed-report";
    modelLabReportEl.innerHTML = `
      <div class="speed-grid">
        <article class="speed-card strandbase${recall.ready ? "" : " disabled"}">
          <p class="assist-kicker">Local recall</p>
          <h3>${escapeHtml(local.label ?? "Strandbase recall")}</h3>
          <strong class="speed-latency">${escapeHtml(formatMilliseconds(payload.recallLatencyMs))}</strong>
          <div class="speed-bar" aria-hidden="true">
            <span class="speed-bar-fill strandbase" style="width:${latencyBarWidth(payload.recallLatencyMs, maxLatency)}%"></span>
          </div>
          <p>${escapeHtml(recall.matched?.constructLabel ?? recall.answer ?? "No stable local construct matched this prompt.")}</p>
          <div class="speed-notes">
            <span>${escapeHtml(recall.ready ? "Grounding available" : "No stable local grounding")}</span>
            <span>${escapeHtml(`Route ${recall.routing?.mode ?? "unresolved"}`)}</span>
          </div>
        </article>
        <article class="speed-card llm">
          <p class="assist-kicker">Model output</p>
          <h3>${escapeHtml(modelRun.model ?? modelLabel ?? "OpenAI model")}</h3>
          <strong class="speed-latency">${escapeHtml(formatMilliseconds(modelRun.latencyMs))}</strong>
          <div class="speed-bar" aria-hidden="true">
            <span class="speed-bar-fill llm" style="width:${latencyBarWidth(modelRun.latencyMs, maxLatency)}%"></span>
          </div>
          ${renderModelLabOutput(modelRun.answer || modelRun.output)}
          ${renderModelLabStats(modelRun.stats ?? modelRun.usage)}
          ${generatedDraft ? `<p class="meta">Draft construct: ${escapeHtml(generatedDraft.constructLabel ?? "Generated construct")}</p>` : ""}
        </article>
      </div>
    `;
    renderBenchmarkVariantLab();
    return;
  }

  modelLabReportEl.className = "speed-report";
  modelLabReportEl.innerHTML = `
    <div class="speed-grid">
      <article class="speed-card strandbase">
        <p class="assist-kicker">Local path</p>
        <h3>${escapeHtml(local.label ?? "Strandbase recall")}</h3>
        <strong class="speed-latency">${escapeHtml(formatMilliseconds(local.latencyMs))}</strong>
        <div class="speed-bar" aria-hidden="true">
          <span class="speed-bar-fill strandbase" style="width:${latencyBarWidth(local.latencyMs, maxLatency)}%"></span>
        </div>
        <p>${escapeHtml(local.constructLabel ?? local.answer ?? "No stable construct matched.")}</p>
        <div class="speed-notes">
          <span>${escapeHtml(`Route ${local.route ?? "unresolved"}`)}</span>
          <span>${escapeHtml(`Confidence ${formatPercent(local.confidence ?? 0)}`)}</span>
        </div>
      </article>
      <article class="speed-card llm${modelRun.error ? " disabled" : ""}">
        <p class="assist-kicker">${escapeHtml(providerLabel)} path</p>
        <h3>${escapeHtml(modelRun.model ?? modelLabel ?? "OpenAI model")}</h3>
        <strong class="speed-latency">${escapeHtml(formatMilliseconds(modelRun.latencyMs))}</strong>
        <div class="speed-bar" aria-hidden="true">
          <span class="speed-bar-fill llm" style="width:${latencyBarWidth(modelRun.latencyMs, maxLatency)}%"></span>
        </div>
        ${renderModelLabOutput(modelRun.output || modelRun.error || modelRun.reason)}
        ${renderModelLabStats(modelRun.stats ?? modelRun.usage)}
      </article>
    </div>
    <div class="speed-summary">
      <p>${escapeHtml(comparison.summary ?? "Model comparison complete.")}</p>
      <p>${escapeHtml(grounded ? "Grounding mode: local construct attached before generation." : "Grounding mode: raw question only.")}</p>
    </div>
  `;
  renderBenchmarkVariantLab();
}

async function loadModelLabStatus() {
  if (!modelLabMetaEl) {
    return;
  }

  try {
    const payload = await fetchJson("/api/model-lab/status", {
      timeoutMs: MODEL_LAB_STATUS_FETCH_TIMEOUT_MS,
      timeoutMessage: "Loading model lab status timed out. Restart the backend server and refresh the page."
    });
    modelLabStatus = {
      providers: Array.isArray(payload?.providers) && payload.providers.length ? payload.providers : defaultModelLabProviders,
      defaultProvider: String(payload?.defaultProvider ?? "openai").trim() || "openai",
      defaultModel: String(payload?.defaultModel ?? "gpt-5.4-mini").trim() || "gpt-5.4-mini",
      reason: String(payload?.reason ?? "OpenAI model lab status loaded.").trim() || "OpenAI model lab status loaded.",
      requestTimeoutMs: Number(payload?.requestTimeoutMs ?? 20000),
      benchmarkTimeoutMs: Number(payload?.benchmarkTimeoutMs ?? payload?.requestTimeoutMs ?? 45000)
    };
  } catch (error) {
    modelLabStatus = {
      providers: defaultModelLabProviders,
      defaultProvider: "openai",
      defaultModel: "gpt-5.4-mini",
      reason: error instanceof Error ? error.message : "Unable to reach the OpenAI model lab.",
      requestTimeoutMs: 20000,
      benchmarkTimeoutMs: 45000
    };
  }

  renderModelLabReport();
  renderSpeedReport();
  renderBenchmarkVariantLab();
}

async function fetchJson(url, options = {}) {
  const {
    timeoutMs = null,
    timeoutMessage = "",
    ...fetchOptions
  } = options;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = Number(timeoutMs);
  let timeoutId = null;

  if (controller && Number.isFinite(timeout) && timeout > 0) {
    timeoutId = window.setTimeout(() => {
      controller.abort();
    }, timeout);
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller?.signal
    });
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
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(timeoutMessage || `Request timed out after ${Math.round(timeout)}ms.`);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function postJson(url, payload = {}, options = {}) {
  return fetchJson(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

function isNotFoundError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b404\b|not found|cannot post/i.test(message);
}

async function postBenchmarkCompare(payload = {}, options = {}) {
  try {
    return {
      route: "model-lab",
      payload: await postJson("/api/model-lab/compare", payload, options)
    };
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    return {
      route: "subjectspace-compare",
      payload: await postJson("/api/subjectspace/compare", payload, options)
    };
  }
}

async function resetWithExamples() {
  setButtonBusy(resetExamplesButton, true, "Resetting...");

  try {
    const payload = await postJson("/api/system/reset-examples", {});
    resetTransientState();
    await loadSubjects("");
    await loadBenchmarkReports();
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

function dbStateSummary() {
  const start = backendDbState.total ? backendDbState.offset + 1 : 0;
  const end = Math.min(backendDbState.offset + backendDbState.rows.length, backendDbState.total);
  return backendDbState.total
    ? `${backendDbState.label || backendDbState.table} - rows ${start}-${end} of ${backendDbState.total}`
    : `${backendDbState.label || backendDbState.table} - no rows returned`;
}

function renderBackendOverview() {
  if (!backendModeLabelEl && !backendDbTableListEl) {
    return;
  }

  const overview = backendOverview ?? {};
  const system = overview.system ?? {};
  const counts = overview.counts ?? {};
  const tables = Array.isArray(overview.tables) ? overview.tables : [];
  benchmarkReports = overview.modelLabReports ?? benchmarkReports;
  if ((!modelDebugEntries.length) && Array.isArray(benchmarkReports?.debugEntries)) {
    modelDebugEntries = benchmarkReports.debugEntries;
  }

  if (backendModeLabelEl) {
    backendModeLabelEl.textContent = system.openai?.enabled ? "Assist Enabled" : "Local-only mode";
  }
  if (backendModeDetailEl) {
    backendModeDetailEl.textContent = system.openai?.reason ?? "Backend status unavailable.";
  }
  if (backendSubjectCountEl) {
    backendSubjectCountEl.textContent = String(counts.subjectSpaceCount ?? 0);
  }
  if (backendConstructCountEl) {
    backendConstructCountEl.textContent = String(counts.subjectCount ?? 0);
  }
  if (backendSoundCountEl) {
    backendSoundCountEl.textContent = String(counts.soundCount ?? 0);
  }
  if (backendSubjectStrandCountEl) {
    backendSubjectStrandCountEl.textContent = String(counts.subjectStrandCount ?? 0);
  }
  if (backendLinkCountEl) {
    backendLinkCountEl.textContent = String(counts.constructLinkCount ?? 0);
  }
  if (backendDbPathEl) {
    const dbPath = overview.database?.path ?? "Database path unavailable";
    const dbSize = formatBytes(overview.database?.sizeBytes ?? 0);
    backendDbPathEl.textContent = `${dbPath}${dbSize !== "n/a" ? ` - ${dbSize}` : ""}`;
  }
  if (backendDbSizeEl) {
    const dbSize = formatBytes(overview.database?.sizeBytes ?? 0);
    backendDbSizeEl.textContent = dbSize === "n/a"
      ? "Database size unavailable"
      : `Database size: ${dbSize}`;
  }

  if (!backendDbTableListEl) {
    return;
  }

  if (!tables.length) {
    backendDbTableListEl.className = "db-table-list empty";
    backendDbTableListEl.innerHTML = "<p>No backend tables available.</p>";
    return;
  }

  backendDbTableListEl.className = "db-table-list";
  backendDbTableListEl.innerHTML = tables.map((table) => `
    <button
      type="button"
      class="db-table-button${backendDbState.table === table.name ? " is-active" : ""}"
      data-db-table="${escapeHtml(table.name)}"
    >
      <strong>${escapeHtml(table.label ?? table.name)}</strong>
      <span>${escapeHtml(String(table.rowCount ?? 0))} rows</span>
    </button>
  `).join("");
}

function renderDatasetHealth() {
  if (!datasetHealthPanelEl || !datasetHealthMetaEl) {
    return;
  }

  const health = datasetHealth ?? backendOverview?.datasetHealth ?? null;
  const releaseHealth = backendOverview?.releaseDatasetHealth ?? null;
  if (!health) {
    datasetHealthMetaEl.textContent = "Dataset health is unavailable right now.";
    datasetHealthPanelEl.className = "dataset-health-panel empty";
    datasetHealthPanelEl.innerHTML = "<p>Refresh the backend overview to inspect construct quality and release readiness.</p>";
    return;
  }

  const flagged = Array.isArray(health.flaggedConstructs) ? health.flaggedConstructs : [];
  const issueCounts = health.issueCounts ?? {};
  const statusLabel = health.status === "release-ready"
    ? "Release ready"
    : health.status === "review"
      ? "Needs review"
      : health.status === "repair"
        ? "Needs repair"
        : "Empty dataset";
  const releaseNotes = [];
  const activeSeedScore = Number(releaseHealth?.activeSeedFile?.releaseReadinessScore ?? NaN);
  const releaseSeedScore = Number(releaseHealth?.releaseSeedFile?.releaseReadinessScore ?? NaN);
  if (Number.isFinite(activeSeedScore)) {
    releaseNotes.push(`active seeds ${Math.round(activeSeedScore)}`);
  }
  if (Number.isFinite(releaseSeedScore)) {
    releaseNotes.push(`release pack ${Math.round(releaseSeedScore)}`);
  }

  datasetHealthMetaEl.textContent = `${statusLabel}. ${health.constructCount ?? 0} constructs audited${releaseNotes.length ? ` | ${releaseNotes.join(" | ")}` : ""}.`;
  datasetHealthPanelEl.className = "dataset-health-panel";
  datasetHealthPanelEl.innerHTML = `
    <div class="dataset-health-summary">
      <article class="dataset-health-score">
        <span class="detail-label">Readiness</span>
        <strong>${escapeHtml(String(Math.round(Number(health.releaseReadinessScore ?? 0))))}/100</strong>
        <small>Average relevance ${escapeHtml(String(Math.round(Number(health.averageRelevanceScore ?? 0))))}</small>
      </article>
      <div class="dataset-health-issues">
        <span class="chip subtle">Missing target ${escapeHtml(String(issueCounts.missingTarget ?? 0))}</span>
        <span class="chip subtle">Missing steps ${escapeHtml(String(issueCounts.missingSteps ?? 0))}</span>
        <span class="chip subtle">Broken links ${escapeHtml(String(issueCounts.orphanRelatedIds ?? 0))}</span>
        <span class="chip subtle">Thin constructs ${escapeHtml(String(issueCounts.thinConstructs ?? 0))}</span>
      </div>
    </div>
    ${flagged.length
      ? `
        <div class="dataset-health-list">
          ${flagged.slice(0, 5).map((item) => `
            <article class="dataset-health-item">
              <div class="dataset-health-copy">
                <strong>${escapeHtml(item.constructLabel ?? "Construct")}</strong>
                <span>${escapeHtml(item.target || item.objective || item.subjectLabel || "")}</span>
                <small>Relevance ${escapeHtml(String(Math.round(Number(item.relevance?.score ?? 0))))} | ${escapeHtml((item.relevance?.anchors ?? []).slice(0, 4).join(" , ") || "Needs richer anchors")}</small>
              </div>
              <div class="dataset-health-actions">
                <p>${escapeHtml((item.issues ?? []).slice(0, 2).join(" | "))}</p>
                <button type="button" class="secondary-button subtle-button" data-construct-action="edit" data-construct-id="${escapeHtml(item.id ?? "")}">Open construct</button>
              </div>
            </article>
          `).join("")}
        </div>
      `
      : "<p>No major construct issues were flagged in the active subject dataset.</p>"}
  `;
}

function renderBackendSchema() {
  if (!backendDbSchemaEl) {
    return;
  }

  const columns = Array.isArray(backendDbState.columns) ? backendDbState.columns : [];
  if (!columns.length) {
    backendDbSchemaEl.className = "db-schema empty";
    backendDbSchemaEl.innerHTML = "<p>Column details will appear here when a table is loaded.</p>";
    return;
  }

  backendDbSchemaEl.className = "db-schema";
  backendDbSchemaEl.innerHTML = columns.map((column) => `
    <article class="db-schema-item">
      <strong>${escapeHtml(column.name)}</strong>
      <span>${escapeHtml(column.type || "TEXT")}</span>
      <small>${escapeHtml(
        [
          column.primaryKey ? "primary key" : "",
          column.notNull ? "required" : "nullable",
          column.editable ? "editable" : "read-only"
        ].filter(Boolean).join(" - ")
      )}</small>
    </article>
  `).join("");
}

function renderBackendRows() {
  if (!backendDbRowsEl) {
    return;
  }

  const columns = Array.isArray(backendDbState.columns) ? backendDbState.columns : [];
  const rows = Array.isArray(backendDbState.rows) ? backendDbState.rows : [];

  if (backendDbMetaEl) {
    backendDbMetaEl.textContent = dbStateSummary();
  }
  if (backendDbPrevButton) {
    backendDbPrevButton.disabled = backendDbState.offset <= 0;
  }
  if (backendDbNextButton) {
    backendDbNextButton.disabled = backendDbState.offset + rows.length >= backendDbState.total;
  }

  if (!rows.length || !columns.length) {
    backendDbRowsEl.className = "db-rows empty";
    backendDbRowsEl.innerHTML = "<p>Select a table to inspect rows.</p>";
    return;
  }

  const visibleColumns = columns.slice(0, 6);
  backendDbRowsEl.className = "db-rows";
  backendDbRowsEl.innerHTML = `
    <table class="db-table">
      <thead>
        <tr>
          ${visibleColumns.map((column) => `<th>${escapeHtml(column.name)}</th>`).join("")}
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr class="db-row${backendDbState.selectedRowId === String(row[backendDbState.primaryKey] ?? "") ? " is-selected" : ""}" data-db-row-id="${escapeHtml(String(row[backendDbState.primaryKey] ?? ""))}">
            ${visibleColumns.map((column) => `<td>${escapeHtml(String(row[column.name] ?? "")).slice(0, 120)}</td>`).join("")}
            <td>${escapeHtml(row._editor?.editable === false ? "read-only" : "editable")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderBackendEditor() {
  if (!backendDbEditorFieldsEl || !backendDbEditorMetaEl || !backendDbEditorForm) {
    return;
  }

  const row = backendDbState.selectedRow;
  const columns = Array.isArray(backendDbState.columns) ? backendDbState.columns : [];
  const editableColumns = columns.filter((column) => backendDbState.editableColumns.includes(column.name) && column.name !== backendDbState.primaryKey);
  const rowEditable = row?._editor?.editable !== false;

  if (!row) {
    backendDbEditorForm.dataset.rowId = "";
    backendDbEditorMetaEl.textContent = "Select a row to edit it.";
    backendDbEditorFieldsEl.className = "db-editor-fields empty";
    backendDbEditorFieldsEl.innerHTML = "<p>Select a row from the table browser to edit Strandspace data.</p>";
    return;
  }

  backendDbEditorForm.dataset.rowId = String(row[backendDbState.primaryKey] ?? "");
  backendDbEditorMetaEl.textContent = rowEditable
    ? `Editing ${backendDbState.table}:${row[backendDbState.primaryKey]}`
    : (row._editor?.reason ?? "This row is read-only.");

  if (!rowEditable) {
    backendDbEditorFieldsEl.className = "db-editor-fields empty";
    backendDbEditorFieldsEl.innerHTML = `<p>${escapeHtml(row._editor?.reason ?? "This row is read-only.")}</p>`;
    return;
  }

  backendDbEditorFieldsEl.className = "db-editor-fields";
  backendDbEditorFieldsEl.innerHTML = editableColumns.map((column) => {
    const value = row[column.name] ?? "";
    const isShort = !column.name.endsWith("Json") && String(value).length < 120 && !String(column.type ?? "").toUpperCase().includes("TEXT");

    return `
      <label class="db-editor-field">
        <span>${escapeHtml(column.name)}</span>
        ${isShort
          ? `<input name="${escapeHtml(column.name)}" type="text" value="${escapeHtml(String(value))}" />`
          : `<textarea name="${escapeHtml(column.name)}" rows="${column.name.endsWith("Json") ? 7 : 4}">${escapeHtml(String(value))}</textarea>`}
      </label>
    `;
  }).join("");
}

function syncSelectedBackendRow() {
  const rows = Array.isArray(backendDbState.rows) ? backendDbState.rows : [];
  backendDbState.selectedRow = rows.find((row) => String(row[backendDbState.primaryKey] ?? "") === backendDbState.selectedRowId) ?? null;
}

function renderBackendDbWorkspace() {
  renderBackendOverview();
  renderDatasetHealth();
  renderBenchmarkReports();
  renderBackendSchema();
  renderBackendRows();
  renderBackendEditor();
}

async function loadBenchmarkReports() {
  if (!benchmarkHistoryMetaEl || !benchmarkHistoryReportEl) {
    return;
  }

  benchmarkHistoryMetaEl.textContent = "Loading stored benchmark reports from the backend...";
  try {
    const payload = await fetchJson("/api/model-lab/reports", {
      timeoutMs: MODEL_LAB_REPORTS_FETCH_TIMEOUT_MS,
      timeoutMessage: "Loading benchmark reports timed out. The compare may have finished, but the reports request did not return in time."
    });
    benchmarkReports = payload.reports ?? null;
    modelDebugEntries = Array.isArray(benchmarkReports?.debugEntries) ? benchmarkReports.debugEntries : modelDebugEntries;
    renderBenchmarkReports();
    renderModelDebugWindow();
  } catch (error) {
    if (isNotFoundError(error)) {
      benchmarkHistoryMetaEl.textContent = "Stored benchmark reports need the newer model-lab backend route.";
      benchmarkHistoryReportEl.className = "speed-report empty";
      benchmarkHistoryReportEl.innerHTML = "<p>This server can still run recall benchmarks, but it does not support stored benchmark reports yet.</p>";
      return;
    }

    benchmarkHistoryMetaEl.textContent = error instanceof Error ? error.message : "Unable to load stored benchmark reports.";
    benchmarkHistoryReportEl.className = "speed-report empty";
    benchmarkHistoryReportEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : "Unable to load stored benchmark reports.")}</p>`;
  }
}

async function loadBackendOverview() {
  if (!backendDbTableListEl) {
    return;
  }

  try {
    backendOverview = await fetchJson("/api/backend/overview");
    renderBackendOverview();
    renderDatasetHealth();

    const availableTables = Array.isArray(backendOverview.tables) ? backendOverview.tables : [];
    const preferredTable = availableTables.some((table) => table.name === backendDbState.table)
      ? backendDbState.table
      : (availableTables[0]?.name ?? "");

    if (preferredTable) {
      await loadBackendTable(preferredTable, {
        offset: 0,
        search: backendDbSearchInput?.value?.trim() ?? ""
      });
    }
  } catch (error) {
    if (backendDbSizeEl) {
      backendDbSizeEl.textContent = "Database size unavailable";
    }
    if (backendDbMetaEl) {
      backendDbMetaEl.textContent = error instanceof Error ? error.message : "Unable to load backend overview.";
    }
    if (backendDbTableListEl) {
      backendDbTableListEl.className = "db-table-list empty";
      backendDbTableListEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : "Unable to load backend overview.")}</p>`;
    }
  }
}

async function loadDatasetHealth(subjectId = currentSubjectId) {
  if (!datasetHealthPanelEl || !datasetHealthMetaEl) {
    return;
  }

  const url = new URL("/api/subjectspace/dataset/health", window.location.origin);
  if (subjectId) {
    url.searchParams.set("subjectId", subjectId);
  }

  datasetHealthMetaEl.textContent = "Auditing constructs, anchors, related links, and release readiness...";
  try {
    const payload = await fetchJson(url.toString());
    datasetHealth = payload.health ?? null;
    renderDatasetHealth();
  } catch (error) {
    datasetHealthMetaEl.textContent = error instanceof Error ? error.message : "Unable to audit the dataset.";
    datasetHealthPanelEl.className = "dataset-health-panel empty";
    datasetHealthPanelEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : "Unable to audit the dataset.")}</p>`;
  }
}

async function loadBackendTable(tableName = backendDbState.table, { offset = 0, search = "" } = {}) {
  if (!backendDbRowsEl) {
    return;
  }

  const url = new URL("/api/backend/db/table", window.location.origin);
  url.searchParams.set("table", tableName);
  url.searchParams.set("offset", String(Math.max(0, Number(offset) || 0)));
  url.searchParams.set("limit", String(backendDbState.limit));
  if (search) {
    url.searchParams.set("search", search);
  }

  const payload = await fetchJson(url.toString());
  backendDbState = {
    ...backendDbState,
    table: payload.table?.name ?? tableName,
    label: payload.table?.label ?? tableName,
    primaryKey: payload.table?.primaryKey ?? "id",
    editableColumns: Array.isArray(payload.table?.editableColumns) ? payload.table.editableColumns : [],
    columns: payload.columns ?? [],
    rows: payload.rows ?? [],
    offset: payload.pagination?.offset ?? 0,
    limit: payload.pagination?.limit ?? backendDbState.limit,
    total: payload.pagination?.total ?? 0,
    search: payload.search ?? search,
    selectedRowId: payload.rows?.some((row) => String(row[payload.table?.primaryKey ?? "id"] ?? "") === backendDbState.selectedRowId)
      ? backendDbState.selectedRowId
      : String(payload.rows?.[0]?.[payload.table?.primaryKey ?? "id"] ?? "")
  };
  syncSelectedBackendRow();
  renderBackendDbWorkspace();
}

async function handleDatasetClean() {
  if (!datasetCleanButton) {
    return;
  }

  const activeLabel = currentSubjectLabel();
  datasetHealthMetaEl.textContent = `Cleaning ${activeLabel} dataset with safe normalization and relation repair...`;
  setButtonBusy(datasetCleanButton, true, "Cleaning...");

  try {
    const payload = await postJson("/api/subjectspace/dataset/clean", {
      subjectId: currentSubjectId
    });
    datasetHealth = payload.health ?? null;
    datasetHealthMetaEl.textContent = `Cleaned ${payload.normalizedCount ?? 0} constructs and repaired ${payload.repairedRelatedCount ?? 0} broken related links in ${activeLabel}.`;
    renderDatasetHealth();
    await loadSubjects(currentSubjectId);
    await loadBackendOverview();
  } catch (error) {
    datasetHealthMetaEl.textContent = error instanceof Error ? error.message : "Unable to clean the active dataset.";
  } finally {
    setButtonBusy(datasetCleanButton, false);
  }
}

function resetTransientState({ clearAssist = true, clearComparison = true } = {}) {
  if (clearAssist) {
    latestAssist = null;
  }
  if (clearComparison) {
    latestComparison = null;
    latestModelLabRun = null;
    benchmarkState = {
      phase: "idle",
      message: ""
    };
    modelLabState = {
      phase: "idle",
      message: ""
    };
  }

  renderSpeedReport();
  renderModelLabReport();
}

function renderTrace(trace = null) {
  lastRenderedTrace = trace;
  if (!trace) {
    traceGridEl.className = "trace-grid empty";
    traceGridEl.innerHTML = "<p>The field will populate when Strandspace has something to stabilize.</p>";
    traceSummaryEl.textContent = "Trigger, anchor, composite, and memory layers are waiting for a prompt.";
    return;
  }

  const lanes = [
    { title: "Trigger strands", items: trace.triggerStrands ?? [] },
    { title: "Alias cues", items: trace.aliasStrands ?? [] },
    { title: "Phrase cues", items: trace.phraseStrands ?? [] },
    { title: "Activated strands", items: trace.activatedStrands ?? [] },
    { title: "Persistent strands", items: trace.persistentStrands ?? [] },
    { title: "Anchor strands", items: trace.anchorStrands ?? [] },
    { title: "Composite constructs", items: trace.compositeStrands ?? [] },
    { title: "Binder reinforcement", items: trace.binderStrands ?? [] },
    { title: "Linked constructs", items: trace.linkedStrands ?? [] },
    { title: "Exclusion cues", items: trace.exclusionStrands ?? [] },
    { title: "Stabilized memory", items: trace.stabilizedMemory ?? [] }
  ].filter((lane) => Array.isArray(lane.items));

  traceGridEl.className = "trace-grid";
  traceGridEl.innerHTML = lanes
    .map((lane, laneIndex) => `
      <section class="trace-lane">
        <header>
          <h3>${escapeHtml(lane.title)}</h3>
        </header>
        <div class="trace-chip-row">
          ${(() => {
            const laneKey = lane.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const paged = pageItems(lane.items, tracePagerState[laneKey]);
            tracePagerState[laneKey] = paged.page;
            return paged.items.length
              ? `${paged.items.map((item, itemIndex) => `
              <article class="trace-chip" style="--delay:${(laneIndex * 80) + (itemIndex * 55)}ms">
                <strong>${escapeHtml(item.name ?? item.kind ?? "strand")}</strong>
                <span>${escapeHtml(item.value ?? item.detail ?? item.role ?? (item.score !== undefined ? `score ${Number(item.score).toFixed(1)}` : "active"))}</span>
              </article>
            `).join("")}
              ${pagerControlsMarkup({
                target: `trace:${laneKey}`,
                page: paged.page,
                totalPages: paged.totalPages,
                compact: true
              })}`
              : "<p class=\"trace-empty\">No active strands in this lane yet.</p>";
          })()}
        </div>
      </section>
    `)
    .join("");

  traceSummaryEl.textContent = trace.expressionField ?? "The expression field is forming.";
  animateFresh(traceGridEl);
}

function renderHitChipRow(items = [], formatter) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => formatter(item))
    .filter(Boolean);

  if (!values.length) {
    return "";
  }

  return `<div class="assist-missing">${values.map((value) => `<span class="chip subtle">${escapeHtml(value)}</span>`).join("")}</div>`;
}

function renderSupportBreakdown(support = []) {
  const items = Array.isArray(support) ? support : [];
  if (!items.length) {
    return "";
  }

  return `
    <div class="why-support-list">
      ${items.slice(0, 4).map((entry) => `
        <article class="why-support-item">
          <strong>${escapeHtml(entry.label ?? "support")}</strong>
          <span>${escapeHtml(entry.summary ?? "")}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderWhyMatchedPanel(candidate = null, routing = {}, readiness = {}) {
  if (!candidate && !routing?.label && !readiness) {
    return "";
  }

  const score = Number(candidate?.score ?? readiness?.matchedScore ?? 0);
  const confidence = Number(routing?.confidence ?? readiness?.confidence ?? 0);
  const matchedTokens = Array.isArray(candidate?.matchedTokens) ? candidate.matchedTokens : [];
  const aliasHits = Array.isArray(candidate?.aliasHits) ? candidate.aliasHits : [];
  const phraseHits = Array.isArray(candidate?.phraseHits) ? candidate.phraseHits : [];
  const excludedHits = Array.isArray(candidate?.excludedHits) ? candidate.excludedHits : [];
  const binderHits = Array.isArray(candidate?.binderHits) ? candidate.binderHits : [];
  const linkHits = Array.isArray(candidate?.linkHits) ? candidate.linkHits : [];
  const support = Array.isArray(candidate?.support) ? candidate.support : [];
  const routeLabel = String(routing?.label ?? "").trim() || "Scoring only";

  if (!score && !matchedTokens.length && !aliasHits.length && !phraseHits.length && !excludedHits.length && !binderHits.length && !linkHits.length && !support.length) {
    return "";
  }

  return `
    <section class="why-card">
      <div class="assist-head">
        <div>
          <p class="assist-kicker">Why this matched</p>
          <h3>${escapeHtml(candidate?.constructLabel ?? candidate?.target ?? "Top candidate")}</h3>
        </div>
        <span class="assist-badge">${escapeHtml(routeLabel)}</span>
      </div>
      <div class="assist-stats">
        <span>Score ${escapeHtml(score.toFixed(1))}</span>
        <span>Confidence ${escapeHtml(formatPercent(confidence))}</span>
      </div>
      ${matchedTokens.length ? `
        <div class="why-block">
          <p class="answer-label">Matched tokens</p>
          ${renderHitChipRow(matchedTokens, (value) => value)}
        </div>
      ` : ""}
      ${aliasHits.length ? `
        <div class="why-block">
          <p class="answer-label">Alias hits</p>
          ${renderHitChipRow(aliasHits, (item) => `${item.source} -> ${item.term}`)}
        </div>
      ` : ""}
      ${phraseHits.length ? `
        <div class="why-block">
          <p class="answer-label">Phrase hits</p>
          ${renderHitChipRow(phraseHits, (item) => item.via === "alias" ? `${item.source} -> ${item.phrase}` : item.phrase)}
        </div>
      ` : ""}
      ${excludedHits.length ? `
        <div class="why-block">
          <p class="answer-label">Excluded cues</p>
          ${renderHitChipRow(excludedHits, (item) => `${item.cue} (-${Number(item.penalty ?? 0).toFixed(1)})`)}
        </div>
      ` : ""}
      ${binderHits.length ? `
        <div class="why-block">
          <p class="answer-label">Binder hits</p>
          ${renderHitChipRow(binderHits, (item) => `${item.left} + ${item.right} (${Number(item.weight ?? 0) > 0 ? "+" : ""}${Number(item.weight ?? 0).toFixed(1)})`)}
        </div>
      ` : ""}
      ${linkHits.length ? `
        <div class="why-block">
          <p class="answer-label">Linked constructs</p>
          ${renderHitChipRow(linkHits, (item) => `${item.constructLabel} (${Number(item.reinforcement ?? 0) > 0 ? "+" : ""}${Number(item.reinforcement ?? 0).toFixed(1)})`)}
        </div>
      ` : ""}
      ${renderSupportBreakdown(support)}
    </section>
  `;
}

function renderRoutingPanel(routing = {}, readiness = {}) {
  if (!routing || !routing.label) {
    return "";
  }

  const confidence = Number(routing.confidence ?? readiness.confidence ?? 0);
  const matchedRatio = Number(routing.matchedRatio ?? readiness.matchedRatio ?? 0);
  const margin = Number(routing.margin ?? readiness.margin ?? 0);
  const missingKeywords = Array.isArray(routing.missingKeywords) ? routing.missingKeywords : [];
  const exclusions = Array.isArray(routing.exclusions) ? routing.exclusions : [];
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
      ${exclusions.length
        ? `
          <div class="why-block">
            <p class="answer-label">Excluded cues</p>
            <div class="assist-missing">
              ${exclusions.map((token) => `<span class="chip subtle">${escapeHtml(token)}</span>`).join("")}
            </div>
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
  const hasBenchmarkPrompt = Boolean(normalizePrompt(benchmarkQuestion));
  const providerLabel = selectedProviderMeta()?.label ?? "OpenAI";
  if (speedCompareButton) {
    speedCompareButton.disabled = benchmarkState.phase === "loading" || !hasBenchmarkPrompt;
    speedCompareButton.textContent = benchmarkState.phase === "loading" ? "Running benchmark..." : "Compare local vs OpenAI";
  }

  if (!hasBenchmarkPrompt) {
    speedMetaEl.textContent = `Benchmark the last live recall prompt against the local field and ${providerLabel}.`;
    speedReportEl.className = "speed-report empty";
    speedReportEl.innerHTML = "<p>Enter a backend prompt or run recall first, then compare local Strandbase recall against the LLM assist round-trip.</p>";
    renderBenchmarkVariantLab();
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
    renderBenchmarkVariantLab();
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
    renderBenchmarkVariantLab();
    return;
  }

  if (!latestComparison) {
    speedMetaEl.textContent = assistStatus.enabled
      ? `Ready to benchmark the last prompt against ${selectedModelLabel()}.`
      : `Ready to benchmark local recall. ${assistStatus.reason}`;
    speedReportEl.className = "speed-report empty";
    speedReportEl.innerHTML = `
      <p>
        Current prompt: "${escapeHtml(previewQuestion(benchmarkQuestion))}"
      </p>
      <p>
        Use the benchmark button to time local Strandbase recall${assistStatus.enabled ? ` and the ${escapeHtml(selectedModelLabel())} round-trip.` : "."}
      </p>
    `;
    renderBenchmarkVariantLab();
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
        <p class="assist-kicker">${escapeHtml(llm.providerLabel ?? "OpenAI model")} path</p>
        <h3>${escapeHtml(llm.label ?? "Model round-trip")}</h3>
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
  renderBenchmarkVariantLab();
}

function renderBenchmarkVariantLab() {
  if (!benchmarkPreviewEl || !benchmarkVariantMetaEl) {
    return;
  }

  const variant = buildBenchmarkVariantPrompt();
  const hasBasePrompt = Boolean(variant.basePrompt);
  const hasVariantPrompt = Boolean(normalizePrompt(variant.question));

  if (benchmarkUseVariantButton) {
    benchmarkUseVariantButton.disabled = !hasVariantPrompt;
  }
  if (benchmarkRunVariantButton) {
    benchmarkRunVariantButton.disabled = !hasVariantPrompt || benchmarkState.phase === "loading";
    benchmarkRunVariantButton.textContent = benchmarkState.phase === "loading" ? "Benchmarking..." : "Compare variant vs OpenAI";
  }

  if (!hasBasePrompt) {
    benchmarkVariantMetaEl.textContent = "Run recall or a baseline comparison first, then generate variant prompts for testing.";
    benchmarkPreviewEl.className = "speed-report empty";
    benchmarkPreviewEl.innerHTML = "<p>Run recall or benchmark once so Strandspace has a prompt baseline to compress, expand, or repeat.</p>";
    return;
  }

  benchmarkVariantMetaEl.textContent = variant.changed
    ? `${variant.modeLabel} is ready from the current benchmark baseline.`
    : "The generated variant still matches the base prompt, so increase compression or add a repeat cue to push it harder.";
  benchmarkPreviewEl.className = "speed-report";
  benchmarkPreviewEl.innerHTML = `
    <div class="speed-prompt-grid">
      <article class="speed-prompt-card">
        <p class="assist-kicker">Base prompt</p>
        <strong class="speed-latency">${escapeHtml(formatTokenCount(Math.max(1, Math.round((variant.basePrompt.split(/\s+/).filter(Boolean).length || 1) * 1.35)), { approximate: true }))}</strong>
        <p>"${escapeHtml(previewQuestion(variant.basePrompt, 180))}"</p>
      </article>
      <article class="speed-prompt-card${variant.changed ? " optimized" : ""}">
        <p class="assist-kicker">Variant prompt</p>
        <strong class="speed-latency">${escapeHtml(formatTokenCount(variant.tokenEstimate, { approximate: true }))}</strong>
        <p>"${escapeHtml(previewQuestion(variant.question, 180))}"</p>
        <div class="speed-notes">
          <span>${escapeHtml(`${variant.wordCount} words`)}</span>
          <span>${escapeHtml(variant.modeLabel)}</span>
          ${variant.repeatValue ? `<span>${escapeHtml(`repeat ${variant.repeatCount}x: ${variant.repeatValue}`)}</span>` : ""}
        </div>
      </article>
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
    renderGraph(null);
    renderSpeedReport();
    renderModelLabReport();
    return;
  }

  const construct = payload.construct ?? null;
  const recall = payload.recall ?? {};
  const candidates = recall.candidates ?? [];
  const routing = recall.routing ?? {};
  const readiness = recall.readiness ?? {};
  const topCandidate = construct ?? recall.matched ?? candidates[0] ?? null;
  const libraryCount = Number(readiness.libraryCount ?? 0);

  if (!construct) {
    answerPanelEl.className = "answer-surface unresolved";
    answerPanelEl.innerHTML = `
      <p class="answer-kicker">Expression field unresolved</p>
      <h2>${libraryCount === 0 ? "No constructs stored yet" : "No stable construct yet"}</h2>
      <p>${escapeHtml(payload.answer ?? "Strandspace needs a learned construct before it can emit a trusted answer.")}</p>
      ${libraryCount === 0 ? `<p class="answer-label">Start by storing one concrete construct in this subject, then test recall again with the same prompt.</p>` : ""}
      ${renderRoutingPanel(routing, readiness)}
      ${renderWhyMatchedPanel(topCandidate, routing, readiness)}
      ${renderAssistResult()}
      ${candidates.length
        ? `
          <div class="candidate-stack">
            ${candidates.map((candidate) => `
              <article class="candidate-item">
                <strong>${escapeHtml(candidate.constructLabel ?? "Possible construct")}</strong>
                <span>${escapeHtml(candidate.objective ?? candidate.target ?? "Partial overlap only")}</span>
                <p class="meta">Score ${escapeHtml(Number(candidate.score ?? 0).toFixed(1))} | Match ${escapeHtml(formatPercent(candidate.matchedRatio ?? 0))}</p>
              </article>
            `).join("")}
          </div>
        `
        : ""}
    `;
    renderTrace(recall.trace ?? null);
    renderGraph(topCandidate);
    animateFresh(answerPanelEl);
    renderSpeedReport();
    renderModelLabReport();
    return;
  }

  const context = contextEntries(construct.context);
  const steps = Array.isArray(construct.steps) ? construct.steps : [];
  const tags = Array.isArray(construct.tags) ? construct.tags : [];
  const sources = Array.isArray(construct.sources) ? construct.sources : [];
  const checkedReferences = Array.isArray(payload.checkedReferences) ? payload.checkedReferences : [];
  const buildChecks = Array.isArray(payload.buildChecks) ? payload.buildChecks : [];
  const relevance = construct.relevance ?? null;
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
    ${renderWhyMatchedPanel(topCandidate, routing, readiness)}
    ${renderAssistResult()}
    ${relevance && Array.isArray(relevance.anchors) && relevance.anchors.length
      ? `
        <div class="answer-relevance">
          <p class="answer-label">Relevance anchors</p>
          <div class="chip-row">
            ${(relevance.anchors ?? []).slice(0, 6).map((anchor) => `<span class="chip subtle">${escapeHtml(anchor)}</span>`).join("")}
          </div>
        </div>
      `
      : ""}
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
  renderGraph(construct);
  animateFresh(answerPanelEl);
  renderSpeedReport();
  renderModelLabReport();
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

  const paged = pageItems(library, pagerState.examplePrompts);
  pagerState.examplePrompts = paged.page;

  exampleRowEl.innerHTML = `
    <div class="example-pill-grid">
      ${paged.items
        .map((construct) => `
          <button type="button" class="example-pill" data-example-id="${escapeHtml(construct.id)}">
            ${escapeHtml(construct.constructLabel)}
          </button>
        `)
        .join("")}
    </div>
    ${pagerControlsMarkup({
      target: "examplePrompts",
      page: paged.page,
      totalPages: paged.totalPages
    })}
  `;
}

function resetPagedViews() {
  pagerState = {
    suggestedPrompts: 0,
    examplePrompts: 0
  };
  tracePagerState = {};
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
        <small>${escapeHtml((construct.relevance?.anchors ?? []).slice(0, 3).join(" , ") || "Needs richer anchors for stronger recall")}</small>
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
  resetPagedViews();
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
  await loadDatasetHealth(currentSubjectId);
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
    if (payload.recall?.ready) {
      syncEditorToRecalledConstruct(payload);
    }
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

async function handleSubjectIdeasSubmit(event) {
  event.preventDefault();

  const description = subjectIdeasInput?.value.trim() ?? "";
  const subjectLabel = subjectIdeasLabelInput?.value.trim() || currentSubjectLabel();

  if (!description) {
    if (subjectIdeasMetaEl) {
      subjectIdeasMetaEl.textContent = "Describe the subject first so AI has something to map.";
    }
    return;
  }

  if (subjectIdeasMetaEl) {
    subjectIdeasMetaEl.textContent = "Generating suggested constructs for this subject...";
  }
  setButtonBusy(subjectIdeasSubmitButton, true, "Suggesting...");

  try {
    const payload = await postJson("/api/subjectspace/subject-ideas", {
      subjectLabel,
      description
    });

    latestSubjectIdeas = payload.suggestions ?? null;
    renderSubjectIdeas();
    if (subjectIdeasMetaEl) {
      subjectIdeasMetaEl.textContent = `AI suggested ${latestSubjectIdeas?.suggestedConstructs?.length ?? 0} starter constructs for ${latestSubjectIdeas?.subjectLabel ?? subjectLabel}.`;
    }
    if (subjectIdeasLabelInput && latestSubjectIdeas?.subjectLabel) {
      subjectIdeasLabelInput.value = latestSubjectIdeas.subjectLabel;
    }
  } catch (error) {
    latestSubjectIdeas = null;
    renderSubjectIdeas();
    if (subjectIdeasMetaEl) {
      subjectIdeasMetaEl.textContent = error instanceof Error ? error.message : "Unable to generate subject suggestions.";
    }
  } finally {
    setButtonBusy(subjectIdeasSubmitButton, false);
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

function syncModelLabPromptWithRecall() {
  if (!modelLabPromptEl) {
    return;
  }

  const prompt = activeBenchmarkQuestion();
  if (prompt) {
    modelLabPromptEl.value = prompt;
  }
  renderModelLabReport();
}

async function runModelLabDraft() {
  const prompt = activeModelLabPrompt();
  const provider = selectedModelProvider();
  const providerMeta = selectedProviderMeta();
  if (!normalizePrompt(prompt)) {
    recallMetaEl.textContent = "Type a prompt or run recall before sending it to the selected OpenAI model.";
    renderModelLabReport();
    return;
  }

  if (modelLabPromptEl && !modelLabPromptEl.value.trim()) {
    modelLabPromptEl.value = prompt;
  }

  modelLabState = {
    phase: "loading",
    message: `Running ${providerMeta?.label ?? "the selected OpenAI model"} with the current backend prompt...`
  };
  renderModelLabReport();

  try {
    latestModelLabRun = {
      mode: "generate",
      payload: await postJson("/api/model-lab/generate", {
        provider,
        prompt,
        subjectId: currentSubjectId,
        model: modelLabModelEl?.value ?? "",
        groundWithLocalRecall: activeModelGrounding()
      }, {
        timeoutMs: modelLabRequestTimeoutMs("request"),
        timeoutMessage: modelLabTimeoutMessage("request")
      })
    };
    appendModelDebugEntry(latestModelLabRun.payload?.debug ?? null);
    if (latestModelLabRun.payload?.suggestedConstruct) {
      const draft = latestModelLabRun.payload.suggestedConstruct;
      applyConstructDraftToLearnForm(draft);
      setEditorState("draft", draft);
      renderAnswer(draftPayload(draft, {
        source: provider,
        input: prompt,
        mergeMode: "draft",
        buildChecks: [`${providerMeta?.label ?? "OpenAI model"} generated this draft in the backend model lab.`]
      }));
    }
    modelLabState = {
      phase: "done",
      message: `${providerMeta?.label ?? "OpenAI model"} draft complete.`
    };
    recallMetaEl.textContent = `${providerMeta?.label ?? "OpenAI model"} draft complete.`;
  } catch (error) {
    latestModelLabRun = null;
    modelLabState = {
      phase: "error",
      message: error instanceof Error ? error.message : "Unable to run the selected OpenAI model draft."
    };
    recallMetaEl.textContent = `${providerMeta?.label ?? "OpenAI model"} draft failed.`;
  }

  renderModelLabReport();
}

async function runModelLabCompare() {
  const question = activeModelLabPrompt();
  const provider = selectedModelProvider();
  const providerMeta = selectedProviderMeta();
  if (!normalizePrompt(question)) {
    recallMetaEl.textContent = "Type a prompt or run recall before comparing with the selected OpenAI model.";
    renderModelLabReport();
    return;
  }

  if (modelLabPromptEl && !modelLabPromptEl.value.trim()) {
    modelLabPromptEl.value = question;
  }

  modelLabState = {
    phase: "loading",
    message: `Comparing local Strandbase recall against ${providerMeta?.label ?? "the selected OpenAI model"}...`
  };
  renderModelLabReport();

  try {
    const compareRun = await postBenchmarkCompare({
      provider,
      question,
      subjectId: currentSubjectId,
      model: modelLabModelEl?.value ?? "",
      groundWithLocalRecall: activeModelGrounding(),
      testLabel: "Manual model lab compare"
    }, {
      timeoutMs: modelLabRequestTimeoutMs("benchmark"),
      timeoutMessage: modelLabTimeoutMessage("benchmark")
    });
    latestModelLabRun = {
      mode: "compare",
      route: compareRun.route,
      payload: compareRun.payload
    };
    appendModelDebugEntry(latestModelLabRun.payload?.debug ?? null);
    if (compareRun.route === "model-lab") {
      await loadBenchmarkReports();
    }
    modelLabState = {
      phase: "done",
      message: latestModelLabRun.payload?.comparison?.summary
        ?? (compareRun.route === "subjectspace-compare" ? "Legacy benchmark compare complete." : "Model comparison complete.")
    };
    recallMetaEl.textContent = latestModelLabRun.payload?.comparison?.summary ?? "Model comparison complete.";
  } catch (error) {
    latestModelLabRun = null;
    modelLabState = {
      phase: "error",
      message: error instanceof Error ? error.message : "Unable to compare with the selected OpenAI model."
    };
    recallMetaEl.textContent = `${providerMeta?.label ?? "OpenAI model"} comparison failed.`;
  }

  renderModelLabReport();
}

async function runSpeedCompare() {
  const question = activeBenchmarkQuestion();
  const provider = selectedModelProvider();
  const providerMeta = selectedProviderMeta();

  if (!normalizePrompt(question)) {
    recallMetaEl.textContent = "Type a prompt or run recall before benchmarking.";
    renderSpeedReport();
    return;
  }

  lastQuestion = question;
  benchmarkState = {
    phase: "loading",
    message: `Timing Strandbase recall against ${providerMeta?.label ?? "the selected OpenAI model"}...`
  };
  setButtonBusy(speedCompareButton, true, "Benchmarking...");
  renderSpeedReport();

  try {
    const compareRun = await postBenchmarkCompare({
      provider,
      subjectId: currentSubjectId,
      question,
      model: modelLabModelEl?.value ?? "",
      groundWithLocalRecall: activeModelGrounding(),
      testLabel: "Manual benchmark"
    }, {
      timeoutMs: modelLabRequestTimeoutMs("benchmark"),
      timeoutMessage: modelLabTimeoutMessage("benchmark")
    });
    latestComparison = compareRun.payload;
    appendModelDebugEntry(latestComparison.debug ?? null);
    if (compareRun.route === "model-lab") {
      await loadBenchmarkReports();
    }

    benchmarkState = {
      phase: "done",
      message: latestComparison.comparison?.summary
        ?? (compareRun.route === "subjectspace-compare" ? "Legacy benchmark compare complete." : "Benchmark complete.")
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

function loadVariantIntoPrompts() {
  const variant = buildBenchmarkVariantPrompt();
  if (!variant.question) {
    recallMetaEl.textContent = "Run recall first so Strandspace has a prompt to vary.";
    renderBenchmarkVariantLab();
    return;
  }

  if (recallQuestionInput) {
    recallQuestionInput.value = variant.question;
  }
  if (modelLabPromptEl) {
    modelLabPromptEl.value = variant.question;
  }
  lastQuestion = variant.question;
  recallMetaEl.textContent = `${variant.modeLabel} loaded into recall and model prompts for the next test pass.`;
  renderSpeedReport();
  renderModelLabReport();
}

async function runVariantSpeedCompare() {
  const variant = buildBenchmarkVariantPrompt();
  const provider = selectedModelProvider();
  const providerMeta = selectedProviderMeta();
  if (!normalizePrompt(variant.question)) {
    recallMetaEl.textContent = "Run recall first so Strandspace has a prompt to vary.";
    renderBenchmarkVariantLab();
    return;
  }

  lastQuestion = variant.question;
  benchmarkState = {
    phase: "loading",
    message: `Benchmarking the ${variant.modeLabel.toLowerCase()} variant against ${providerMeta?.label ?? "the selected OpenAI model"}...`
  };
  setButtonBusy(benchmarkRunVariantButton, true, "Benchmarking...");
  renderSpeedReport();

  try {
    const compareRun = await postBenchmarkCompare({
      provider,
      subjectId: currentSubjectId,
      question: variant.question,
      model: modelLabModelEl?.value ?? "",
      groundWithLocalRecall: activeModelGrounding(),
      testLabel: `${variant.modeLabel} benchmark`
    }, {
      timeoutMs: modelLabRequestTimeoutMs("benchmark"),
      timeoutMessage: modelLabTimeoutMessage("benchmark")
    });
    latestComparison = compareRun.payload;
    appendModelDebugEntry(latestComparison.debug ?? null);
    if (compareRun.route === "model-lab") {
      await loadBenchmarkReports();
    }
    benchmarkState = {
      phase: "done",
      message: latestComparison.comparison?.summary
        ?? (compareRun.route === "subjectspace-compare" ? "Legacy variant benchmark complete." : "Variant benchmark complete.")
    };
    recallMetaEl.textContent = `${variant.modeLabel} benchmark complete.`;
  } catch (error) {
    latestComparison = null;
    benchmarkState = {
      phase: "error",
      message: error instanceof Error ? error.message : "Unable to benchmark the variant prompt."
    };
    recallMetaEl.textContent = "Variant benchmark failed.";
  }

  setButtonBusy(benchmarkRunVariantButton, false);
  renderSpeedReport();
}

subjectSelect?.addEventListener("change", async () => {
  currentSubjectId = subjectSelect.value;
  storeSubjectId(currentSubjectId);
  resetTransientState();
  renderSubjectPicker();
  await loadLibrary();
  await loadDatasetHealth(currentSubjectId);
});

recallForm?.addEventListener("submit", handleRecallSubmit);
builderForm?.addEventListener("submit", handleBuilderSubmit);
subjectIdeasForm?.addEventListener("submit", handleSubjectIdeasSubmit);
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
  loadConstructIntoEditor(construct, {
    mode: "saved",
    focus: false
  });
  recallQuestionInput.value = buildRecallSearchQuery(construct);
  recallMetaEl.textContent = "Construct title loaded as the search. Run recall to verify the local match.";
  recallQuestionInput.focus();
  renderAnswer(previewPayload(construct));
});

exampleRowEl?.addEventListener("click", (event) => {
  const pagerButton = event.target instanceof Element ? event.target.closest("[data-page-target]") : null;
  if (pagerButton) {
    const target = pagerButton.getAttribute("data-page-target") ?? "";
    const action = pagerButton.getAttribute("data-page-action") ?? "";
    if (target === "examplePrompts") {
      pagerState.examplePrompts = Math.max(0, pagerState.examplePrompts + (action === "next" ? 1 : -1));
      renderExamples();
    }
    return;
  }

  const button = event.target instanceof Element ? event.target.closest("[data-example-id]") : null;
  if (!button) {
    return;
  }

  const construct = library.find((item) => item.id === button.getAttribute("data-example-id"));
  if (!construct) {
    return;
  }

  resetTransientState();
  loadConstructIntoEditor(construct, {
    mode: "saved",
    focus: false
  });
  recallQuestionInput.value = buildRecallSearchQuery(construct);
  recallMetaEl.textContent = "Construct title loaded as the search. Run recall to verify the local match.";
  recallQuestionInput.focus();
  renderAnswer(previewPayload(construct));
});

suggestedRowEl?.addEventListener("click", (event) => {
  const pagerButton = event.target instanceof Element ? event.target.closest("[data-page-target]") : null;
  if (pagerButton) {
    const target = pagerButton.getAttribute("data-page-target") ?? "";
    const action = pagerButton.getAttribute("data-page-action") ?? "";
    if (target === "suggestedPrompts") {
      pagerState.suggestedPrompts = Math.max(0, pagerState.suggestedPrompts + (action === "next" ? 1 : -1));
      renderSuggestedPrompts();
    }
    return;
  }

  const button = event.target instanceof Element ? event.target.closest("[data-suggested-prompt]") : null;
  if (!button) {
    return;
  }

  recallQuestionInput.value = button.getAttribute("data-suggested-prompt") ?? "";
  const constructId = button.getAttribute("data-suggested-construct-id") ?? "";
  const construct = library.find((item) => item.id === constructId);
  if (construct) {
    loadConstructIntoEditor(construct, {
      mode: "saved",
      focus: false
    });
    renderAnswer(previewPayload(construct));
  }
  recallMetaEl.textContent = "Suggested search loaded. Run recall to match it locally.";
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
      recallQuestionInput.value = buildRecallSearchQuery(previewConstruct);
      recallMetaEl.textContent = "Construct title loaded as the search. Run recall to verify the local match.";
      renderAnswer(previewPayload(previewConstruct));
    }
  }
});

datasetHealthPanelEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-construct-action]") : null;
  if (!button) {
    return;
  }

  const constructId = button.getAttribute("data-construct-id");
  const construct = library.find((item) => item.id === constructId);
  if (!construct) {
    return;
  }

  loadConstructIntoEditor(construct, {
    mode: "saved",
    focus: true
  });
  recallQuestionInput.value = buildRecallSearchQuery(construct);
  recallMetaEl.textContent = "Construct title loaded as the search. Run recall to verify the local match.";
  renderAnswer(previewPayload(construct));
});

subjectIdeasResultsEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-subject-idea-index]") : null;
  if (!button || !latestSubjectIdeas) {
    return;
  }

  const index = Number(button.getAttribute("data-subject-idea-index"));
  const suggestion = latestSubjectIdeas.suggestedConstructs?.[index];
  if (!suggestion) {
    return;
  }

  const draft = suggestionToDraftConstruct(suggestion, latestSubjectIdeas.subjectLabel);
  applyConstructDraftToLearnForm(draft);
  setEditorState("draft", draft);
  learnMetaEl.textContent = `Loaded "${draft.constructLabel}" into the builder for review.`;
  builderMetaEl.textContent = "AI subject suggestion loaded into the builder. Review it, refine it, then save it when it looks right.";
  if (subjectIdeasMetaEl) {
    subjectIdeasMetaEl.textContent = `Loaded "${draft.constructLabel}" into the builder.`;
  }
  renderAnswer(draftPayload(draft, {
    source: "openai",
    input: subjectIdeasInput?.value.trim() ?? "",
    mergeMode: "draft",
    buildChecks: [`AI subject mapper suggested this construct for ${latestSubjectIdeas.subjectLabel}.`]
  }));
  learnConstructInput.focus();
});

traceGridEl?.addEventListener("click", (event) => {
  const pagerButton = event.target instanceof Element ? event.target.closest("[data-page-target]") : null;
  if (!pagerButton) {
    return;
  }

  const target = pagerButton.getAttribute("data-page-target") ?? "";
  const action = pagerButton.getAttribute("data-page-action") ?? "";
  if (!target.startsWith("trace:")) {
    return;
  }

  const laneKey = target.replace(/^trace:/, "");
  tracePagerState[laneKey] = Math.max(0, Number(tracePagerState[laneKey] ?? 0) + (action === "next" ? 1 : -1));
  renderTrace(lastRenderedTrace);
});

backendDbTableListEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-db-table]") : null;
  if (!button) {
    return;
  }

  backendDbState.selectedRowId = "";
  void loadBackendTable(button.getAttribute("data-db-table") ?? "subject_constructs", {
    offset: 0,
    search: backendDbSearchInput?.value?.trim() ?? ""
  });
});

backendDbRowsEl?.addEventListener("click", (event) => {
  const row = event.target instanceof Element ? event.target.closest("[data-db-row-id]") : null;
  if (!row) {
    return;
  }

  backendDbState.selectedRowId = row.getAttribute("data-db-row-id") ?? "";
  syncSelectedBackendRow();
  renderBackendDbWorkspace();
});

backendDbRefreshButton?.addEventListener("click", () => {
  void loadBackendOverview();
});

datasetHealthRefreshButton?.addEventListener("click", () => {
  void loadDatasetHealth(currentSubjectId);
});

datasetCleanButton?.addEventListener("click", () => {
  void handleDatasetClean();
});

backendDbSearchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  void loadBackendTable(backendDbState.table, {
    offset: 0,
    search: backendDbSearchInput.value.trim()
  });
});

backendDbPrevButton?.addEventListener("click", () => {
  void loadBackendTable(backendDbState.table, {
    offset: Math.max(0, backendDbState.offset - backendDbState.limit),
    search: backendDbSearchInput?.value?.trim() ?? backendDbState.search
  });
});

backendDbNextButton?.addEventListener("click", () => {
  void loadBackendTable(backendDbState.table, {
    offset: backendDbState.offset + backendDbState.limit,
    search: backendDbSearchInput?.value?.trim() ?? backendDbState.search
  });
});

backendDbEditorForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rowId = String(backendDbEditorForm.dataset.rowId ?? "").trim();
  if (!rowId || !backendDbState.selectedRow) {
    if (backendDbEditorMetaEl) {
      backendDbEditorMetaEl.textContent = "Select a row to edit it.";
    }
    return;
  }

  if (backendDbState.selectedRow._editor?.editable === false) {
    if (backendDbEditorMetaEl) {
      backendDbEditorMetaEl.textContent = backendDbState.selectedRow._editor.reason ?? "This row is read-only.";
    }
    return;
  }

  const formData = new FormData(backendDbEditorForm);
  const changes = {};
  for (const columnName of backendDbState.editableColumns) {
    if (columnName === backendDbState.primaryKey || !formData.has(columnName)) {
      continue;
    }

    changes[columnName] = formData.get(columnName);
  }

  const submitButton = backendDbEditorForm.querySelector("button[type=\"submit\"]");
  setButtonBusy(submitButton, true, "Saving...");
  if (backendDbEditorMetaEl) {
    backendDbEditorMetaEl.textContent = `Saving ${backendDbState.table}:${rowId}...`;
  }

  try {
    const payload = await postJson("/api/backend/db/row", {
      table: backendDbState.table,
      id: rowId,
      changes
    });

    backendDbState.selectedRowId = String(payload.row?.[backendDbState.primaryKey] ?? rowId);
    await Promise.all([
      loadBackendTable(backendDbState.table, {
        offset: backendDbState.offset,
        search: backendDbSearchInput?.value?.trim() ?? backendDbState.search
      }),
      loadSubjects(currentSubjectId)
    ]);
    if (backendDbEditorMetaEl) {
      backendDbEditorMetaEl.textContent = `Saved ${backendDbState.table}:${backendDbState.selectedRowId}.`;
    }
  } catch (error) {
    if (backendDbEditorMetaEl) {
      backendDbEditorMetaEl.textContent = error instanceof Error ? error.message : "Unable to save row changes.";
    }
  } finally {
    setButtonBusy(submitButton, false);
  }
});

speedCompareButton?.addEventListener("click", () => {
  void runSpeedCompare();
});

benchmarkUseVariantButton?.addEventListener("click", () => {
  loadVariantIntoPrompts();
});

benchmarkRunVariantButton?.addEventListener("click", () => {
  void runVariantSpeedCompare();
});

modelLabUseLastButton?.addEventListener("click", () => {
  syncModelLabPromptWithRecall();
});

modelLabGenerateButton?.addEventListener("click", () => {
  void runModelLabDraft();
});

modelLabCompareButton?.addEventListener("click", () => {
  void runModelLabCompare();
});

modelLabModelEl?.addEventListener("change", () => {
  renderModelLabReport();
  renderSpeedReport();
  renderBenchmarkVariantLab();
});

llmProviderEl?.addEventListener("change", () => {
  syncModelLabModelOptions();
  renderModelLabReport();
  renderSpeedReport();
  renderBenchmarkVariantLab();
});

modelLabPromptEl?.addEventListener("input", () => {
  renderModelLabReport();
});

recallQuestionInput?.addEventListener("input", () => {
  renderBenchmarkVariantLab();
  renderModelLabReport();
});

benchmarkVariantModeEl?.addEventListener("change", renderBenchmarkVariantLab);
benchmarkWordBudgetEl?.addEventListener("input", renderBenchmarkVariantLab);
benchmarkRepeatValueEl?.addEventListener("input", renderBenchmarkVariantLab);
benchmarkRepeatCountEl?.addEventListener("input", renderBenchmarkVariantLab);

resetExamplesButton?.addEventListener("click", () => {
  void resetWithExamples();
});

benchmarkHistoryRefreshButton?.addEventListener("click", () => {
  void loadBenchmarkReports();
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const benchmarkButton = target.closest("[data-benchmark-question]");
  if (benchmarkButton) {
    const prompt = String(benchmarkButton.getAttribute("data-benchmark-question") ?? "").trim();
    if (prompt) {
      if (recallQuestionInput) {
        recallQuestionInput.value = prompt;
      }
      if (modelLabPromptEl) {
        modelLabPromptEl.value = prompt;
      }
      lastQuestion = prompt;
      recallMetaEl.textContent = "Saved benchmark prompt loaded back into recall and model lab.";
      renderSpeedReport();
      renderBenchmarkVariantLab();
      renderModelLabReport();
    }
    return;
  }

  const shortcutButton = target.closest("[data-db-shortcut]");
  if (!shortcutButton) {
    return;
  }

  const tableName = shortcutButton.getAttribute("data-db-shortcut") ?? "";
  if (!tableName) {
    return;
  }

  backendDbState.selectedRowId = "";
  void loadBackendTable(tableName, {
    offset: 0,
    search: backendDbSearchInput?.value?.trim() ?? ""
  });
  window.location.hash = "#db-workspace";
});

themeToggleButton?.addEventListener("click", toggleTheme);

applyTheme(readStoredTheme() || "light");
syncEditorUi();
renderBuilderChecks();
renderSuggestedPrompts();
renderSubjectIdeas();
renderBenchmarkReports();
renderModelDebugWindow();

Promise.all([loadAssistStatus(), loadSubjects(), loadBackendOverview()])
  .then(async () => {
    await loadPendingDraftIfPresent();
    await loadBenchmarkReports();
  })
  .catch((error) => {
    subjectMetaEl.textContent = error instanceof Error ? error.message : "Unable to load the Strandspace backend.";
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
void loadModelLabStatus();
