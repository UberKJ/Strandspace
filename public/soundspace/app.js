const form = document.getElementById("soundspace-form");
const questionInput = document.getElementById("soundspace-question");
const clearButton = document.getElementById("soundspace-clear");
const metaEl = document.getElementById("soundspace-meta");
const answerEl = document.getElementById("soundspace-answer");
const libraryMetaEl = document.getElementById("soundspace-library-meta");
const librarySearchInput = document.getElementById("soundspace-library-search");
const libraryEl = document.getElementById("soundspace-library");
const statusBadgeEl = document.getElementById("soundspace-status-badge");
const statusLineEl = document.getElementById("soundspace-status-line");
const themeToggleButton = document.getElementById("theme-toggle");
const resetExamplesButton = document.getElementById("soundspace-reset-examples");
const submitButton = form?.querySelector("button[type=\"submit\"]");
const quickQueryButtons = Array.from(document.querySelectorAll("[data-query]"));
const themeStorageKey = "strandspace:theme";

let soundspaceLibrary = [];
let latestProposal = null;
let systemHealth = null;

function escapeHtml(value) {
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

function titleCase(value = "") {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function focusLabel(key = "") {
  const labels = {
    toneMatch: "ToneMatch",
    system: "System",
    gain: "Gain",
    eq: "EQ",
    fx: "FX",
    monitor: "Monitor",
    placement: "Placement",
    notes: "Notes"
  };

  return labels[key] ?? titleCase(key);
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
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

  if (statusLineEl) {
    statusLineEl.textContent = health
      ? (health.openai?.enabled
          ? `Assist is available on ${health.openai.model}. Timeout ${health.openai.timeoutMs}ms.`
          : "OpenAI assist is off, so Soundspace is running in local-only mode.")
      : "Unable to load system status.";
  }
}

async function loadSystemHealth() {
  try {
    const response = await fetch("/api/system/health");
    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }
    renderSystemHealth(await response.json());
  } catch (error) {
    renderSystemHealth(null);
    if (statusLineEl) {
      statusLineEl.textContent = error instanceof Error ? error.message : "Unable to load system status.";
    }
  }
}

function buildAskedForTags(recall = {}) {
  const parsed = recall.parsed ?? {};
  const tags = [];

  for (const key of recall.focusKeys ?? []) {
    tags.push(focusLabel(key));
  }
  if (parsed.sourceModel) {
    tags.push(parsed.sourceModel);
  }
  if (parsed.presetName) {
    tags.push(parsed.presetName);
  }
  if (parsed.presetCategory && !parsed.presetName) {
    tags.push(parsed.presetCategory);
  }
  if (parsed.eventType) {
    tags.push(titleCase(parsed.eventType));
  }
  if (parsed.venueSize) {
    tags.push(titleCase(parsed.venueSize));
  }

  return Array.from(new Set(tags.filter(Boolean))).slice(0, 8);
}

function buildFocusedParagraph(focusedSetup = {}) {
  const sections = Object.entries(focusedSetup)
    .filter(([, value]) => value)
    .map(([label, value]) => `${focusLabel(label)}: ${value}`);

  return sections.join(" ");
}

function renderMemoryDrawer(linkedConstructs = [], construct = null, recall = {}) {
  if (!construct && !linkedConstructs.length) {
    return "";
  }

  const subjectConstructs = Array.isArray(linkedConstructs) ? linkedConstructs.filter(Boolean) : [];

  const memoryItems = construct ? [
    ["Device", [construct.deviceBrand, construct.deviceModel].filter(Boolean).join(" ") || "n/a"],
    ["Source", [construct.sourceBrand, construct.sourceModel, construct.sourceType].filter(Boolean).join(" ") || "n/a"],
    ["Preset", [construct.presetCategory, construct.presetName].filter(Boolean).join(" > ") || "n/a"],
    ["Goal", construct.goal ?? "n/a"],
    ["Event", construct.eventType ?? "n/a"],
    ["Venue", construct.venueSize ?? "n/a"],
    ["Speaker Config", construct.speakerConfig ?? "n/a"],
    ["Recommendation", recall.recommendation ?? "n/a"]
  ]
    .filter(([, value]) => value && value !== "n/a") : [];

  const setupEntries = Object.entries(construct?.setup ?? {}).filter(([, value]) => value);
  const candidates = Array.isArray(recall.candidates) ? recall.candidates.slice(0, 4) : [];

  return `
    <details class="memory-drawer">
      <summary>
        <div class="memory-summary">
          <span class="memory-label">${escapeHtml(subjectConstructs.length ? "Open Shared Construct Memory" : latestProposal ? "Open Proposed Construct" : "Open Stored Construct")}</span>
          <span>${escapeHtml(subjectConstructs.length ? "Reveal the Music Engineering construct view" : "Reveal full memory")}</span>
        </div>
      </summary>
      ${subjectConstructs.length ? `
        <div class="linked-list">
          ${subjectConstructs.map((item) => `
            <article class="linked-card">
              <strong>${escapeHtml(item.constructLabel ?? item.name ?? "Music Engineering construct")}</strong>
              <p>${escapeHtml(item.target ?? item.objective ?? item.subjectLabel ?? "Shared construct memory")}</p>
              ${Array.isArray(item.steps) && item.steps.length ? `
                <div class="review-list">
                  <strong>Stored steps</strong>
                  <ul>
                    ${item.steps.slice(0, 6).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
                  </ul>
                </div>
              ` : ""}
              ${Array.isArray(item.tags) && item.tags.length ? `
                <div class="chip-row">
                  ${item.tags.slice(0, 8).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
                </div>
              ` : ""}
            </article>
          `).join("")}
        </div>
      ` : ""}
      <div class="memory-grid">
        ${memoryItems.map(([label, value]) => `
          <div class="memory-item">
            <span class="detail-label">${escapeHtml(label)}</span>
            <p>${escapeHtml(value)}</p>
          </div>
        `).join("")}
      </div>
      ${setupEntries.length ? `
        <div class="focus-panel">
          <div class="focus-head">
            <strong>${escapeHtml(latestProposal ? "Full Proposed Setup" : "Full Stored Setup")}</strong>
            <span class="focus-subtitle">${escapeHtml(`${setupEntries.length} memory sections`)}</span>
          </div>
          <div class="setup-grid">
            ${setupEntries.map(([label, value]) => `
              <article>
                <strong>${escapeHtml(focusLabel(label))}</strong>
                <p>${escapeHtml(value)}</p>
              </article>
            `).join("")}
          </div>
        </div>
      ` : ""}
      ${Array.isArray(construct.strands) && construct.strands.length ? `
        <div class="chip-row">
          ${construct.strands.slice(0, 12).map((strand) => `<span class="chip">${escapeHtml(strand)}</span>`).join("")}
        </div>
      ` : ""}
      ${candidates.length ? `
        <div class="focus-panel">
          <div class="focus-head">
            <strong>Nearby Matches</strong>
            <span class="focus-subtitle">Top recall candidates</span>
          </div>
          <ul class="candidate-list">
            ${candidates.map((candidate) => `
              <li>
                <span>${escapeHtml(candidate.name ?? "Stored construct")}</span>
                <span>${escapeHtml(Number(candidate.score ?? 0).toFixed(1))}</span>
              </li>
            `).join("")}
          </ul>
        </div>
      ` : ""}
    </details>
  `;
}

function renderReviewPanel(review = null) {
  if (!review) {
    return "";
  }

  const changeSummary = Array.isArray(review.changeSummary) ? review.changeSummary : [];
  const assumptions = Array.isArray(review.assumptions) ? review.assumptions : [];
  const missingInformation = Array.isArray(review.missingInformation) ? review.missingInformation : [];

  return `
    <section class="review-panel ${review.canLearn ? "" : "needs-detail"}">
      <div class="review-head">
        <div>
          <span class="detail-label">${escapeHtml(review.sourceLabel ?? "Proposal")}</span>
          <h3>${escapeHtml(review.title ?? "Review proposal")}</h3>
        </div>
        <span class="meta">${escapeHtml(review.canLearn ? "Ready to add" : "Needs more detail")}</span>
      </div>
      <p class="answer-detail">${escapeHtml(review.nextAction ?? "")}</p>
      ${changeSummary.length ? `
        <div class="review-list">
          <strong>What changes</strong>
          <ul>
            ${changeSummary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${assumptions.length ? `
        <div class="review-list">
          <strong>Assumptions</strong>
          <ul>
            ${assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${missingInformation.length ? `
        <div class="review-list warning">
          <strong>Missing information</strong>
          <ul>
            ${missingInformation.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      <div class="review-actions">
        ${review.canLearn ? `<button type="button" class="primary-action review-action" data-review-action="store">Add To Strandspace</button>` : ""}
        <button type="button" class="ghost-action review-action" data-review-action="refine">Refine Question</button>
      </div>
    </section>
  `;
}

function renderSearchGuidance(guidance = null) {
  if (!guidance) {
    return "";
  }

  const followUpQuestions = Array.isArray(guidance.followUpQuestions) ? guidance.followUpQuestions : [];
  const editSuggestions = Array.isArray(guidance.editSuggestions) ? guidance.editSuggestions : [];
  const suggestionQueries = Array.isArray(guidance.suggestionQueries) ? guidance.suggestionQueries : [];
  const nearbyCandidates = Array.isArray(guidance.nearbyCandidates) ? guidance.nearbyCandidates : [];

  return `
    <section class="review-panel needs-detail">
      <div class="review-head">
        <div>
          <span class="detail-label">Search guidance</span>
          <h3>${escapeHtml(guidance.title ?? "Refine the search")}</h3>
        </div>
        <span class="meta">Need one more detail</span>
      </div>
      <p class="answer-detail">${escapeHtml(guidance.prompt ?? "")}</p>
      ${followUpQuestions.length ? `
        <div class="review-list warning">
          <strong>Questions to answer</strong>
          <ul>
            ${followUpQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${editSuggestions.length ? `
        <div class="review-list">
          <strong>Ways to edit the search</strong>
          <ul>
            ${editSuggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${suggestionQueries.length ? `
        <div class="focus-panel">
          <div class="focus-head">
            <strong>Suggested searches</strong>
            <span class="focus-subtitle">Click one to rewrite the search</span>
          </div>
          <div class="chip-row">
            ${suggestionQueries.map((query) => `<button type="button" class="ghost-action search-suggestion" data-suggested-query="${escapeAttribute(query)}">${escapeHtml(query)}</button>`).join("")}
          </div>
        </div>
      ` : ""}
      ${nearbyCandidates.length ? `
        <div class="review-list">
          <strong>Nearby stored memory</strong>
          <ul>
            ${nearbyCandidates.map((candidate) => `<li><strong>${escapeHtml(candidate.name ?? candidate.label ?? "Stored construct")}</strong>${candidate.reason ? ` - ${escapeHtml(candidate.reason)}` : ""}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
    </section>
  `;
}

function renderAnswer(payload = null) {
  if (!payload) {
    latestProposal = null;
    answerEl.className = "answer-card empty";
    answerEl.innerHTML = "<p>Ask a question to see a focused result instead of the whole memory construct.</p>";
    return;
  }

  latestProposal = payload.needsReview ? payload : null;
  const construct = payload.construct ?? null;
  const recall = payload.recall ?? {};
  const review = payload.review ?? null;
  const clarification = recall.clarification ?? null;
  const searchGuidance = recall.searchGuidance ?? null;
  const focusedSetup = recall.focusedSetup && Object.keys(recall.focusedSetup).length
    ? recall.focusedSetup
    : {};
  const focusedParagraph = buildFocusedParagraph(focusedSetup);
  const askedForTags = buildAskedForTags(recall);
  const sourceLabel = payload.source === "strandspace"
    ? "Recalled from Strandspace"
    : payload.source === "search-guidance"
      ? "Search needs one more detail"
    : payload.source === "openai-generated-and-stored"
      ? "Generated, refined, and stored"
      : payload.source === "openai-proposal"
        ? "OpenAI research proposal"
        : payload.source === "generated-proposal"
          ? "Proposal awaiting review"
          : "Generated and stored";

  answerEl.className = "answer-card";
  answerEl.innerHTML = `
    <div class="answer-topline">
      <span class="answer-source">${escapeHtml(sourceLabel)}</span>
      <span class="meta">${escapeHtml(construct?.name ?? "Focused result")}</span>
    </div>
    <p class="answer-summary">${escapeHtml(payload.answer ?? "No answer returned.")}</p>
    ${askedForTags.length ? `
      <div class="asked-for">
        ${askedForTags.map((tag) => `<span class="asked-tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    ` : ""}
    ${clarification?.prompt ? `<p class="answer-callout"><strong>Need detail:</strong> ${escapeHtml(clarification.prompt)}</p>` : ""}
    ${focusedParagraph ? `<p class="answer-detail"><strong>Asked return:</strong> ${escapeHtml(focusedParagraph)}</p>` : ""}
    ${renderSearchGuidance(searchGuidance)}
    ${renderReviewPanel(review)}
    <dl class="answer-meta">
      <div><dt>Device</dt><dd>${escapeHtml([construct?.deviceBrand, construct?.deviceModel].filter(Boolean).join(" ") || "n/a")}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml([construct?.sourceBrand, construct?.sourceModel, construct?.sourceType].filter(Boolean).join(" ") || "n/a")}</dd></div>
      <div><dt>Preset</dt><dd>${escapeHtml([construct?.presetCategory, construct?.presetName].filter(Boolean).join(" > ") || "n/a")}</dd></div>
      <div><dt>Event</dt><dd>${escapeHtml(construct?.eventType ?? "n/a")}</dd></div>
      <div><dt>Venue</dt><dd>${escapeHtml(construct?.venueSize ?? "n/a")}</dd></div>
      <div><dt>Ready</dt><dd>${review ? (review.canLearn ? "reviewed draft" : "needs detail") : (recall.ready ? "yes" : "no")}</dd></div>
    </dl>
    ${renderMemoryDrawer(payload.linkedSubjectConstructs ?? [], construct, recall)}
  `;
}

function getLibrarySearchQuery() {
  return String(librarySearchInput?.value ?? "").trim().toLowerCase();
}

function filterLibrary(items = soundspaceLibrary, query = getLibrarySearchQuery()) {
  if (!query) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [
      item.constructLabel,
      item.name,
      item.subjectLabel,
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

function renderLibrary(items = filterLibrary(soundspaceLibrary)) {
  if (!items.length) {
    libraryMetaEl.textContent = soundspaceLibrary.length ? "No constructs match this search" : "No Music Engineering constructs stored";
    libraryEl.className = "library empty";
    libraryEl.innerHTML = `<p>${escapeHtml(soundspaceLibrary.length ? "Try a different construct, target, tag, or strand search." : "No Music Engineering constructs stored yet.")}</p>`;
    return;
  }

  libraryMetaEl.textContent = items.length === soundspaceLibrary.length
    ? `${items.length} Music Engineering constructs`
    : `${items.length} of ${soundspaceLibrary.length} constructs shown`;
  libraryEl.className = "library";
  libraryEl.innerHTML = items
    .map((item) => `
      <button type="button" class="library-card" data-soundspace-id="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.constructLabel ?? item.name ?? "Construct")}</strong>
        <span>${escapeHtml(item.target ?? item.subjectLabel ?? "Music Engineering construct")}</span>
        <small>${escapeHtml([item.objective, ...(item.tags ?? []).slice(0, 3)].filter(Boolean).join(" | "))}</small>
      </button>
    `)
    .join("");
}

async function loadLibrary() {
  libraryMetaEl.textContent = "Loading Music Engineering constructs...";
  try {
    const response = await fetch("/api/subjectspace/library?subjectId=music-engineering");
    if (!response.ok) {
      throw new Error(`Music Engineering library failed with ${response.status}`);
    }
    const payload = await response.json();
    soundspaceLibrary = payload.constructs ?? [];
    renderLibrary();
  } catch (error) {
    libraryMetaEl.textContent = "Music Engineering unavailable";
    libraryEl.className = "library empty";
    libraryEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : "Unable to load Music Engineering constructs.")}</p>`;
  }
}

async function fetchAnswer(question, { reviewBeforeStore = true } = {}) {
  const response = await fetch("/api/soundspace/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question, reviewBeforeStore })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      [payload.error ?? `Soundspace request failed with ${response.status}`, payload.detail ?? "", payload.code ? `Code: ${payload.code}` : ""]
        .filter(Boolean)
        .join(" ")
    );
  }

  return response.json();
}

async function resetWithExamples() {
  setButtonBusy(resetExamplesButton, true, "Resetting...");

  try {
    const response = await fetch("/api/system/reset-examples", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to reset the example constructs.");
    }

    latestProposal = null;
    metaEl.textContent = "Examples restored";
    questionInput.value = "";
    renderAnswer(null);
    await loadLibrary();
  } catch (error) {
    metaEl.textContent = error instanceof Error ? error.message : "Unable to reset the example constructs.";
  } finally {
    setButtonBusy(resetExamplesButton, false);
  }
}

async function askQuestion(event) {
  event?.preventDefault();
  const question = questionInput.value.trim();

  if (!question) {
    metaEl.textContent = "Enter a search";
    renderAnswer(null);
    return;
  }

  metaEl.textContent = "Searching...";
  setButtonBusy(submitButton, true, "Searching...");
  try {
    const payload = await fetchAnswer(question, { reviewBeforeStore: true });
    metaEl.textContent = payload.source === "search-guidance"
      ? "Need one more detail"
      : payload.needsReview
      ? `${payload.review?.canLearn ? "Proposal ready" : "Need detail"} | ${payload.construct?.deviceModel ?? "Soundspace"}`
      : `${payload.source === "strandspace" ? "Recall hit" : "Learned result"} | ${payload.construct?.deviceModel ?? "Soundspace"}`;
    try {
      renderAnswer(payload);
    } catch (renderError) {
      answerEl.className = "answer-card";
      answerEl.innerHTML = `
        <div class="answer-topline">
          <span class="answer-source">${escapeHtml(payload.source === "strandspace" ? "Recalled from Strandspace" : "Soundspace result")}</span>
          <span class="meta">${escapeHtml(payload.construct?.name ?? "Focused result")}</span>
        </div>
        <p class="answer-summary">${escapeHtml(payload.answer ?? "No answer returned.")}</p>
      `;
      metaEl.textContent = "Rendered with fallback";
      console.error("Soundspace render fallback used:", renderError);
    }
    try {
      await loadLibrary();
    } catch (libraryError) {
      libraryMetaEl.textContent = "Music Engineering library unavailable";
      console.error("Soundspace library refresh failed after a successful answer:", libraryError);
    }
  } catch (error) {
    metaEl.textContent = error instanceof Error ? error.message : "Error";
    answerEl.className = "answer-card empty";
    answerEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : "Unable to answer that sound question.")}</p>`;
  } finally {
    setButtonBusy(submitButton, false);
  }
}

function seedQuery(value = "") {
  questionInput.value = value;
  questionInput.focus();
}

form?.addEventListener("submit", askQuestion);

clearButton?.addEventListener("click", () => {
  latestProposal = null;
  questionInput.value = "";
  metaEl.textContent = "Ready";
  renderAnswer(null);
  questionInput.focus();
});

quickQueryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    seedQuery(button.getAttribute("data-query") ?? "");
  });
});

libraryEl?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-soundspace-id]") : null;
  if (!target) {
    return;
  }

  const constructId = target.getAttribute("data-soundspace-id");
  const construct = soundspaceLibrary.find((item) => item.id === constructId);
  if (!construct) {
    return;
  }

  questionInput.value = construct.target
    ? `What is the setup for ${construct.target}?`
    : `Recall ${construct.constructLabel ?? construct.name ?? "this Music Engineering construct"}.`;
  questionInput.focus();
});

librarySearchInput?.addEventListener("input", () => {
  renderLibrary();
});

answerEl?.addEventListener("click", async (event) => {
  const suggestionTarget = event.target instanceof Element ? event.target.closest("[data-suggested-query]") : null;
  if (suggestionTarget) {
    questionInput.value = suggestionTarget.getAttribute("data-suggested-query") ?? "";
    metaEl.textContent = "Search updated with a suggested refinement";
    questionInput.focus();
    return;
  }

  const actionTarget = event.target instanceof Element ? event.target.closest("[data-review-action]") : null;
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.getAttribute("data-review-action");
  if (action === "refine") {
    metaEl.textContent = "Add the missing detail and search again";
    questionInput.focus();
    return;
  }

  if (action !== "store" || !latestProposal?.construct) {
    return;
  }

  const proposal = latestProposal;
  metaEl.textContent = "Adding reviewed construct to Strandspace...";

  try {
    const response = await fetch("/api/soundspace/learn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...proposal.construct,
        question: proposal.question,
        provenance: {
          ...(proposal.construct.provenance ?? {}),
          source: proposal.source ?? "soundspace-review",
          learnedFromQuestion: proposal.question
        }
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? `Unable to store proposal (${response.status})`);
    }

    await response.json();
    latestProposal = null;
    await loadLibrary();
    const refreshed = await fetchAnswer(questionInput.value.trim() || proposal.question || "", {
      reviewBeforeStore: true
    });
    metaEl.textContent = "Stored in Strandspace and mirrored into Music Engineering";
    renderAnswer(refreshed);
  } catch (error) {
    metaEl.textContent = error instanceof Error ? error.message : "Unable to store proposal.";
  }
});

resetExamplesButton?.addEventListener("click", () => {
  void resetWithExamples();
});

themeToggleButton?.addEventListener("click", toggleTheme);

applyTheme(readStoredTheme() || "light");
void loadSystemHealth();
void loadLibrary();
