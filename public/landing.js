const statusBadgeEl = document.getElementById("landing-status-badge");
const themeToggleButton = document.getElementById("theme-toggle");
const topicCountEl = document.getElementById("landing-topic-count");
const topicSummaryEl = document.getElementById("landing-topic-summary");
const defaultTopicEl = document.getElementById("landing-default-topic");
const assistSummaryEl = document.getElementById("landing-assist-summary");
const builderMetaEl = document.getElementById("landing-builder-meta");
const intakeForm = document.getElementById("landing-intake-form");
const intakePromptEl = document.getElementById("landing-intake-prompt");
const intakeHintEl = document.getElementById("landing-intake-hint");
const intakeTypeSelect = document.getElementById("landing-intake-type");
const intakeInput = document.getElementById("landing-intake-input");
const intakeBackButton = document.getElementById("landing-intake-back");
const intakeSkipButton = document.getElementById("landing-intake-skip");
const intakeNextButton = document.getElementById("landing-intake-next");
const intakeEditButton = document.getElementById("landing-intake-edit");
const intakeSummarizeButton = document.getElementById("landing-intake-summarize");
const intakeFitsButton = document.getElementById("landing-intake-fits");
const intakeSaveButton = document.getElementById("landing-intake-save");
const intakeUpdateButton = document.getElementById("landing-intake-update");
const intakeVariantButton = document.getElementById("landing-intake-variant");
const intakeDeleteWorkingButton = document.getElementById("landing-intake-delete-working");
const intakeRestartButton = document.getElementById("landing-intake-restart");
const chatFeedEl = document.getElementById("landing-chat-feed");
const topicGridEl = document.getElementById("landing-topic-grid");

const themeStorageKey = "strandspace:theme";
const pendingDraftStorageKey = "strandspace:pending-draft";
const intakeSessionStorageKey = "strandspace:intake-session";

let subjects = [];
let defaultSubjectId = "";
let systemHealth = null;
let lastDraft = null;
let intakeSession = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      [payload.error ?? `Request failed with ${response.status}`, payload.detail ?? "", payload.code ? `Code: ${payload.code}` : ""]
        .filter(Boolean)
        .join(" ")
    );
  }
  return payload;
}

