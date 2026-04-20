import {
  applyAttributesRowsToDraft,
  applyDiagnosticToDraft,
  applyLookupTextToDraft,
  applySkipToStep,
  applySpecificationToDraft,
  createDefaultState,
  createEmptyDraft,
  currentStep,
  hydrateState,
  isDraftSaved,
  loadState,
  saveState,
  snapshotDraft,
  stepSequence,
  titleSuggestion,
  updateRecentDrafts
} from "./state.js";
import {
  answerTopicspace,
  getSystemHealth,
  getTopicConstruct,
  learnSubjectConstruct,
  learnTopicConstruct,
  listSubjects,
  listTopicConstructs,
  recallTopicspace
} from "./api.js";
import { buildStepSequence, CONSTRUCT_TYPES } from "./schema.js";
import { parseCommaList, parseEntityList, parseLineList, safeJsonParse } from "./utils.js";
import {
  bottomBarMarkup,
  leftSidebarMarkup,
  renderDraftBadges,
  renderDraftSummary,
  renderEditorMarkup,
  renderHeaderBadges,
  renderMatchPanel,
  renderPrompt,
  renderRecentDrafts,
  renderReconPreview,
  renderSavedConstructList,
  renderStepIndicator,
  renderTitleSuggestion,
  rightSidebarMarkup,
  workspaceShellMarkup
} from "./components.js";

const state = hydrateState(loadState(), createDefaultState());

const els = {
  left: document.getElementById("ss-sidebar-left"),
  right: document.getElementById("ss-sidebar-right"),
  workspace: document.getElementById("ss-workspace"),
  bottom: document.getElementById("ss-bottom-bar"),
  currentTopic: document.getElementById("ss-current-topic"),
  statusBadge: document.getElementById("ss-status-badge"),
  modeBadge: document.getElementById("ss-mode-badge"),
  themeToggle: document.getElementById("ss-theme-toggle")
};

const scheduleRecall = createDebounced(async () => {
  const question = buildRecallQuestion();
  if (!question) {
    state.ui.lastRecall = null;
    renderMatchAndStatus();
    return;
  }
  try {
    const topic = String(state.draft.topic ?? "").trim();
    const recall = await recallTopicspace({ question, topic });
    state.ui.lastRecall = recall;
    renderMatchAndStatus();
  } catch (error) {
    state.ui.lastRecall = { question, ready: false, matched: null, candidates: [] };
    renderMatchAndStatus(String(error?.message ?? "Unable to recall"));
  }
}, 260);

const scheduleRecon = createDebounced(async () => {
  const q = String(state.ui.queryText ?? "").trim();
  if (!q) {
    state.ui.lastAnswer = null;
    renderReconPreviewPanel();
    return;
  }
  try {
    state.ui.lastAnswer = await answerTopicspace({ question: q, topic: String(state.draft.topic ?? "").trim() });
  } catch (error) {
    state.ui.lastAnswer = {
      source: "unresolved",
      answer: String(error?.message ?? "Unable to reconstruct"),
      needsAssist: true,
      confidence: 0
    };
  }
  renderReconPreviewPanel();
}, 320);

boot();

async function boot() {
  setTheme(state.theme);
  renderStaticShell();
  bindEvents();
  renderAll();

  try {
    const health = await getSystemHealth();
    state.status.openai = health?.openai ?? null;
    state.status.database = health?.database ?? null;
    state.status.remoteAllowed = health?.remoteAllowed ?? null;
    renderStatusBadges();
  } catch (error) {
    if (els.statusBadge) els.statusBadge.textContent = String(error?.message ?? "Status unavailable");
  }

  try {
    const subjectsPayload = await listSubjects();
    state.subjects = Array.isArray(subjectsPayload?.subjects) ? subjectsPayload.subjects : [];
  } catch {
    state.subjects = [];
  }

  await refreshTopicConstructs();
  renderAll();
}

function renderStaticShell() {
  if (els.left) els.left.innerHTML = leftSidebarMarkup(state);
  if (els.right) els.right.innerHTML = rightSidebarMarkup();
  if (els.workspace) els.workspace.innerHTML = workspaceShellMarkup();
  if (els.bottom) els.bottom.innerHTML = bottomBarMarkup();
}

