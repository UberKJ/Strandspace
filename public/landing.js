const statusBadgeEl = document.getElementById("landing-status-badge");
const themeToggleButton = document.getElementById("theme-toggle");
const topicCountEl = document.getElementById("landing-topic-count");
const topicSummaryEl = document.getElementById("landing-topic-summary");
const defaultTopicEl = document.getElementById("landing-default-topic");
const assistSummaryEl = document.getElementById("landing-assist-summary");
const builderMetaEl = document.getElementById("landing-builder-meta");
const builderForm = document.getElementById("landing-builder-form");
const builderSubmitButton = document.getElementById("landing-builder-submit");
const subjectSelect = document.getElementById("landing-subject-select");
const subjectLabelInput = document.getElementById("landing-subject-label");
const builderInput = document.getElementById("landing-builder-input");
const chatFeedEl = document.getElementById("landing-chat-feed");
const topicGridEl = document.getElementById("landing-topic-grid");

const themeStorageKey = "strandspace:theme";
const pendingDraftStorageKey = "strandspace:pending-draft";

let subjects = [];
let defaultSubjectId = "";
let systemHealth = null;
let lastDraft = null;

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

function selectedSubject() {
  return subjects.find((item) => item.subjectId === String(subjectSelect?.value ?? "").trim()) ?? null;
}

function selectedSubjectLabel() {
  const current = selectedSubject();
  return current?.subjectLabel ?? String(subjectLabelInput?.value ?? "").trim();
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

function renderSubjectOptions() {
  if (!subjectSelect) {
    return;
  }

  const orderedSubjects = sortSubjects(subjects);
  subjectSelect.innerHTML = [
    "<option value=\"\">Use a new topic</option>",
    ...orderedSubjects.map((subject) => `
      <option value="${escapeHtml(subject.subjectId)}"${subject.subjectId === defaultSubjectId ? " selected" : ""}>
        ${escapeHtml(subject.subjectLabel)} (${Number(subject.constructCount ?? 0)})
      </option>
    `)
  ].join("");
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
        ${subject.subjectId === "music-engineering"
          ? '<a class="secondary-button landing-link-button" href="/soundspace">Open Soundspace</a>'
          : '<a class="secondary-button landing-link-button" href="/backend">Open backend</a>'}
      </div>
    </article>
  `).join("");
}

async function loadSubjects() {
  const payload = await fetchJson("/api/subjectspace/subjects");
  subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  defaultSubjectId = String(payload.defaultSubjectId ?? "").trim();
  renderSubjectOptions();
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

function renderBuildChecks(checks = [], references = []) {
  const buildChecks = Array.isArray(checks) ? checks.filter(Boolean) : [];
  const checkedReferences = Array.isArray(references) ? references.filter(Boolean) : [];

  if (!buildChecks.length && !checkedReferences.length) {
    return "";
  }

  return `
    <div class="landing-draft-meta">
      ${buildChecks.length ? `
        <div class="review-list">
          <strong>Builder checks</strong>
          <ul>
            ${buildChecks.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${checkedReferences.length ? `
        <div class="review-list">
          <strong>Checked references</strong>
          <ul>
            ${checkedReferences.slice(0, 4).map((item) => `<li>${escapeHtml(item.constructLabel ?? item.target ?? item.subjectLabel ?? "Stored construct")}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
    </div>
  `;
}

function renderChatFeed(response = null, requestText = "") {
  if (!chatFeedEl) {
    return;
  }

  if (!response) {
    chatFeedEl.className = "landing-chat-feed empty";
    chatFeedEl.innerHTML = "<p>Drafted constructs will appear here with quick links to the topic page and backend review flow.</p>";
    return;
  }

  const draft = response.suggestedConstruct ?? {};
  const topicLink = resolveTopicLinkForDraft(draft);
  const sourceLabel = response.source === "openai"
    ? `AI-refined draft${response.warning ? " with local fallback notes" : ""}`
    : response.warning
      ? `Local draft (${response.warning})`
      : "Local construct draft";

  lastDraft = draft;
  chatFeedEl.className = "landing-chat-feed";
  chatFeedEl.innerHTML = `
    <article class="landing-chat-message user">
      <p class="eyebrow small">You asked</p>
      <p>${escapeHtml(requestText)}</p>
    </article>
    <article class="landing-chat-message assistant">
      <div class="answer-topline">
        <div class="answer-badges">
          <span class="answer-source">${escapeHtml(sourceLabel)}</span>
          ${response.source === "openai" ? '<span class="answer-badge assist-used">AI Assist used</span>' : ""}
        </div>
        <span class="meta">${escapeHtml(draft.subjectLabel ?? selectedSubjectLabel() ?? "Construct draft")}</span>
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
          <dd>${escapeHtml(response.mergeMode === "extend" ? "Extending current memory" : "New construct draft")}</dd>
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
      ${renderBuildChecks(response.buildChecks, response.checkedReferences)}
      <div class="landing-chat-actions">
        <button type="button" class="secondary-button landing-review-button">Review in backend</button>
        ${topicLink ? `<a class="secondary-button landing-link-button" href="${topicLink}">Open topic page</a>` : ""}
      </div>
    </article>
  `;
}

async function handleBuildSubmit(event) {
  event.preventDefault();
  const input = String(builderInput?.value ?? "").trim();
  const selectedId = String(subjectSelect?.value ?? "").trim();
  const selectedLabel = selectedSubject()?.subjectLabel ?? "";
  const customLabel = String(subjectLabelInput?.value ?? "").trim();
  const subjectLabel = customLabel || selectedLabel || "Custom Subject";

  if (!input) {
    if (builderMetaEl) {
      builderMetaEl.textContent = "Describe the construct first so Strandspace has something to draft.";
    }
    return;
  }

  builderMetaEl.textContent = "Drafting construct from your request...";
  setButtonBusy(builderSubmitButton, true, "Drafting...");

  try {
    const payload = await fetchJson("/api/subjectspace/build", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subjectId: selectedId,
        subjectLabel,
        input
      })
    });

    renderChatFeed(payload, input);
    builderMetaEl.textContent = payload.source === "openai"
      ? `AI refined a draft for ${payload.suggestedConstruct?.subjectLabel ?? subjectLabel}. Review it before saving.`
      : `Local draft ready for ${payload.suggestedConstruct?.subjectLabel ?? subjectLabel}. Review it before saving.`;
  } catch (error) {
    builderMetaEl.textContent = error instanceof Error ? error.message : "Unable to build that construct draft.";
    renderChatFeed(null);
  } finally {
    setButtonBusy(builderSubmitButton, false);
  }
}

builderForm?.addEventListener("submit", handleBuildSubmit);

chatFeedEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest(".landing-review-button") : null;
  if (!button || !lastDraft) {
    return;
  }

  writePendingDraft(lastDraft);
  window.location.href = "/backend";
});

themeToggleButton?.addEventListener("click", toggleTheme);

applyTheme(readStoredTheme() || "light");
renderChatFeed(null);

Promise.all([loadSystemHealth(), loadSubjects()]).catch((error) => {
  const message = error instanceof Error ? error.message : "Unable to load the Strandspace landing page.";
  if (builderMetaEl) {
    builderMetaEl.textContent = message;
  }
  if (topicSummaryEl) {
    topicSummaryEl.textContent = message;
  }
});