function slugify(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function statusBadgeMarkup(health = null) {
  if (!health) {
    return {
      label: "Status unavailable",
      className: "status-badge warn"
    };
  }

  return health.openai?.enabled
    ? {
      label: `Assist enabled · ${health.openai.model ?? "OpenAI"}`,
      className: "status-badge assist"
    }
    : {
      label: "Local-only mode",
      className: "status-badge local"
    };
}

function renderSystemHealth(health = null) {
  systemHealth = health;
  const badge = statusBadgeMarkup(health);

  if (statusBadgeEl) {
    statusBadgeEl.className = badge.className;
    statusBadgeEl.textContent = badge.label;
  }

  if (assistSummaryEl) {
    assistSummaryEl.textContent = health?.openai?.enabled
      ? `AI construct refinement is available on ${health.openai.model}.`
      : (health?.openai?.reason || "OpenAI assist is off, so construct drafting stays local-only.");
  }
}

async function loadSystemHealth() {
  try {
    renderSystemHealth(await fetchJson("/api/system/health"));
  } catch (error) {
    renderSystemHealth(null);
    if (assistSummaryEl) {
      assistSummaryEl.textContent = error instanceof Error ? error.message : "Unable to load assist status.";
    }
  }
}

function sortSubjects(items = []) {
  return [...items].sort((left, right) => {
    const leftCount = Number(left.constructCount ?? 0);
    const rightCount = Number(right.constructCount ?? 0);
    if (rightCount !== leftCount) {
      return rightCount - leftCount;
    }

    return String(left.subjectLabel ?? "").localeCompare(String(right.subjectLabel ?? ""));
  });
}

function subjectPageUrl(subjectId = "") {
  return `/subject?subjectId=${encodeURIComponent(subjectId)}`;
}

function writePendingDraft(construct = null) {
  if (!construct) {
    return;
  }

  try {
    window.sessionStorage.setItem(pendingDraftStorageKey, JSON.stringify(construct));
  } catch {
    // Ignore sessionStorage failures.
  }
}

function renderTopicSummary() {
  if (topicCountEl) {
    topicCountEl.textContent = String(subjects.length);
  }

  if (topicSummaryEl) {
    topicSummaryEl.textContent = subjects.length
      ? `${subjects.reduce((total, subject) => total + Number(subject.constructCount ?? 0), 0)} constructs are already local.`
      : "No local topics yet. Build the first construct in the backend or with the AI builder.";
  }

  const defaultSubject = subjects.find((subject) => subject.subjectId === defaultSubjectId) ?? subjects[0] ?? null;
  if (defaultTopicEl) {
    defaultTopicEl.textContent = defaultSubject?.subjectLabel ?? "None yet";
  }
}

function renderTopicGrid() {
  if (!topicGridEl) {
    return;
  }

  if (!subjects.length) {
    topicGridEl.innerHTML = `
      <article class="landing-topic-empty">
        <p>No local topics yet. Use the builder above or the backend to teach the first subject.</p>
      </article>
    `;
    return;
  }

  topicGridEl.innerHTML = sortSubjects(subjects).map((subject) => `
    <article class="landing-topic-card">
      <div class="section-head">
        <div>
          <p class="eyebrow small">Local topic</p>
          <h3>${escapeHtml(subject.subjectLabel ?? "Subject")}</h3>
        </div>
        <span class="chip">${escapeHtml(`${Number(subject.constructCount ?? 0)} constructs`)}</span>
      </div>
      <p class="meta">
        Open a dynamic subject page built from the local Strandspace constructs already stored in this topic.
      </p>
      <div class="landing-topic-actions">
        <a class="secondary-button landing-link-button" href="${subjectPageUrl(subject.subjectId)}">Open topic page</a>
        <a class="secondary-button landing-link-button" href="/backend">Open backend</a>
      </div>
    </article>
  `).join("");
}

async function loadSubjects() {
  const payload = await fetchJson("/api/subjectspace/subjects");
  subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  defaultSubjectId = String(payload.defaultSubjectId ?? "").trim();
  renderTopicSummary();
  renderTopicGrid();
}

function resolveTopicLinkForDraft(construct = null) {
  if (!construct) {
    return "";
  }

  if (construct.subjectId) {
    return subjectPageUrl(construct.subjectId);
  }

  const byLabel = subjects.find((item) => String(item.subjectLabel ?? "").trim().toLowerCase() === String(construct.subjectLabel ?? "").trim().toLowerCase());
  return byLabel ? subjectPageUrl(byLabel.subjectId) : "";
}

function renderChatFeed(response = null) {
  if (!chatFeedEl) {
    return;
  }

  if (!response) {
    chatFeedEl.className = "landing-chat-feed empty";
    chatFeedEl.innerHTML = "<p>Drafted constructs will appear here with quick links to the topic page and backend review flow.</p>";
    return;
  }

  const draft = response.suggestedConstruct ?? response.draft ?? {};
  const topicLink = resolveTopicLinkForDraft(draft);
  const sourceLabel = String(response.sourceLabel ?? "Working construct").trim() || "Working construct";

  lastDraft = draft;
  chatFeedEl.className = "landing-chat-feed";
  chatFeedEl.innerHTML = `
    <article class="landing-chat-message assistant">
      <div class="answer-topline">
        <div class="answer-badges">
          <span class="answer-source">${escapeHtml(sourceLabel)}</span>
          ${response.usedAssist ? '<span class="answer-badge assist-used">AI Assist used</span>' : ""}
        </div>
        <span class="meta">${escapeHtml(draft.subjectLabel ?? "Construct draft")}</span>
      </div>
      <h3>${escapeHtml(draft.constructLabel ?? "Draft construct")}</h3>
      <p class="answer-summary">${escapeHtml(draft.objective ?? "Review this construct in the backend before saving.")}</p>
      <div class="answer-meta">
        <div>
          <dt>Target</dt>
          <dd>${escapeHtml(draft.target ?? "n/a")}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>${escapeHtml(draft.subjectLabel ?? "n/a")}</dd>
        </div>
        <div>
          <dt>Context</dt>
          <dd>${escapeHtml(Object.entries(draft.context ?? {}).slice(0, 2).map(([key, value]) => `${key}: ${value}`).join(" | ") || "n/a")}</dd>
        </div>
        <div>
          <dt>Draft Mode</dt>
          <dd>${escapeHtml(String(response.mode ?? "guided-intake"))}</dd>
        </div>
      </div>
      ${Array.isArray(draft.steps) && draft.steps.length ? `
        <div class="review-list">
          <strong>Suggested steps</strong>
          <ul>
            ${draft.steps.slice(0, 6).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${Array.isArray(draft.tags) && draft.tags.length ? `
        <div class="chip-row">
          ${draft.tags.slice(0, 8).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
        </div>
      ` : ""}
      ${response.fitsMarkup ?? ""}
      <div class="landing-chat-actions">
        <button type="button" class="secondary-button landing-review-button">Review in backend</button>
        ${topicLink ? `<a class="secondary-button landing-link-button" href="${topicLink}">Open topic page</a>` : ""}
      </div>
    </article>
  `;
}

function readIntakeSession() {
  try {
    const raw = window.sessionStorage.getItem(intakeSessionStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeIntakeSession(session = null) {
  try {
    if (!session) {
      window.sessionStorage.removeItem(intakeSessionStorageKey);
      return;
    }

    window.sessionStorage.setItem(intakeSessionStorageKey, JSON.stringify(session));
  } catch {
    // Ignore sessionStorage failures.
  }
}

function defaultIntakeSession() {
  return {
    stepIndex: 0,
    topic: "",
    constructType: "",
    working: {
      id: "",
      subjectId: "",
      subjectLabel: "",
      constructLabel: "",
      target: "",
      objective: "",
      context: "",
      steps: "",
      notes: "",
      tags: "",
      parentConstructId: "",
      branchReason: "",
      changeSummary: "",
      variantType: ""
    },
    lastFits: null
  };
}

const intakeStepsByType = {
  "reference/lookup": ["target", "objective", "context", "notes", "tags"],
  "procedure/how-to": ["target", "objective", "context", "steps", "notes", "tags"],
  "setup/configuration": ["target", "objective", "context", "steps", "notes", "tags"],
  "profile/entity": ["target", "objective", "context", "notes", "tags"],
  comparison: ["target", "objective", "context", "steps", "notes", "tags"],
  diagnostic: ["target", "objective", "context", "steps", "notes", "tags"],
  "specification/measurement": ["target", "objective", "context", "notes", "tags"]
};

const promptCopy = {
  topic: { prompt: "What is the topic?", hint: "Example: resistor color code, onboarding checklist, lens selection." },
  constructType: { prompt: "What type of construct is this?", hint: "Pick the closest match. You can change it later." },
  target: { prompt: "What is the target?", hint: "What the construct applies to (device, entity, thing, system)." },
  objective: { prompt: "What is the objective?", hint: "Success outcome or what the lookup should return." },
  context: { prompt: "What context matters?", hint: "Use `key: value` lines for environment, inputs, constraints." },
  steps: { prompt: "What are the steps/settings?", hint: "One per line. Skip if not needed." },
  notes: { prompt: "Notes / table / rules", hint: "Put the lookup mapping or key rules here for local reconstruction." },
  tags: { prompt: "Tags (optional)", hint: "Comma-separated is fine." },
  constructLabel: { prompt: "What should we call this construct (title)?", hint: "Leave blank to use the topic as the title." },
  subjectLabel: { prompt: "Save this under which topic (subject)?", hint: "Leave blank to save under the same topic name." }
};

function guessConstructType(topic = "") {
  const text = String(topic ?? "").trim().toLowerCase();
  if (!text) {
    return "";
  }
  if (/\bcompare\b|\bvs\b|\bversus\b/.test(text)) return "comparison";
  if (/\btroubleshoot\b|\bdiagnos\b|\bwhy\b|\bfix\b/.test(text)) return "diagnostic";
  if (/\bsetup\b|\bconfigure\b|\bconfig\b|\bsettings\b/.test(text)) return "setup/configuration";
  if (/\bhow to\b|\bhow do i\b|\bprocedure\b|\bchecklist\b/.test(text)) return "procedure/how-to";
  if (/\bspec\b|\bmeasure\b|\bmeasurement\b|\btolerance\b|\bunits\b/.test(text)) return "specification/measurement";
  if (/\blookup\b|\breference\b|\btable\b|\bmap\b|\bmapping\b|\bcode\b/.test(text)) return "reference/lookup";
  return "reference/lookup";
}

function buildStepSequence(session) {
  const type = String(session?.constructType ?? "").trim();
  const typeSteps = intakeStepsByType[type] ?? [];
  return ["topic", "constructType", ...typeSteps, "constructLabel", "subjectLabel"];
}

function currentStep(session) {
  const steps = buildStepSequence(session);
  const index = Math.max(0, Math.min(Number(session?.stepIndex ?? 0) || 0, steps.length - 1));
  return { key: steps[index], index, total: steps.length };
}

function readWorkingValue(session, key) {
  if (key === "topic") return String(session?.topic ?? "");
  if (key === "constructType") return String(session?.constructType ?? "");
  return String(session?.working?.[key] ?? "");
}

function writeWorkingValue(session, key, value) {
  const text = String(value ?? "");
  if (key === "topic") {
    session.topic = text.trim();
    return;
  }
  if (key === "constructType") {
    session.constructType = text.trim();
    return;
  }
  session.working[key] = text;
}

function updateIntakeControls(session) {
  const { index, total } = currentStep(session);
  const hasWorkingId = Boolean(String(session?.working?.id ?? "").trim());
  if (intakeBackButton) intakeBackButton.disabled = index <= 0;
  if (intakeUpdateButton) intakeUpdateButton.disabled = !hasWorkingId;
  if (intakeVariantButton) intakeVariantButton.disabled = !hasWorkingId;
  if (intakeNextButton) intakeNextButton.textContent = index >= total - 1 ? "Done" : "Next";
}

function renderIntakeStep(session) {
  intakeSession = session;
  writeIntakeSession(session);

  const { key, index, total } = currentStep(session);
  const copy = promptCopy[key] ?? { prompt: "Next question", hint: "" };
  const value = readWorkingValue(session, key);

  if (intakePromptEl) intakePromptEl.textContent = copy.prompt;
  if (intakeHintEl) {
    const hint = [copy.hint, `(${index + 1}/${total})`].filter(Boolean).join(" ");
    intakeHintEl.textContent = hint;
  }

  const showType = key === "constructType";
  if (intakeTypeSelect) {
    intakeTypeSelect.classList.toggle("is-hidden", !showType);
    intakeTypeSelect.value = showType ? (value || guessConstructType(session.topic)) : intakeTypeSelect.value;
  }

  if (intakeInput) {
    intakeInput.classList.toggle("is-hidden", showType);
    intakeInput.value = showType ? "" : value;
    intakeInput.rows = ["notes", "steps", "context"].includes(key) ? 8 : 4;
    if (!showType) intakeInput.focus();
  }

  updateIntakeControls(session);
}

function buildWorkingDraft(session) {
  const topic = String(session?.topic ?? "").trim();
  const constructType = String(session?.constructType ?? "").trim();
  const working = session?.working ?? {};

  const subjectLabel = String(working.subjectLabel ?? "").trim() || topic;
  const constructLabel = String(working.constructLabel ?? "").trim() || topic;
  const contextBlocks = [];
  if (constructType) contextBlocks.push(`constructType: ${constructType}`);
  if (topic) contextBlocks.push(`topic: ${topic}`);
  if (String(working.context ?? "").trim()) contextBlocks.push(String(working.context).trim());

  return {
    ...working,
    subjectLabel,
    constructLabel,
    context: contextBlocks.join("\n").trim(),
    provenance: {
      ...(working.provenance ?? {}),
      source: "guided-intake",
      intakeTopic: topic || null,
      intakeType: constructType || null
    }
  };
}

function renderDraftSummary(session, extra = {}) {
  const draft = buildWorkingDraft(session);
  renderChatFeed({
    sourceLabel: extra.sourceLabel ?? "Working construct",
    mode: extra.mode ?? "guided-intake",
    usedAssist: false,
    fitsMarkup: extra.fitsMarkup ?? "",
    draft
  });
  if (builderMetaEl) builderMetaEl.textContent = extra.metaText ?? "Working construct updated. Save it when it looks right.";
}

function buildFitQuestion(session) {
  const draft = buildWorkingDraft(session);
  return [
    session.topic,
    draft.constructLabel,
    draft.target,
    draft.objective,
    draft.tags
  ].map((value) => String(value ?? "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function resolveSubjectIdForSession(session) {
  const explicit = String(session?.working?.subjectId ?? "").trim();
  if (explicit) return explicit;
  const label = String(session?.working?.subjectLabel ?? "").trim() || String(session?.topic ?? "").trim();
  if (!label) return "";
  const match = subjects.find((item) => String(item.subjectLabel ?? "").trim().toLowerCase() === label.toLowerCase());
  return match?.subjectId ?? "";
}

async function checkPossibleFits(session) {
  const question = buildFitQuestion(session);
  if (!question) throw new Error("Enter at least a topic first so Strandspace can check possible fits.");
  const subjectId = resolveSubjectIdForSession(session);
  const params = new URLSearchParams();
  params.set("question", question);
  if (subjectId) params.set("subjectId", subjectId);
  return fetchJson(`/api/subjectspace/recall?${params.toString()}`);
}

function fitsMarkupFromRecall(recall = null) {
  const candidates = Array.isArray(recall?.candidates) ? recall.candidates : [];
  const matched = recall?.matched ?? null;
  const rows = (matched ? [matched, ...candidates.slice(0, 4)] : candidates.slice(0, 5)).slice(0, 5);
  if (!rows.length) {
    return `<p class="meta landing-meta-light">No close matches yet. Keep capturing details or save a new partial construct.</p>`;
  }

  return `
    <div class="review-list">
      <strong>Possible fits</strong>
      <ul>
        ${rows.map((item) => `<li>${escapeHtml(item.constructLabel ?? item.target ?? "Construct")} <span class="meta">(score ${Number(item.score ?? 0).toFixed(1)})</span></li>`).join("")}
      </ul>
      ${matched ? `<button type="button" class="secondary-button subtle-button landing-use-fit" data-construct-id="${escapeHtml(matched.id)}">Use matched construct</button>` : ""}
    </div>
  `;
}

function applyMatchedConstructToSession(session, construct) {
  if (!construct) return session;
  session.working = {
    ...session.working,
    id: construct.id ?? "",
    subjectId: construct.subjectId ?? "",
    subjectLabel: construct.subjectLabel ?? session.working.subjectLabel ?? "",
    constructLabel: construct.constructLabel ?? session.working.constructLabel ?? "",
    target: construct.target ?? session.working.target ?? "",
    objective: construct.objective ?? session.working.objective ?? "",
    context: construct.context ? Object.entries(construct.context).map(([k, v]) => `${k}: ${v}`).join("\n") : (session.working.context ?? ""),
    steps: Array.isArray(construct.steps) ? construct.steps.join("\n") : (session.working.steps ?? ""),
    notes: construct.notes ?? session.working.notes ?? "",
    tags: Array.isArray(construct.tags) ? construct.tags.join(", ") : (session.working.tags ?? "")
  };
  return session;
}

async function saveWorkingConstruct(session, { mode = "save" } = {}) {
  const draft = buildWorkingDraft(session);
  if (!draft.subjectLabel) throw new Error("Topic is required before saving.");
  if (!draft.constructLabel && !draft.target) throw new Error("Add a title (or at least a target) before saving.");

  const payload = {
    id: mode === "update" ? (String(draft.id ?? "").trim() || undefined) : undefined,
    subjectId: String(draft.subjectId ?? "").trim() || undefined,
    subjectLabel: draft.subjectLabel,
    constructLabel: draft.constructLabel,
    target: String(draft.target ?? "").trim() || null,
    objective: String(draft.objective ?? "").trim() || null,
    context: String(draft.context ?? "").trim(),
    steps: String(draft.steps ?? "").trim(),
    notes: String(draft.notes ?? "").trim() || null,
    tags: String(draft.tags ?? "").trim(),
    parentConstructId: String(draft.parentConstructId ?? "").trim() || null,
    branchReason: String(draft.branchReason ?? "").trim() || null,
    changeSummary: String(draft.changeSummary ?? "").trim() || null,
    variantType: String(draft.variantType ?? "").trim() || null,
    provenance: draft.provenance
  };

  const response = await fetchJson("/api/subjectspace/learn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const saved = response.construct ?? null;
  if (saved) {
    session.working.id = saved.id ?? session.working.id;
    session.working.subjectId = saved.subjectId ?? session.working.subjectId;
    session.working.subjectLabel = saved.subjectLabel ?? session.working.subjectLabel;
    session.working.constructLabel = saved.constructLabel ?? session.working.constructLabel;
  }
  writeIntakeSession(session);
  return { response, saved };
}

function buildVariantId(parentId = "", label = "") {
  const base = String(parentId ?? "").trim() || `construct-${Date.now().toString(36)}`;
  const slug = slugify(label) || "variant";
  return `${base}--${slug}-v${Date.now().toString(36)}`;
}

function restartIntake() {
  intakeSession = defaultIntakeSession();
  writeIntakeSession(intakeSession);
  renderIntakeStep(intakeSession);
  renderChatFeed(null);
  if (builderMetaEl) builderMetaEl.textContent = "The first question is always: What is the topic?";
}

function deleteWorkingConstruct() {
  intakeSession = defaultIntakeSession();
  writeIntakeSession(intakeSession);
  renderIntakeStep(intakeSession);
  renderChatFeed(null);
  if (builderMetaEl) builderMetaEl.textContent = "Working construct deleted. Start again with a topic.";
}

function backStep() {
  intakeSession.stepIndex = Math.max(0, Number(intakeSession.stepIndex ?? 0) - 1);
  renderIntakeStep(intakeSession);
}

function skipStep() {
  const { key } = currentStep(intakeSession);
  writeWorkingValue(intakeSession, key, "");
  intakeSession.stepIndex = Math.min(buildStepSequence(intakeSession).length - 1, Number(intakeSession.stepIndex ?? 0) + 1);
  renderIntakeStep(intakeSession);
}

function editField() {
  const fields = ["topic", "constructType", "target", "objective", "context", "steps", "notes", "tags", "constructLabel", "subjectLabel"];
  const key = window.prompt(`Edit which field?\n${fields.join(", ")}`);
  if (!key) return;
  const normalized = String(key).trim();
  if (!fields.includes(normalized)) {
    if (builderMetaEl) builderMetaEl.textContent = `Unknown field "${normalized}".`;
    return;
  }
  const current = readWorkingValue(intakeSession, normalized);
  const next = window.prompt(`New value for ${normalized}:`, current);
  if (next === null) return;
  writeWorkingValue(intakeSession, normalized, next);
  renderIntakeStep(intakeSession);
  renderDraftSummary(intakeSession, { metaText: `Updated ${normalized}.` });
}

async function handleIntakeNext(event) {
  event.preventDefault();
  const { key, index, total } = currentStep(intakeSession);

  if (key === "constructType") {
    const selected = String(intakeTypeSelect?.value ?? "").trim() || guessConstructType(intakeSession.topic);
    writeWorkingValue(intakeSession, "constructType", selected);
  } else {
    const value = String(intakeInput?.value ?? "").trim();
    writeWorkingValue(intakeSession, key, value);

    if (key === "topic") {
      const guessed = guessConstructType(value);
      if (guessed && !String(intakeSession.constructType ?? "").trim()) {
        intakeSession.constructType = guessed;
      }
    }
    if (key === "constructLabel" && !String(value ?? "").trim()) {
      writeWorkingValue(intakeSession, "constructLabel", String(intakeSession.topic ?? "").trim());
    }
    if (key === "subjectLabel" && !String(value ?? "").trim()) {
      writeWorkingValue(intakeSession, "subjectLabel", String(intakeSession.topic ?? "").trim());
    }
  }

  if (index >= total - 1) {
    renderDraftSummary(intakeSession, { metaText: "Intake complete. Save it now or keep editing.", mode: "intake-complete" });
    return;
  }

  intakeSession.stepIndex = Number(intakeSession.stepIndex ?? 0) + 1;
  renderIntakeStep(intakeSession);
}

intakeForm?.addEventListener("submit", handleIntakeNext);

chatFeedEl?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const reviewButton = target.closest(".landing-review-button");
  if (reviewButton && lastDraft) {
    writePendingDraft(lastDraft);
    window.location.href = "/backend";
    return;
  }

  const useFitButton = target.closest(".landing-use-fit");
  if (useFitButton) {
    const id = String(useFitButton.getAttribute("data-construct-id") ?? "").trim();
    const recall = intakeSession?.lastFits ?? null;
    if (!id || !recall?.matched || recall.matched.id !== id) {
      return;
    }

    applyMatchedConstructToSession(intakeSession, recall.matched);
    writeIntakeSession(intakeSession);
    renderIntakeStep(intakeSession);
    renderDraftSummary(intakeSession, { metaText: "Loaded the matched construct. Update it or create a variant." });
  }
});

themeToggleButton?.addEventListener("click", toggleTheme);

applyTheme(readStoredTheme() || "light");
renderChatFeed(null);
intakeSession = readIntakeSession() || defaultIntakeSession();
renderIntakeStep(intakeSession);
if (builderMetaEl) {
  builderMetaEl.textContent = "The first question is always: What is the topic?";
}

intakeBackButton?.addEventListener("click", backStep);
intakeSkipButton?.addEventListener("click", skipStep);
intakeEditButton?.addEventListener("click", editField);
intakeSummarizeButton?.addEventListener("click", () => renderDraftSummary(intakeSession, { metaText: "Summary updated." }));
intakeFitsButton?.addEventListener("click", async () => {
  if (builderMetaEl) builderMetaEl.textContent = "Checking possible fits from local constructs...";
  setButtonBusy(intakeFitsButton, true, "Checking...");
  try {
    const recall = await checkPossibleFits(intakeSession);
    intakeSession.lastFits = recall;
    writeIntakeSession(intakeSession);
    renderDraftSummary(intakeSession, {
      metaText: recall.ready ? "Stable local fit found. You can update it or create a variant." : "No stable local fit yet. Save a new construct or add more structure.",
      sourceLabel: recall.ready ? "Local fit check (stable match)" : "Local fit check",
      fitsMarkup: fitsMarkupFromRecall(recall)
    });
  } catch (error) {
    if (builderMetaEl) builderMetaEl.textContent = error instanceof Error ? error.message : "Unable to check fits.";
  } finally {
    setButtonBusy(intakeFitsButton, false);
  }
});

intakeSaveButton?.addEventListener("click", async () => {
  setButtonBusy(intakeSaveButton, true, "Saving...");
  try {
    const { saved } = await saveWorkingConstruct(intakeSession, { mode: "save" });
    renderDraftSummary(intakeSession, { sourceLabel: "Saved construct", metaText: `Saved "${saved?.constructLabel ?? "construct"}" locally.` });
  } catch (error) {
    if (builderMetaEl) builderMetaEl.textContent = error instanceof Error ? error.message : "Unable to save construct.";
  } finally {
    setButtonBusy(intakeSaveButton, false);
  }
});

intakeUpdateButton?.addEventListener("click", async () => {
  setButtonBusy(intakeUpdateButton, true, "Updating...");
  try {
    const hasId = Boolean(String(intakeSession?.working?.id ?? "").trim());
    if (!hasId) throw new Error("No saved construct loaded. Use 'Check possible fits' or save first.");
    const { saved } = await saveWorkingConstruct(intakeSession, { mode: "update" });
    renderDraftSummary(intakeSession, { sourceLabel: "Updated construct", metaText: `Updated "${saved?.constructLabel ?? "construct"}".` });
  } catch (error) {
    if (builderMetaEl) builderMetaEl.textContent = error instanceof Error ? error.message : "Unable to update construct.";
  } finally {
    setButtonBusy(intakeUpdateButton, false);
  }
});

intakeVariantButton?.addEventListener("click", async () => {
  setButtonBusy(intakeVariantButton, true, "Branching...");
  try {
    const parentId = String(intakeSession?.working?.id ?? "").trim();
    if (!parentId) throw new Error("No parent construct loaded. Use 'Check possible fits' or save first.");

    const nextId = buildVariantId(parentId, intakeSession.working.constructLabel || intakeSession.topic);
    intakeSession.working.parentConstructId = parentId;
    intakeSession.working.id = nextId;
    intakeSession.working.variantType = "manual_variant";
    intakeSession.working.branchReason = "manual_variant";
    intakeSession.working.changeSummary = intakeSession.working.changeSummary || "Manual variant created from guided intake.";

    const { saved } = await saveWorkingConstruct(intakeSession, { mode: "update" });
    renderDraftSummary(intakeSession, { sourceLabel: "Created variant", metaText: `Created variant "${saved?.constructLabel ?? "variant"}".` });
  } catch (error) {
    if (builderMetaEl) builderMetaEl.textContent = error instanceof Error ? error.message : "Unable to create variant.";
  } finally {
    setButtonBusy(intakeVariantButton, false);
  }
});

intakeDeleteWorkingButton?.addEventListener("click", deleteWorkingConstruct);
intakeRestartButton?.addEventListener("click", restartIntake);

Promise.all([loadSystemHealth(), loadSubjects()]).catch((error) => {
  const message = error instanceof Error ? error.message : "Unable to load the Strandspace landing page.";
  if (builderMetaEl) {
    builderMetaEl.textContent = message;
  }
  if (topicSummaryEl) {
    topicSummaryEl.textContent = message;
  }
});