function renderAll() {
  renderHeader();
  renderEditor();
  renderDraftPanel();
  renderLists();
  renderMatchAndStatus();
  renderReconPreviewPanel();
  renderBottomDisabledStates();
  persist();
}

function persist() {
  saveState(state);
}

function renderHeader() {
  const topic = String(state.draft.topic ?? "").trim();
  if (els.currentTopic) els.currentTopic.textContent = topic || "What is the topic?";
  if (els.modeBadge) els.modeBadge.textContent = isDraftSaved(state) ? "Saved" : "Draft";
}

function renderStatusBadges() {
  if (!els.statusBadge) return;
  const enabled = Boolean(state.status?.openai?.enabled);
  els.statusBadge.textContent = enabled ? "Assist ready" : "Local-first";
}

function renderEditor() {
  const stepEl = document.getElementById("ss-step-indicator");
  if (stepEl) stepEl.textContent = renderStepIndicator(state);

  const prompt = renderPrompt(state);
  const promptEl = document.getElementById("ss-intake-prompt");
  if (promptEl) promptEl.textContent = prompt.prompt;
  const hintEl = document.getElementById("ss-intake-hint");
  if (hintEl) hintEl.textContent = prompt.hint || "";

  const statusEl = document.getElementById("ss-intake-status");
  if (statusEl) statusEl.innerHTML = renderHeaderBadges(state);

  const editorEl = document.getElementById("ss-editor");
  if (editorEl) editorEl.innerHTML = renderEditorMarkup(state);

  const titleSuggestEl = document.getElementById("ss-title-suggestion");
  if (titleSuggestEl) titleSuggestEl.innerHTML = renderTitleSuggestion(state);
}

function renderDraftPanel() {
  const badgesEl = document.getElementById("ss-draft-badges");
  if (badgesEl) badgesEl.innerHTML = renderDraftBadges(state);
  const summaryEl = document.getElementById("ss-draft-summary");
  if (summaryEl) summaryEl.innerHTML = renderDraftSummary(state);
}

function renderLists() {
  const savedEl = document.getElementById("ss-saved-constructs");
  if (savedEl) savedEl.innerHTML = renderSavedConstructList(state);
  const recentEl = document.getElementById("ss-recent-drafts");
  if (recentEl) recentEl.innerHTML = renderRecentDrafts(state);
}

function renderMatchAndStatus(errorText = "") {
  const statusEl = document.getElementById("ss-match-status");
  const listEl = document.getElementById("ss-match-list");
  if (!statusEl || !listEl) return;
  if (errorText) {
    statusEl.textContent = errorText;
    listEl.innerHTML = "";
    return;
  }
  const rendered = renderMatchPanel(state);
  statusEl.textContent = rendered.status;
  listEl.innerHTML = rendered.list;
}

function renderReconPreviewPanel() {
  const statusEl = document.getElementById("ss-recon-status");
  const previewEl = document.getElementById("ss-recon-preview");
  if (!statusEl || !previewEl) return;
  const rendered = renderReconPreview(state);
  statusEl.textContent = rendered.status;
  previewEl.innerHTML = rendered.preview;
}

function renderBottomDisabledStates() {
  const { index, total } = currentStep(state);
  setDisabled('[data-action="back"]', index <= 0);
  setDisabled('[data-action="next"]', index >= total - 1);
  setDisabled('[data-action="skip"]', false);
  setDisabled('[data-action="update"]', !String(state.draft.id ?? "").trim());
}

function setDisabled(selector, disabled) {
  const button = els.bottom?.querySelector(selector);
  if (button) button.disabled = Boolean(disabled);
}

