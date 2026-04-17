const titleEl = document.getElementById("subject-title");
const mastheadCopyEl = document.getElementById("subject-masthead-copy");
const metaEl = document.getElementById("subject-meta");
const statusLineEl = document.getElementById("subject-status-line");
const statusBadgeEl = document.getElementById("subject-status-badge");
const subjectPicker = document.getElementById("subject-picker");
const promptRowEl = document.getElementById("subject-prompt-row");
const form = document.getElementById("subject-form");
const questionInput = document.getElementById("subject-question");
const clearButton = document.getElementById("subject-clear");
const answerEl = document.getElementById("subject-answer");
const libraryMetaEl = document.getElementById("subject-library-meta");
const librarySearchInput = document.getElementById("subject-library-search");
const libraryEl = document.getElementById("subject-library");
const openBackendButton = document.getElementById("subject-open-backend");
const assistToggle = document.getElementById("subject-assist-toggle");
const assistToggleWrap = document.getElementById("subject-assist-toggle-wrap");
const assistToggleTitle = document.getElementById("subject-assist-title");
const assistToggleHelp = document.getElementById("subject-assist-help");
const assistToggleState = document.getElementById("subject-assist-state");
const themeToggleButton = document.getElementById("theme-toggle");
const subjectSideTitleEl = document.getElementById("subject-side-title");
const subjectGuideListEl = document.getElementById("subject-guide-list");
const subjectLinksEl = document.getElementById("subject-links");
const submitButton = form?.querySelector("button[type=\"submit\"]");

const themeStorageKey = "strandspace:theme";
const pendingDraftStorageKey = "strandspace:pending-draft";

let subjects = [];
let currentSubjectId = "";
let subjectLibrary = [];
let currentSubject = null;
let latestResult = null;
let systemHealth = null;

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