function bindEvents() {
  els.themeToggle?.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    setTheme(state.theme);
    persist();
  });

  els.left?.addEventListener("input", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    if (target.matches('[data-action="search"]')) {
      state.filters.search = String(target.value ?? "");
      renderLists();
      persist();
    }
  });

  els.left?.addEventListener("change", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    if (target.matches('[data-action="filter-type"]')) {
      const type = String(target.getAttribute("data-type") ?? "").trim();
      if (!CONSTRUCT_TYPES.includes(type)) return;
      if (target.checked) state.filters.types.add(type);
      else state.filters.types.delete(type);
      renderLists();
      persist();
    }
  });

  els.left?.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const actionEl = target.closest("[data-action]");
    if (!actionEl) return;
    const action = String(actionEl.getAttribute("data-action") ?? "");

    if (action === "new-construct") {
      wipeDraft();
      return;
    }

    if (action === "view-construct") {
      const id = String(actionEl.getAttribute("data-id") ?? "").trim();
      state.ui.expandedSavedId = state.ui.expandedSavedId === id ? "" : id;
      renderLists();
      persist();
      return;
    }

    if (action === "use-construct") {
      const id = String(actionEl.getAttribute("data-id") ?? "").trim();
      if (!id) return;
      await loadConstructIntoDraft(id, { replace: true });
      return;
    }

    if (action === "use-recent") {
      const raw = String(actionEl.getAttribute("data-payload") ?? "");
      const parsed = safeJsonParse(raw);
      if (!parsed.ok || !parsed.value) return;
      const id = String(parsed.value?.id ?? "").trim();
      if (id) await loadConstructIntoDraft(id, { replace: true });
    }
  });

  els.workspace?.addEventListener("input", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const field = target.getAttribute("data-field");
    if (field) {
      handleFieldInput(field, target);
      return;
    }

    const action = target.getAttribute("data-action");
    if (action === "steps-edit") {
      const idx = Number(target.getAttribute("data-index") ?? -1);
      if (!Number.isFinite(idx) || idx < 0) return;
      const steps = Array.isArray(state.draft.steps) ? [...state.draft.steps] : [];
      steps[idx] = String(target.value ?? "");
      state.draft.steps = steps;
      renderDraftPanel();
      scheduleRecall();
      persist();
      return;
    }

    if (action === "rules-edit") {
      const idx = Number(target.getAttribute("data-index") ?? -1);
      if (!Number.isFinite(idx) || idx < 0) return;
      const rules = Array.isArray(state.draft.rules) ? [...state.draft.rules] : [];
      rules[idx] = String(target.value ?? "");
      state.draft.rules = rules;
      renderDraftPanel();
      scheduleRecall();
      persist();
      return;
    }

    if (action === "attr-key" || action === "attr-value") {
      const idx = Number(target.getAttribute("data-index") ?? -1);
      if (!Number.isFinite(idx) || idx < 0) return;
      const row = state.ui.attributesRows[idx] ?? { key: "", value: "" };
      if (action === "attr-key") row.key = String(target.value ?? "");
      if (action === "attr-value") row.value = String(target.value ?? "");
      state.ui.attributesRows[idx] = row;
      applyAttributesRowsToDraft(state);
      scheduleRecall();
      persist();
      renderDraftPanel();
      return;
    }

    if (action?.startsWith("diagnostic-")) {
      handleDiagnosticInput(action, target);
      return;
    }

    if (action?.startsWith("spec-")) {
      handleSpecInput(action, target);
      return;
    }

    if (target.id === "ss-query-input") {
      state.ui.queryText = String(target.value ?? "");
      persist();
      scheduleRecon();
    }
  });

  els.workspace?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const actionEl = target.closest("[data-action]");
    if (!actionEl) return;
    const action = String(actionEl.getAttribute("data-action") ?? "");

    if (action === "apply-title") {
      const suggestion = titleSuggestion(state);
      if (!suggestion) return;
      state.draft.title = suggestion;
      renderEditor();
      renderDraftPanel();
      scheduleRecall();
      persist();
      return;
    }

    if (action === "attr-add") {
      state.ui.attributesRows.push({ key: "", value: "" });
      renderEditor();
      persist();
      return;
    }

    if (action === "attr-remove") {
      const idx = Number(actionEl.getAttribute("data-index") ?? -1);
      if (!Number.isFinite(idx) || idx < 0) return;
      state.ui.attributesRows.splice(idx, 1);
      if (state.ui.attributesRows.length === 0) state.ui.attributesRows.push({ key: "", value: "" });
      applyAttributesRowsToDraft(state);
      renderEditor();
      renderDraftPanel();
      scheduleRecall();
      persist();
      return;
    }

    if (action === "steps-add") {
      const steps = Array.isArray(state.draft.steps) ? state.draft.steps : [];
      steps.push("");
      state.draft.steps = steps;
      renderEditor();
      persist();
      return;
    }

    if (action === "steps-remove" || action === "steps-up" || action === "steps-down") {
      const idx = Number(actionEl.getAttribute("data-index") ?? -1);
      if (!Number.isFinite(idx) || idx < 0) return;
      const steps = Array.isArray(state.draft.steps) ? [...state.draft.steps] : [];
      if (action === "steps-remove") steps.splice(idx, 1);
      if (action === "steps-up" && idx > 0) [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]];
      if (action === "steps-down" && idx < steps.length - 1) [steps[idx + 1], steps[idx]] = [steps[idx], steps[idx + 1]];
      state.draft.steps = steps;
      renderEditor();
      renderDraftPanel();
      scheduleRecall();
      persist();
      return;
    }

    if (action === "rules-add") {
      const rules = Array.isArray(state.draft.rules) ? state.draft.rules : [];
      rules.push("");
      state.draft.rules = rules;
      renderEditor();
      persist();
      return;
    }

    if (action === "rules-remove") {
      const idx = Number(actionEl.getAttribute("data-index") ?? -1);
      if (!Number.isFinite(idx) || idx < 0) return;
      const rules = Array.isArray(state.draft.rules) ? [...state.draft.rules] : [];
      rules.splice(idx, 1);
      state.draft.rules = rules;
      renderEditor();
      renderDraftPanel();
      scheduleRecall();
      persist();
      return;
    }

    if (action === "lookup-format") {
      const parsed = safeJsonParse(state.ui.lookupJsonText);
      if (!parsed.ok) {
        state.ui.lookupJsonError = parsed.error ?? "Invalid JSON";
        renderEditor();
        persist();
        return;
      }
      state.ui.lookupJsonError = "";
      state.ui.lookupJsonText = parsed.value ? JSON.stringify(parsed.value, null, 2) : "";
      applyLookupTextToDraft(state);
      renderEditor();
      renderDraftPanel();
      scheduleRecall();
      persist();
      return;
    }

    if (action === "lookup-clear") {
      state.ui.lookupJsonText = "";
      state.ui.lookupJsonError = "";
      state.draft.lookup_table = {};
      renderEditor();
      renderDraftPanel();
      scheduleRecall();
      persist();
      return;
    }

    if (action?.startsWith("diagnostic-") || action?.startsWith("spec-")) {
      handleEditorClick(action, actionEl);
    }
  });

  els.workspace?.addEventListener("change", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const field = target.getAttribute("data-field");
    if (field) {
      handleFieldInput(field, target);
    }
  });

  els.right?.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const actionEl = target.closest("[data-action]");
    if (!actionEl) return;
    const action = String(actionEl.getAttribute("data-action") ?? "");
    const id = String(actionEl.getAttribute("data-id") ?? "").trim();

    if (action === "view-match" && id) {
      state.ui.expandedMatchId = state.ui.expandedMatchId === id ? "" : id;
      renderMatchAndStatus();
      persist();
      return;
    }

    if ((action === "use-match" || action === "merge-match") && id) {
      await applyMatch(id, { merge: action === "merge-match" });
      return;
    }
    if (action === "ignore-match" && id) {
      state.ui.ignoredMatchIds.add(id);
      renderMatchAndStatus();
      persist();
    }
  });

  els.bottom?.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const actionEl = target.closest("[data-action]");
    if (!actionEl) return;
    const action = String(actionEl.getAttribute("data-action") ?? "");

    if (action === "back") {
      state.intake.stepIndex = Math.max(0, Number(state.intake.stepIndex ?? 0) - 1);
      renderEditor();
      renderBottomDisabledStates();
      persist();
      return;
    }

    if (action === "next") {
      state.intake.stepIndex = Math.min(stepSequence(state).length - 1, Number(state.intake.stepIndex ?? 0) + 1);
      renderEditor();
      renderBottomDisabledStates();
      persist();
      return;
    }

    if (action === "skip") {
      const step = currentStep(state);
      applySkipToStep(state, step.key);
      state.intake.stepIndex = Math.min(stepSequence(state).length - 1, Number(state.intake.stepIndex ?? 0) + 1);
      renderAll();
      scheduleRecall();
      return;
    }

    if (action === "check-fits") {
      await runRecallNow();
      return;
    }

    if (action === "reconstruct") {
      await runReconNow();
      return;
    }

    if (action === "save") {
      await saveDraft({ mode: "save" });
      return;
    }

    if (action === "update") {
      await saveDraft({ mode: "update" });
      return;
    }

    if (action === "delete-draft") {
      const ok = window.confirm("Delete the current draft? This wipes the unsaved working construct.");
      if (!ok) return;
      wipeDraft();
      return;
    }

    if (action === "reset") {
      const ok = window.confirm("Reset intake? This wipes the current draft and restarts at the topic step.");
      if (!ok) return;
      wipeDraft();
    }
  });
}

function handleFieldInput(field, target) {
  const value = String(target.value ?? "");

  if (field === "topic") {
    state.draft.topic = value;
    renderHeader();
    renderDraftPanel();
    scheduleRecall();
    persist();
    return;
  }

  if (field === "construct_type") {
    state.draft.construct_type = value;
    if (!buildStepSequence(value).includes(currentStep(state).key)) {
      state.intake.stepIndex = 0;
    }
    renderAll();
    scheduleRecall();
    return;
  }

  if (field === "purpose") {
    state.draft.purpose = value;
    renderDraftPanel();
    scheduleRecall();
    persist();
    return;
  }

  if (field === "core_entities_text") {
    state.draft.core_entities = parseEntityList(value, 24);
    renderDraftPanel();
    scheduleRecall();
    persist();
    return;
  }

  if (field === "lookup_json") {
    state.ui.lookupJsonText = value;
    applyLookupTextToDraft(state);
    renderDraftPanel();
    scheduleRecall();
    persist();
    return;
  }

  if (field === "examples_text") {
    state.draft.examples = parseLineList(value, 24);
    renderDraftPanel();
    scheduleRecall();
    persist();
    return;
  }

  if (field === "tags_text") {
    state.draft.tags = parseCommaList(value, 32);
    renderDraftPanel();
    scheduleRecall();
    persist();
    return;
  }

  if (field === "title") {
    state.draft.title = value;
    renderDraftPanel();
    scheduleRecall();
    persist();
    return;
  }

  if (field === "retrieval_keys_text") {
    state.draft.retrieval_keys = parseEntityList(value, 32);
    renderDraftPanel();
    scheduleRecall();
    persist();
    return;
  }

  if (field === "trigger_phrases_text") {
    state.draft.trigger_phrases = parseLineList(value, 24);
    renderDraftPanel();
    scheduleRecall();
    persist();
  }
}