function postJson(url, payload = {}) {
  return fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

function currentSubjectLabel() {
  return currentSubject?.subjectLabel ?? "Subject";
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
}

async function loadSystemHealth() {
  try {
    renderSystemHealth(await fetchJson("/api/system/health"));
  } catch (error) {
    renderSystemHealth(null);
    if (statusLineEl) {
      statusLineEl.textContent = error instanceof Error ? error.message : "Unable to load system status.";
    }
  }
}

function querySubjectId() {
  const url = new URL(window.location.href);
  return String(url.searchParams.get("subjectId") ?? "").trim();
}

function updateQueryString(subjectId = "") {
  const url = new URL(window.location.href);
  if (subjectId) {
    url.searchParams.set("subjectId", subjectId);
  } else {
    url.searchParams.delete("subjectId");
  }
  window.history.replaceState({}, "", url.toString());
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

function renderSubjectPicker() {
  if (!subjectPicker) {
    return;
  }

  const orderedSubjects = sortSubjects(subjects);
  subjectPicker.innerHTML = orderedSubjects.map((subject) => `
    <option value="${escapeHtml(subject.subjectId)}"${subject.subjectId === currentSubjectId ? " selected" : ""}>
      ${escapeHtml(subject.subjectLabel)} (${Number(subject.constructCount ?? 0)})
    </option>
  `).join("");
}

function renderSubjectChrome() {
  currentSubject = subjects.find((subject) => subject.subjectId === currentSubjectId) ?? null;
  const subjectLabel = currentSubjectLabel();
  const constructCount = Number(currentSubject?.constructCount ?? subjectLibrary.length ?? 0);

  document.title = `${subjectLabel} | Strandspace`;

  if (titleEl) {
    titleEl.textContent = `${subjectLabel} construct view`;
  }

  if (mastheadCopyEl) {
    mastheadCopyEl.textContent = constructCount
      ? `${subjectLabel} is using ${constructCount} local construct${constructCount === 1 ? "" : "s"} as its recall surface. Search locally first, or turn on AI when you want a draft proposal before saving.`
      : `${subjectLabel} does not have stored constructs yet. Use AI for a first draft or teach the subject in the backend.`;
  }

  if (subjectSideTitleEl) {
    subjectSideTitleEl.textContent = subjectLabel;
  }

  if (subjectGuideListEl) {
    subjectGuideListEl.innerHTML = `
      <li>Ask for a construct label, target, objective, steps, or notes that should already exist in ${escapeHtml(subjectLabel)}.</li>
      <li>Click a stored construct to load its title as the search phrase.</li>
      <li>Turn on AI when you want a proposed construct update or a new draft for review in the backend.</li>
    `;
  }

  if (subjectLinksEl) {
    subjectLinksEl.innerHTML = `
      <a class="ghost-action search-suggestion" href="/backend">Open backend</a>
      ${currentSubjectId === "music-engineering" ? '<a class="ghost-action search-suggestion" href="/soundspace">Open dedicated Soundspace</a>' : ""}
      <a class="ghost-action search-suggestion" href="/">Back to landing</a>
    `;
  }

  if (metaEl) {
    metaEl.textContent = constructCount
      ? `${constructCount} local construct${constructCount === 1 ? "" : "s"} ready in ${subjectLabel}`
      : `No local constructs stored yet in ${subjectLabel}`;
  }

  if (statusLineEl) {
    statusLineEl.textContent = systemHealth?.openai?.enabled
      ? `Local recall is ready for ${subjectLabel}. AI assist is available if you want a proposal draft.`
      : `Local recall is ready for ${subjectLabel}. AI assist is currently disabled.`;
  }
}

function promptCandidates() {
  if (!subjectLibrary.length) {
    return [
      `What is the setup for ${currentSubjectLabel()}?`,
      `Show the main steps for ${currentSubjectLabel()}.`,
      `What are the key notes for ${currentSubjectLabel()}?`
    ];
  }

  return subjectLibrary
    .slice(0, 5)
    .map((construct) => construct.constructLabel || construct.target || construct.objective)
    .filter(Boolean);
}

function renderPromptRow() {
  if (!promptRowEl) {
    return;
  }

  promptRowEl.innerHTML = promptCandidates().map((prompt) => `
    <button type="button" class="intent-chip" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>
  `).join("");
}

function updateAssistToggleState({ phase = "idle" } = {}) {
  const checked = Boolean(assistToggle?.checked);

  if (assistToggleWrap) {
    assistToggleWrap.classList.toggle("is-active", checked);
    assistToggleWrap.classList.toggle("is-searching", phase === "running");
  }

  if (assistToggleTitle) {
    assistToggleTitle.textContent = checked ? "AI assistant for this search" : "AI assistant for suggestions";
  }

  if (assistToggleHelp) {
    assistToggleHelp.textContent = checked
      ? "This search will ask AI for a subject-aware construct proposal before you save anything."
      : "Off by default. Turn this on when you want an AI construct proposal for this subject.";
  }

  if (assistToggleState) {
    assistToggleState.textContent = phase === "running"
      ? (checked ? "AI proposal active" : "Checking local subject memory")
      : (checked ? "AI search on" : "Local-first search");
  }
}

function getLibrarySearchQuery() {
  return String(librarySearchInput?.value ?? "").trim().toLowerCase();
}

function filterLibrary(items = subjectLibrary, query = getLibrarySearchQuery()) {
  if (!query) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [
      item.constructLabel,
      item.target,
      item.objective,
      item.notes,
      ...(item.tags ?? []),
      ...(item.strands ?? []),
      ...Object.keys(item.context ?? {}),
      ...Object.values(item.context ?? {})
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function renderLibrary(items = filterLibrary(subjectLibrary)) {
  if (!items.length) {
    libraryMetaEl.textContent = subjectLibrary.length
      ? `No constructs in ${currentSubjectLabel()} match this filter`
      : `No constructs stored in ${currentSubjectLabel()} yet`;
    libraryEl.className = "library empty";
    libraryEl.innerHTML = `<p>${escapeHtml(subjectLibrary.length ? "Try a different filter or search phrase." : `Teach the first construct for ${currentSubjectLabel()} in the backend or with AI.`)}</p>`;
    return;
  }

  libraryMetaEl.textContent = items.length === subjectLibrary.length
    ? `${items.length} construct${items.length === 1 ? "" : "s"} in ${currentSubjectLabel()}`
    : `${items.length} of ${subjectLibrary.length} constructs shown`;
  libraryEl.className = "library";
  libraryEl.innerHTML = items.map((item) => `
    <button type="button" class="library-card" data-construct-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.constructLabel ?? "Construct")}</strong>
      <span>${escapeHtml(item.target ?? item.subjectLabel ?? currentSubjectLabel())}</span>
      <small>${escapeHtml([item.objective, ...(item.tags ?? []).slice(0, 3)].filter(Boolean).join(" | "))}</small>
    </button>
  `).join("");
}

async function loadLibrary() {
  const payload = await fetchJson(`/api/subjectspace/library?subjectId=${encodeURIComponent(currentSubjectId)}`);
  subjectLibrary = Array.isArray(payload.constructs) ? payload.constructs : [];
  renderSubjectChrome();
  renderPromptRow();
  renderLibrary();
}

async function loadSubjects() {
  const payload = await fetchJson("/api/subjectspace/subjects");
  subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  const requested = querySubjectId();
  currentSubjectId = requested && subjects.some((subject) => subject.subjectId === requested)
    ? requested
    : (payload.defaultSubjectId || subjects[0]?.subjectId || "");

  renderSubjectPicker();
  updateQueryString(currentSubjectId);
}

function collectTraceList(recall = {}, keys = []) {
  for (const key of keys) {
    const value = recall?.trace?.[key] ?? recall?.support?.[key];
    if (Array.isArray(value) && value.length) {
      return value.map((item) => typeof item === "string" ? item : (item.label ?? item.token ?? item.value ?? JSON.stringify(item)));
    }
  }

  return [];
}

function renderWhyMatchedPanel(recall = {}) {
  const matchedTokens = collectTraceList(recall, ["matchedTokens", "tokenHits", "directHits"]);
  const aliasHits = collectTraceList(recall, ["aliasHits"]);
  const phraseHits = collectTraceList(recall, ["phraseHits"]);
  const excludedCues = collectTraceList(recall, ["excludedCues", "negativeCues"]);
  const nearbyCandidates = Array.isArray(recall.candidates) ? recall.candidates.slice(0, 4) : [];
  const readiness = recall.readiness ?? {};
  const routing = recall.routing ?? {};

  return `
    <section class="diff-panel">
      <div class="review-head">
        <div>
          <span class="detail-label">Why this matched</span>
          <h3>${escapeHtml(routing.label ?? routing.mode ?? "Recall routing")}</h3>
        </div>
        <span class="meta">${escapeHtml(`Confidence ${Math.round(Number(readiness.confidence ?? 0) * 100)}%`)}</span>
      </div>
      <p class="answer-detail">${escapeHtml(routing.reason ?? recall.answer ?? "Strandspace matched this construct from the local subject field.")}</p>
      <div class="answer-meta">
        <div>
          <dt>Score</dt>
          <dd>${escapeHtml(Number(readiness.matchedScore ?? 0).toFixed(1))}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>${escapeHtml(routing.mode ?? "local_recall")}</dd>
        </div>
        <div>
          <dt>Matched Ratio</dt>
          <dd>${escapeHtml(`${Math.round(Number(readiness.matchedRatio ?? 0) * 100)}%`)}</dd>
        </div>
        <div>
          <dt>Next Action</dt>
          <dd>${escapeHtml(routing.nextAction ?? "Reuse this construct or refine the question.")}</dd>
        </div>
      </div>
      ${matchedTokens.length ? `
        <div class="chip-row">
          ${matchedTokens.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
        </div>
      ` : ""}
      ${aliasHits.length ? `
        <div class="review-list">
          <strong>Alias hits</strong>
          <ul>${aliasHits.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      ${phraseHits.length ? `
        <div class="review-list">
          <strong>Phrase hits</strong>
          <ul>${phraseHits.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      ${excludedCues.length ? `
        <div class="review-list warning">
          <strong>Excluded cues</strong>
          <ul>${excludedCues.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      ${nearbyCandidates.length ? `
        <div class="review-list">
          <strong>Nearby candidates</strong>
          <ul>
            ${nearbyCandidates.map((candidate) => `<li>${escapeHtml(candidate.constructLabel ?? candidate.label ?? "Stored construct")} (${escapeHtml(Number(candidate.score ?? 0).toFixed(1))})</li>`).join("")}
          </ul>
        </div>
      ` : ""}
    </section>
  `;
}

function renderConstructDetails(construct = {}) {
  const contextEntries = Object.entries(construct.context ?? {}).filter(([, value]) => value);
  return `
    <section class="focus-panel">
      <div class="focus-head">
        <strong>${escapeHtml(construct.constructLabel ?? "Matched construct")}</strong>
        <span class="focus-subtitle">${escapeHtml(construct.target ?? currentSubjectLabel())}</span>
      </div>
      <p class="answer-summary">${escapeHtml(construct.objective ?? "Stored construct objective")}</p>
      ${contextEntries.length ? `
        <div class="setup-grid">
          ${contextEntries.slice(0, 6).map(([key, value]) => `
            <article>
              <strong>${escapeHtml(key)}</strong>
              <p>${escapeHtml(value)}</p>
            </article>
          `).join("")}
        </div>
      ` : ""}
      ${Array.isArray(construct.steps) && construct.steps.length ? `
        <div class="review-list">
          <strong>Stored steps</strong>
          <ul>${construct.steps.slice(0, 8).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      ${construct.notes ? `<p class="answer-detail">${escapeHtml(construct.notes)}</p>` : ""}
      ${Array.isArray(construct.tags) && construct.tags.length ? `
        <div class="chip-row">
          ${construct.tags.slice(0, 10).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
        </div>
      ` : ""}
      <div class="review-actions">
        <button type="button" class="primary-action subject-backend-button">Review in backend</button>
      </div>
    </section>
  `;
}

function renderUnresolvedResult(payload = null) {
  const recall = payload?.recall ?? {};
  const routing = recall.routing ?? {};
  answerEl.className = "answer-card";
  answerEl.innerHTML = `
    <div class="answer-topline">
      <div class="answer-badges">
        <span class="answer-source">Local recall</span>
      </div>
      <span class="meta">${escapeHtml(currentSubjectLabel())}</span>
    </div>
    <p class="answer-summary">${escapeHtml(payload?.answer ?? "This search needs more information.")}</p>
    <p class="answer-callout"><strong>Next:</strong> ${escapeHtml(routing.nextAction ?? "Add one more concrete detail and search again.")}</p>
    ${renderWhyMatchedPanel(recall)}
  `;
}

function renderAssistResult(payload = null) {
  const construct = payload?.suggestedConstruct ?? null;
  const assist = payload?.assist ?? {};
  if (!construct) {
    renderUnresolvedResult({
      answer: "AI assist did not return a construct proposal.",
      recall: payload?.recall ?? {}
    });
    return;
  }

  answerEl.className = "answer-card";
  answerEl.innerHTML = `
    <div class="answer-topline">
      <div class="answer-badges">
        <span class="answer-source">AI construct proposal</span>
        <span class="answer-badge assist-used">AI Assist used</span>
      </div>
      <span class="meta">${escapeHtml(currentSubjectLabel())}</span>
    </div>
    <p class="answer-summary">${escapeHtml(assist.rationale ?? "AI drafted a subject-aware construct proposal for review before saving.")}</p>
    <div class="answer-meta">
      <div>
        <dt>Action</dt>
        <dd>${escapeHtml(assist.apiAction ?? "draft")}</dd>
      </div>
      <div>
        <dt>Validation Focus</dt>
        <dd>${escapeHtml(Array.isArray(assist.validationFocus) ? assist.validationFocus.join(", ") : "General review")}</dd>
      </div>
      <div>
        <dt>Should Learn</dt>
        <dd>${escapeHtml(assist.shouldLearn ? "yes" : "review first")}</dd>
      </div>
      <div>
        <dt>Subject</dt>
        <dd>${escapeHtml(construct.subjectLabel ?? currentSubjectLabel())}</dd>
      </div>
    </div>
    ${renderConstructDetails(construct)}
    ${renderWhyMatchedPanel(payload?.recall ?? {})}
  `;
}

function renderLocalResult(payload = null) {
  const construct = payload?.construct ?? null;
  if (!construct) {
    renderUnresolvedResult(payload);
    return;
  }

  answerEl.className = "answer-card";
  answerEl.innerHTML = `
    <div class="answer-topline">
      <div class="answer-badges">
        <span class="answer-source">Recalled from Strandspace</span>
      </div>
      <span class="meta">${escapeHtml(currentSubjectLabel())}</span>
    </div>
    <p class="answer-summary">${escapeHtml(payload?.answer ?? "Local recall found a stored construct.")}</p>
    ${renderConstructDetails(construct)}
    ${renderWhyMatchedPanel(payload?.recall ?? {})}
  `;
}

function renderAnswer(payload = null) {
  latestResult = payload;
  if (!payload) {
    answerEl.className = "answer-card empty";
    answerEl.innerHTML = `<p>Pick a subject and run a question to see the matched construct and why it won.</p>`;
    return;
  }

  if (payload.source === "openai") {
    renderAssistResult(payload);
    return;
  }

  if (payload.source === "unresolved" || !payload.construct) {
    renderUnresolvedResult(payload);
    return;
  }

  renderLocalResult(payload);
}

async function searchSubject(question, { useAssist = false } = {}) {
  if (useAssist) {
    try {
      return await postJson("/api/subjectspace/assist", {
        subjectId: currentSubjectId,
        question
      });
    } catch (error) {
      if (statusLineEl) {
        statusLineEl.textContent = `${error instanceof Error ? error.message : "AI assist failed."} Falling back to local recall.`;
      }
      return postJson("/api/subjectspace/answer", {
        subjectId: currentSubjectId,
        question
      });
    }
  }

  return postJson("/api/subjectspace/answer", {
    subjectId: currentSubjectId,
    question
  });
}

async function handleSearch(event) {
  event?.preventDefault();
  const question = String(questionInput?.value ?? "").trim();
  if (!question) {
    metaEl.textContent = "Enter a question for this subject.";
    renderAnswer(null);
    return;
  }

  const useAssist = Boolean(assistToggle?.checked);
  metaEl.textContent = useAssist ? "Running AI subject proposal..." : "Checking local subject memory...";
  updateAssistToggleState({ phase: "running" });
  setButtonBusy(submitButton, true, useAssist ? "Searching with AI..." : "Searching...");

  try {
    const payload = await searchSubject(question, { useAssist });
    metaEl.textContent = payload.source === "openai"
      ? `AI proposal ready for ${currentSubjectLabel()}`
      : payload.source === "unresolved"
        ? `Need one more detail for ${currentSubjectLabel()}`
        : `Local recall hit for ${currentSubjectLabel()}`;
    renderAnswer(payload);
  } catch (error) {
    metaEl.textContent = error instanceof Error ? error.message : "Unable to search this subject.";
    answerEl.className = "answer-card empty";
    answerEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : "Unable to search this subject.")}</p>`;
  } finally {
    setButtonBusy(submitButton, false);
    updateAssistToggleState();
  }
}

form?.addEventListener("submit", handleSearch);

clearButton?.addEventListener("click", () => {
  questionInput.value = "";
  metaEl.textContent = currentSubject ? `Ready in ${currentSubjectLabel()}` : "Ready";
  renderAnswer(null);
  updateAssistToggleState();
  questionInput.focus();
});

themeToggleButton?.addEventListener("click", toggleTheme);

subjectPicker?.addEventListener("change", async () => {
  currentSubjectId = String(subjectPicker.value ?? "").trim();
  updateQueryString(currentSubjectId);
  metaEl.textContent = `Loading ${currentSubjectLabel()}...`;
  renderAnswer(null);
  await loadLibrary();
});

librarySearchInput?.addEventListener("input", () => {
  renderLibrary();
});

promptRowEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-prompt]") : null;
  if (!button) {
    return;
  }

  questionInput.value = button.getAttribute("data-prompt") ?? "";
  questionInput.focus();
});

libraryEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-construct-id]") : null;
  if (!button) {
    return;
  }

  const construct = subjectLibrary.find((item) => item.id === button.getAttribute("data-construct-id"));
  if (!construct) {
    return;
  }

  questionInput.value = construct.constructLabel ?? construct.target ?? "Selected construct";
  metaEl.textContent = "Construct title loaded as the search";
  questionInput.focus();
});

answerEl?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest(".subject-backend-button") : null;
  if (!button) {
    return;
  }

  const construct = latestResult?.source === "openai"
    ? latestResult?.suggestedConstruct
    : latestResult?.construct;

  if (!construct) {
    return;
  }

  writePendingDraft(construct);
  window.location.href = "/backend";
});

openBackendButton?.addEventListener("click", () => {
  const construct = latestResult?.source === "openai"
    ? latestResult?.suggestedConstruct
    : latestResult?.construct;

  if (construct) {
    writePendingDraft(construct);
  }
  window.location.href = "/backend";
});

assistToggle?.addEventListener("change", () => {
  updateAssistToggleState();
});

applyTheme(readStoredTheme() || "light");
if (assistToggle) {
  assistToggle.checked = false;
}
updateAssistToggleState();
renderAnswer(null);

Promise.all([loadSystemHealth(), loadSubjects()])
  .then(() => loadLibrary())
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unable to load this subject page.";
    metaEl.textContent = message;
    statusLineEl.textContent = message;
    renderAnswer({
      source: "unresolved",
      answer: message,
      recall: {
        routing: {
          label: "Page load failed",
          nextAction: "Return to the landing page or backend and try again."
        },
        readiness: {
          confidence: 0,
          matchedScore: 0,
          matchedRatio: 0
        },
        candidates: []
      }
    });
  });