function handleDiagnosticInput(action, target) {
  const idx = Number(target.getAttribute("data-index") ?? -1);
  if (!Number.isFinite(idx) || idx < 0) return;
  const value = String(target.value ?? "");
  if (action === "diagnostic-symptom-edit") state.ui.diagnostic.symptoms[idx] = value;
  if (action === "diagnostic-cause-edit") state.ui.diagnostic.causes[idx] = value;
  if (action === "diagnostic-check-edit") state.ui.diagnostic.checks[idx] = value;
  applyDiagnosticToDraft(state);
  renderDraftPanel();
  scheduleRecall();
  persist();
}

function handleSpecInput(action, target) {
  const idx = Number(target.getAttribute("data-index") ?? -1);
  if (!Number.isFinite(idx) || idx < 0) return;
  const row = state.ui.specification.rows[idx] ?? { key: "", value: "", unit: "" };
  if (action === "spec-key") row.key = String(target.value ?? "");
  if (action === "spec-value") row.value = String(target.value ?? "");
  if (action === "spec-unit") row.unit = String(target.value ?? "");
  state.ui.specification.rows[idx] = row;
  applySpecificationToDraft(state);
  renderDraftPanel();
  scheduleRecall();
  persist();
}

function handleEditorClick(action, el) {
  if (action === "diagnostic-symptom-add") state.ui.diagnostic.symptoms.push("");
  if (action === "diagnostic-cause-add") state.ui.diagnostic.causes.push("");
  if (action === "diagnostic-check-add") state.ui.diagnostic.checks.push("");

  if (action === "diagnostic-symptom-remove") removeListRow(state.ui.diagnostic.symptoms, el);
  if (action === "diagnostic-cause-remove") removeListRow(state.ui.diagnostic.causes, el);
  if (action === "diagnostic-check-remove") removeListRow(state.ui.diagnostic.checks, el);

  if (action === "spec-add") state.ui.specification.rows.push({ key: "", value: "", unit: "" });
  if (action === "spec-remove") {
    const idx = Number(el.getAttribute("data-index") ?? -1);
    if (Number.isFinite(idx) && idx >= 0) state.ui.specification.rows.splice(idx, 1);
    if (state.ui.specification.rows.length === 0) state.ui.specification.rows.push({ key: "", value: "", unit: "" });
    applySpecificationToDraft(state);
  }

  applyDiagnosticToDraft(state);
  renderEditor();
  renderDraftPanel();
  scheduleRecall();
  persist();
}

function removeListRow(list, el) {
  const idx = Number(el.getAttribute("data-index") ?? -1);
  if (!Number.isFinite(idx) || idx < 0) return;
  list.splice(idx, 1);
  if (list.length === 0) list.push("");
}

function buildRecallQuestion() {
  const attrs = state.draft.attributes && typeof state.draft.attributes === "object" && !Array.isArray(state.draft.attributes)
    ? Object.entries(state.draft.attributes)
      .flatMap(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])
      .slice(0, 24)
      .join(" ")
    : "";

  return [
    state.draft.topic,
    state.draft.title,
    state.draft.purpose,
    attrs,
    ...(Array.isArray(state.draft.core_entities) ? state.draft.core_entities : []),
    ...(Array.isArray(state.draft.tags) ? state.draft.tags : []),
    ...(Array.isArray(state.draft.rules) ? state.draft.rules.slice(0, 6) : [])
  ].map((chunk) => String(chunk ?? "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

async function runRecallNow() {
  const question = buildRecallQuestion();
  if (!question) return;
  try {
    state.ui.lastRecall = await recallTopicspace({ question, topic: String(state.draft.topic ?? "").trim() });
    renderMatchAndStatus();
    persist();
  } catch (error) {
    renderMatchAndStatus(String(error?.message ?? "Unable to recall"));
  }
}

async function runReconNow() {
  const queryEl = document.getElementById("ss-query-input");
  const question = String(queryEl?.value ?? state.ui.queryText ?? "").trim();
  state.ui.queryText = question;
  persist();
  if (!question) {
    state.ui.lastAnswer = null;
    renderReconPreviewPanel();
    return;
  }
  try {
    state.ui.lastAnswer = await answerTopicspace({ question, topic: String(state.draft.topic ?? "").trim() });
  } catch (error) {
    state.ui.lastAnswer = {
      source: "unresolved",
      answer: String(error?.message ?? "Unable to reconstruct"),
      needsAssist: true,
      confidence: 0
    };
  }
  renderReconPreviewPanel();
  persist();
}

async function refreshTopicConstructs() {
  try {
    const payload = await listTopicConstructs();
    state.topicConstructs = Array.isArray(payload?.constructs) ? payload.constructs : [];
  } catch {
    state.topicConstructs = [];
  }
}

async function saveDraft({ mode = "save" } = {}) {
  const topic = String(state.draft.topic ?? "").trim();
  if (!topic) return window.alert("Topic is required.");
  if (!String(state.draft.construct_type ?? "").trim()) return window.alert("Construct type is required.");
  if (mode === "update" && !String(state.draft.id ?? "").trim()) return window.alert("No saved construct loaded. Save first, or use a match.");

  applyAttributesRowsToDraft(state);
  applyLookupTextToDraft(state);
  applyDiagnosticToDraft(state);
  applySpecificationToDraft(state);

  const payload = buildTopicPayload({ mode });
  let saved = null;
  try {
    const response = await learnTopicConstruct(payload);
    saved = response?.construct ?? null;
  } catch (error) {
    window.alert(String(error?.message ?? "Unable to save"));
    return;
  }

  if (saved?.id) state.draft.id = saved.id;

  try {
    await learnSubjectConstruct(buildSubjectPayload(saved ?? payload));
  } catch {
    // Best-effort compatibility.
  }

  state.savedSnapshot = snapshotDraft(state);
  state.ui.recentDrafts = updateRecentDrafts({
    id: state.draft.id || "",
    topic: state.draft.topic || "",
    title: state.draft.title || "",
    construct_type: state.draft.construct_type || "",
    updatedAt: new Date().toISOString()
  });

  await refreshTopicConstructs();
  renderAll();
}

function buildTopicPayload({ mode = "save" } = {}) {
  const payload = {
    topic: String(state.draft.topic ?? "").trim(),
    title: String(state.draft.title ?? "").trim() || null,
    construct_type: String(state.draft.construct_type ?? "").trim() || "hybrid",
    purpose: String(state.draft.purpose ?? "").trim() || null,
    summary: String(state.draft.summary ?? "").trim() || null,
    core_entities: state.draft.core_entities === null ? null : (Array.isArray(state.draft.core_entities) ? state.draft.core_entities : []),
    attributes: state.draft.attributes === null ? null : (state.draft.attributes && typeof state.draft.attributes === "object" ? state.draft.attributes : {}),
    relationships: Array.isArray(state.draft.relationships) ? state.draft.relationships : [],
    rules: state.draft.rules === null ? null : (Array.isArray(state.draft.rules) ? state.draft.rules : []),
    steps: state.draft.steps === null ? null : (Array.isArray(state.draft.steps) ? state.draft.steps : []),
    lookup_table: state.draft.lookup_table === null ? null : (state.draft.lookup_table && typeof state.draft.lookup_table === "object" ? state.draft.lookup_table : {}),
    examples: state.draft.examples === null ? null : (Array.isArray(state.draft.examples) ? state.draft.examples : []),
    sources: Array.isArray(state.draft.sources) ? state.draft.sources : [],
    confidence: state.draft.confidence ?? null,
    tags: state.draft.tags === null ? null : (Array.isArray(state.draft.tags) ? state.draft.tags : []),
    retrieval_keys: state.draft.retrieval_keys === null ? null : (Array.isArray(state.draft.retrieval_keys) ? state.draft.retrieval_keys : []),
    trigger_phrases: state.draft.trigger_phrases === null ? null : (Array.isArray(state.draft.trigger_phrases) ? state.draft.trigger_phrases : []),
    linked_construct_ids: state.draft.linked_construct_ids === null ? null : (Array.isArray(state.draft.linked_construct_ids) ? state.draft.linked_construct_ids : [])
  };
  if (mode === "update" && String(state.draft.id ?? "").trim()) payload.id = String(state.draft.id).trim();
  return payload;
}

function buildSubjectPayload(topicPayload) {
  const rules = Array.isArray(topicPayload?.rules) ? topicPayload.rules : [];
  const steps = Array.isArray(topicPayload?.steps) ? topicPayload.steps : [];
  const lookup = topicPayload?.lookup_table && typeof topicPayload.lookup_table === "object" ? topicPayload.lookup_table : {};
  const notesParts = [];
  if (lookup && Object.keys(lookup).length) notesParts.push(`Lookup table:\n${JSON.stringify(lookup, null, 2)}`);
  if (rules.length) notesParts.push(`Rules:\n${rules.map((r) => `- ${r}`).join("\n")}`);
  const notes = notesParts.join("\n\n").trim() || null;
  return {
    subjectLabel: String(topicPayload?.topic ?? "").trim(),
    constructLabel: String(topicPayload?.title ?? "").trim() || String(topicPayload?.topic ?? "").trim(),
    target: Array.isArray(topicPayload?.core_entities) ? (topicPayload.core_entities[0] ?? null) : null,
    objective: String(topicPayload?.purpose ?? "").trim() || null,
    context: topicPayload?.attributes && typeof topicPayload.attributes === "object" ? topicPayload.attributes : {},
    steps,
    notes,
    tags: Array.isArray(topicPayload?.tags) ? topicPayload.tags : [],
    provenance: {
      source: "workspace-topicspace",
      topicConstructId: String(topicPayload?.id ?? "").trim() || null
    }
  };
}

async function loadConstructIntoDraft(id, { replace = true } = {}) {
  let payload = null;
  try {
    payload = (await getTopicConstruct(id))?.construct ?? null;
  } catch (error) {
    window.alert(String(error?.message ?? "Unable to load construct"));
    return;
  }
  if (!payload) return;

  if (replace) {
    state.draft = {
      ...createEmptyDraft(),
      ...payload,
      id: String(payload.id ?? "").trim(),
      topic: String(payload.topic ?? "").trim(),
      title: String(payload.title ?? "").trim(),
      construct_type: String(payload.construct_type ?? "").trim()
    };
  } else {
    mergeDraftFromMatch(payload);
  }

  state.ui.attributesRows = payload.attributes && typeof payload.attributes === "object"
    ? Object.entries(payload.attributes).map(([key, value]) => ({ key, value: String(value ?? "") }))
    : [{ key: "", value: "" }];
  if (state.ui.attributesRows.length === 0) state.ui.attributesRows.push({ key: "", value: "" });

  state.ui.lookupJsonText = payload.lookup_table && typeof payload.lookup_table === "object" && Object.keys(payload.lookup_table).length
    ? JSON.stringify(payload.lookup_table, null, 2)
    : "";
  state.ui.lookupJsonError = "";

  state.savedSnapshot = snapshotDraft(state);
  state.intake.stepIndex = 0;
  renderAll();
  scheduleRecall();
}

async function applyMatch(id, { merge = false } = {}) {
  let payload = null;
  try {
    payload = (await getTopicConstruct(id))?.construct ?? null;
  } catch (error) {
    window.alert(String(error?.message ?? "Unable to load match"));
    return;
  }
  if (!payload) return;
  if (merge) mergeDraftFromMatch(payload);
  else {
    await loadConstructIntoDraft(id, { replace: true });
    return;
  }
  renderAll();
  scheduleRecall();
}

function mergeDraftFromMatch(match) {
  const next = { ...(state.draft ?? {}) };
  const copyIfEmpty = (key) => {
    const current = next[key];
    const isEmpty = current === null || current === undefined || (typeof current === "string" && !current.trim()) || (Array.isArray(current) && current.length === 0);
    if (isEmpty && match[key] !== undefined) next[key] = match[key];
  };
  copyIfEmpty("topic");
  copyIfEmpty("construct_type");
  copyIfEmpty("title");
  copyIfEmpty("purpose");
  copyIfEmpty("summary");
  if (!Array.isArray(next.core_entities) || next.core_entities.length === 0) next.core_entities = Array.isArray(match.core_entities) ? match.core_entities : [];
  if (!Array.isArray(next.steps) || next.steps.length === 0) next.steps = Array.isArray(match.steps) ? match.steps : [];
  if (!Array.isArray(next.rules) || next.rules.length === 0) next.rules = Array.isArray(match.rules) ? match.rules : [];
  if (!Array.isArray(next.tags) || next.tags.length === 0) next.tags = Array.isArray(match.tags) ? match.tags : [];
  if (!next.lookup_table || (typeof next.lookup_table === "object" && Object.keys(next.lookup_table).length === 0)) next.lookup_table = match.lookup_table ?? {};
  if (!next.attributes || (typeof next.attributes === "object" && Object.keys(next.attributes).length === 0)) next.attributes = match.attributes ?? {};
  state.draft = next;
}

function wipeDraft() {
  state.draft = createEmptyDraft();
  state.intake.stepIndex = 0;
  state.savedSnapshot = "";
  state.ui.lastRecall = null;
  state.ui.lastAnswer = null;
  state.ui.ignoredMatchIds = new Set();
  state.ui.attributesRows = [{ key: "", value: "" }];
  state.ui.lookupJsonText = "";
  state.ui.lookupJsonError = "";
  state.ui.diagnostic = { symptoms: [""], causes: [""], checks: [""] };
  state.ui.specification = { rows: [{ key: "", value: "", unit: "" }] };
  const queryEl = document.getElementById("ss-query-input");
  if (queryEl) queryEl.value = "";
  state.ui.queryText = "";
  renderAll();
}

function setTheme(theme) {
  document.body.dataset.theme = theme === "light" ? "light" : "dark";
}

function createDebounced(fn, delayMs) {
  let timeout = null;
  const debounced = (...args) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delayMs);
  };
  return debounced;
}
