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
const assistToggle = document.getElementById("soundspace-assist-toggle");
const assistToggleWrap = document.getElementById("soundspace-assist-toggle-wrap");
const assistToggleTitle = document.getElementById("soundspace-assist-title");
const assistToggleHelp = document.getElementById("soundspace-assist-help");
const assistToggleState = document.getElementById("soundspace-assist-state");
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

function normalizeQuery(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function analyzeAssistIntent(question = "") {
  const normalized = normalizeQuery(question);
  if (!normalized) {
    return {
      recommended: false,
      reason: "Off by default. Turn this on when you want AI to draft, validate, or expand beyond local recall.",
      stateLabel: "Local-first search"
    };
  }

  const wantsDetailedWalkthrough = /\b(step by step|every setting|exact value|exact values|exact clock|clock positions|maximum gain before feedback|no edge of feedback)\b/.test(normalized);
  const wantsRigReset = /\b(reset|gain staging reset|whole rig|from the mic capsules to the speakers|from the capsules to the speakers)\b/.test(normalized);
  const mentionsNewOrSpecificModel = /\b(zlx ?12p ?g2|zlx ?8p ?g2|l1 pro ?8|l1 pro ?16|l1 pro ?32|sub ?2|mdx ?2600|wm333|sm58|beta 58a|sm57)\b/.test(normalized);
  const mentionsSpeakerBuild = /\b(front of house|foh|speaker|speakers|main|mains)\b/.test(normalized);
  const mentionsManyDevices = /\b(my gear includes|receivers|monitors|compressor|compressors|mixer|and a|and two|and 2|pair)\b/.test(normalized);
  const recommended = wantsDetailedWalkthrough || wantsRigReset || (mentionsNewOrSpecificModel && mentionsSpeakerBuild) || mentionsManyDevices;

  if (wantsDetailedWalkthrough || wantsRigReset) {
    return {
      recommended,
      reason: "Recommended here because this looks like a full reset or exact-value walkthrough.",
      stateLabel: "AI recommended"
    };
  }

  if (mentionsNewOrSpecificModel && mentionsSpeakerBuild) {
    return {
      recommended,
      reason: "Recommended here because you named a specific speaker model that may need a draft-and-review path.",
      stateLabel: "AI recommended"
    };
  }

  if (mentionsManyDevices) {
    return {
      recommended,
      reason: "Recommended here because the query looks like a multi-device rig instead of a single local recall.",
      stateLabel: "AI recommended"
    };
  }

  return {
    recommended: false,
    reason: "Off by default. When checked, this search goes straight to the AI suggestion path instead of stopping at local recall.",
    stateLabel: "Local-first search"
  };
}

function syncSubmitButtonLabel(label = "Search Memory") {
  if (!submitButton || submitButton.disabled) {
    return;
  }

  submitButton.textContent = label;
  submitButton.dataset.defaultLabel = label;
}

function updateAssistToggleState({ phase = "idle" } = {}) {
  const checked = Boolean(assistToggle?.checked);
  const analysis = analyzeAssistIntent(questionInput?.value ?? "");

  if (assistToggleWrap) {
    assistToggleWrap.classList.toggle("is-active", checked);
    assistToggleWrap.classList.toggle("is-recommended", analysis.recommended && !checked);
    assistToggleWrap.classList.toggle("is-searching", phase === "running");
  }

  if (assistToggleTitle) {
    assistToggleTitle.textContent = checked
      ? "AI assistant for this search"
      : analysis.recommended
        ? "AI assistant recommended"
        : "AI assistant for suggestions";
  }

  if (assistToggleHelp) {
    assistToggleHelp.textContent = checked
      ? "This click will force the AI suggestion path first, then stop at review before anything is saved."
      : analysis.reason;
  }

  if (assistToggleState) {
    assistToggleState.textContent = phase === "running"
      ? (checked ? "AI search active" : "Checking local memory")
      : (checked ? "AI search on" : analysis.stateLabel);
  }

  syncSubmitButtonLabel(checked ? "Search with AI" : "Search Memory");
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

function buildFocusedFlowItems(focusedSetup = {}) {
  return Object.entries(focusedSetup)
    .filter(([, value]) => value)
    .map(([label, value]) => ({
      label: focusLabel(label),
      value: String(value)
    }));
}

function isAssistPayload(payload = null) {
  return Boolean(payload && String(payload.source ?? "").includes("openai"));
}

function buildFollowUpQueries(payload = null) {
  if (!payload) {
    return [];
  }

  const review = payload.review ?? {};
  const parsed = review.parsed ?? payload.recall?.parsed ?? {};
  const construct = payload.construct ?? {};
  const recognizedGear = Array.isArray(parsed.recognizedGear) ? parsed.recognizedGear : [];
  const mixerLabel = [construct.deviceBrand, construct.deviceModel].filter(Boolean).join(" ") || parsed.deviceModel || "this mixer";
  const showType = parsed.eventType ? titleCase(parsed.eventType) : "live show";
  const queries = [];
  const seen = new Set();

  const addQuery = (label, query) => {
    const normalized = String(query ?? "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    queries.push({ label, query: normalized });
  };

  addQuery(
    "Channel-by-channel reset",
    `Break the ${mixerLabel} ${showType} reset into a strict channel-by-channel checklist with mute order, gain order, and final verification steps.`
  );

  for (const item of recognizedGear) {
    const label = [item.brand, item.model].filter(Boolean).join(" ") || item.model || item.type || "device";
    if (item.type === "wireless_receiver") {
      addQuery(
        `${label} receiver levels`,
        `For the ${label}, what exact output level, mute order, and handoff into the ${mixerLabel} should I use before compression for this karaoke rig?`
      );
    } else if (item.type === "dynamics_processor") {
      addQuery(
        `${label} compressor settings`,
        `For the ${label}, give me exact threshold, ratio, attack, release, gate, and output starting points for clean karaoke vocals in this reset.`
      );
    } else if (item.type === "monitor_speaker") {
      addQuery(
        `${label} monitor ring-out`,
        `How should I ring out the ${label} monitors after the main karaoke reset so I get maximum gain before feedback without harsh vocal tone?`
      );
    } else if (item.type === "speaker_system") {
      addQuery(
        `${label} main output level`,
        `After the mixer reset, what exact master level starting point and placement checks should I use on the ${label} mains for clean karaoke vocals?`
      );
    }
  }

  return queries.slice(0, 4);
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
    <details class="memory-drawer"${subjectConstructs.length ? " open" : ""}>
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
          <h3>${escapeHtml(review.title ?? (review.canLearn ? "Commit To Construct" : "Need More Information"))}</h3>
        </div>
        <span class="meta">${escapeHtml(review.canLearn ? "Ready to review and add" : "Need more information")}</span>
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
          <strong>Need more information</strong>
          <ul>
            ${missingInformation.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      <div class="review-actions">
        ${review.canLearn ? `<button type="button" class="primary-action review-action" data-review-action="store">Commit To Construct</button>` : ""}
        <button type="button" class="ghost-action review-action" data-review-action="refine">Refine Question</button>
      </div>
    </section>
  `;
}

function renderReviewDiffPanel(review = null) {
  const diff = review?.diff ?? null;
  const entries = Array.isArray(diff?.entries) ? diff.entries : [];
  if (!diff) {
    return "";
  }

  return `
    <section class="diff-panel ${diff.hasBase ? "" : "new-memory"}">
      <div class="review-head">
        <div>
          <span class="detail-label">${escapeHtml(diff.hasBase ? "Review diff" : "New memory preview")}</span>
          <h3>${escapeHtml(diff.hasBase ? "Stored Memory Vs Proposal" : "What This Proposal Would Add")}</h3>
        </div>
        <span class="meta">${escapeHtml(diff.hasBase ? `${entries.length} key differences` : "No stored base")}</span>
      </div>
      <p class="answer-detail">${escapeHtml(diff.summary ?? "")}</p>
      <div class="chip-row">
        <span class="chip">${escapeHtml(`Stored: ${diff.baseLabel ?? "Closest stored memory"}`)}</span>
        <span class="chip">${escapeHtml(`Proposal: ${diff.proposalLabel ?? "Proposal"}`)}</span>
      </div>
      ${entries.length ? `
        <div class="diff-grid">
          ${entries.map((entry) => `
            <article class="diff-card">
              <strong>${escapeHtml(entry.label ?? "Changed field")}</strong>
              <div class="diff-value">
                <span class="detail-label">Stored</span>
                <p>${escapeHtml(entry.baseValue ?? "Not stored yet")}</p>
              </div>
              <div class="diff-value proposal">
                <span class="detail-label">Proposal</span>
                <p>${escapeHtml(entry.proposalValue ?? "Not set in proposal")}</p>
              </div>
            </article>
          `).join("")}
        </div>
      ` : `
        <p class="answer-callout"><strong>No major field changes:</strong> The proposal lines up with the closest stored memory on the compared fields.</p>
      `}
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

function buildLocalOnlyPayload(recall = {}) {
  return {
    ok: true,
    source: recall.ready ? "strandspace" : "search-guidance",
    question: recall.question ?? "",
    answer: recall.answer ?? (recall.ready ? "Local memory found a match." : "Local memory needs one more detail."),
    construct: recall.matched ?? null,
    recall,
    linkedSubjectConstructs: recall.linkedSubjectConstructs ?? [],
    libraryCount: recall.libraryCount ?? null
  };
}

function renderAssistFollowUps(payload = null) {
  const review = payload?.review ?? null;
  const construct = payload?.construct ?? null;
  const followUps = buildFollowUpQueries(payload);
  const showSavePrompt = Boolean(payload?.needsReview && review?.canLearn && construct?.deviceModel);

  if (!isAssistPayload(payload) && !showSavePrompt) {
    return "";
  }

  return `
    <section class="assist-followup-panel">
      <div class="review-head">
        <div>
          <span class="detail-label">${escapeHtml(isAssistPayload(payload) ? "AI assist follow-up" : "Next step")}</span>
          <h3>${escapeHtml(showSavePrompt ? "Keep, Save, Or Refine This Result" : "Good Next Questions To Ask")}</h3>
        </div>
        <span class="meta">${escapeHtml(showSavePrompt ? "Review before storing" : "Suggested follow-up")}</span>
      </div>
      ${showSavePrompt ? `
        <p class="answer-detail">${escapeHtml(`Do you want this saved as a reusable ${construct.deviceModel} scene for future searches?`)}</p>
        <div class="review-actions">
          <button type="button" class="primary-action review-action" data-review-action="store">${escapeHtml(`Commit ${construct.deviceModel} construct`)}</button>
          <button type="button" class="ghost-action review-action" data-review-action="refine">Refine before saving</button>
        </div>
      ` : ""}
      ${followUps.length ? `
        <div class="focus-panel">
          <div class="focus-head">
            <strong>Per-device follow-up prompts</strong>
            <span class="focus-subtitle">Click one to replace the search with a tighter follow-up</span>
          </div>
          <div class="chip-row">
            ${followUps.map((item) => `<button type="button" class="ghost-action search-suggestion" data-suggested-query="${escapeAttribute(item.query)}">${escapeHtml(item.label)}</button>`).join("")}
          </div>
        </div>
      ` : ""}
    </section>
  `;
}

function renderFocusedFlow(focusedItems = []) {
  if (!focusedItems.length) {
    return "";
  }

  return `
    <section class="focused-flow-panel">
      <div class="focus-head">
        <strong>Asked Return</strong>
        <span class="focus-subtitle">Only the sections requested from memory</span>
      </div>
      <ul class="focused-flow-list">
        ${focusedItems.map((item) => `
          <li>
            <strong>${escapeHtml(item.label)}</strong>
            <p>${escapeHtml(item.value)}</p>
          </li>
        `).join("")}
      </ul>
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
  const focusedItems = buildFocusedFlowItems(focusedSetup);
  const askedForTags = buildAskedForTags(recall);
  const assistUsed = isAssistPayload(payload);
  const shouldUseFocusedFlowAsPrimaryOutput = Boolean(focusedItems.length && !review && !searchGuidance);
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
      <div class="answer-badges">
        <span class="answer-source">${escapeHtml(sourceLabel)}</span>
        ${assistUsed ? '<span class="answer-badge assist-used">AI Assist used</span>' : ""}
        ${payload.needsReview ? '<span class="answer-badge review-state">Review mode</span>' : ""}
      </div>
      <span class="meta">${escapeHtml(construct?.name ?? "Focused result")}</span>
    </div>
    ${renderMemoryDrawer(payload.linkedSubjectConstructs ?? [], construct, recall)}
    ${shouldUseFocusedFlowAsPrimaryOutput ? "" : `<p class="answer-summary">${escapeHtml(payload.answer ?? "No answer returned.")}</p>`}
    ${askedForTags.length ? `
      <div class="asked-for">
        ${askedForTags.map((tag) => `<span class="asked-tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    ` : ""}
    ${clarification?.prompt ? `<p class="answer-callout"><strong>Need detail:</strong> ${escapeHtml(clarification.prompt)}</p>` : ""}
    ${focusedItems.length ? renderFocusedFlow(focusedItems) : (focusedParagraph ? `<p class="answer-detail"><strong>Asked return:</strong> ${escapeHtml(focusedParagraph)}</p>` : "")}
    ${renderSearchGuidance(searchGuidance)}
    ${renderReviewPanel(review)}
    ${renderReviewDiffPanel(review)}
    ${renderAssistFollowUps(payload)}
    <dl class="answer-meta">
      <div><dt>Device</dt><dd>${escapeHtml([construct?.deviceBrand, construct?.deviceModel].filter(Boolean).join(" ") || "n/a")}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml([construct?.sourceBrand, construct?.sourceModel, construct?.sourceType].filter(Boolean).join(" ") || "n/a")}</dd></div>
      <div><dt>Preset</dt><dd>${escapeHtml([construct?.presetCategory, construct?.presetName].filter(Boolean).join(" > ") || "n/a")}</dd></div>
      <div><dt>Event</dt><dd>${escapeHtml(construct?.eventType ?? "n/a")}</dd></div>
      <div><dt>Venue</dt><dd>${escapeHtml(construct?.venueSize ?? "n/a")}</dd></div>
      <div><dt>Ready</dt><dd>${review ? (review.canLearn ? "reviewed draft" : "needs detail") : (recall.ready ? "yes" : "no")}</dd></div>
    </dl>
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

async function fetchRecall(question) {
  const url = new URL("/api/soundspace/recall", window.location.origin);
  url.searchParams.set("q", question);
  const response = await fetch(url);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      [payload.error ?? `Soundspace recall failed with ${response.status}`, payload.detail ?? "", payload.code ? `Code: ${payload.code}` : ""]
        .filter(Boolean)
        .join(" ")
    );
  }

  return response.json();
}

async function fetchAnswer(question, { reviewBeforeStore = true, preferApi = true, forceAssist = false } = {}) {
  const response = await fetch("/api/soundspace/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question, reviewBeforeStore, preferApi, forceAssist })
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

function shouldDraftLocalSuggestion(recall = {}) {
  if (!recall || recall.ready) {
    return false;
  }

  const parsed = recall.parsed ?? {};
  const normalized = String(parsed.normalized ?? "").trim();
  if (/\bvenue preset\b|\bgeneric venue preset\b/.test(normalized)) {
    return false;
  }

  const deviceMatches = Array.isArray(parsed.deviceMatches) ? parsed.deviceMatches : [];
  const recognizedGear = Array.isArray(parsed.recognizedGear) ? parsed.recognizedGear : [];
  const candidates = Array.isArray(recall.candidates) ? recall.candidates : [];

  return Boolean(
    parsed.deviceModel
    || deviceMatches.length >= 2
    || recognizedGear.length >= 2
    || (parsed.deviceBrand && candidates.length)
  );
}

async function searchSoundspace(question, { reviewBeforeStore = true, useAssistSuggestions = false } = {}) {
  if (useAssistSuggestions) {
    return fetchAnswer(question, {
      reviewBeforeStore,
      preferApi: true,
      forceAssist: true
    });
  }

  const recall = await fetchRecall(question);

  if (recall.ready && ["use_strandspace", "use_strandspace_combined"].includes(String(recall.recommendation ?? ""))) {
    return buildLocalOnlyPayload(recall);
  }

  if (shouldDraftLocalSuggestion(recall)) {
    return fetchAnswer(question, {
      reviewBeforeStore,
      preferApi: false,
      forceAssist: false
    });
  }

  return buildLocalOnlyPayload(recall);
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

  const useAssistSuggestions = Boolean(assistToggle?.checked);
  metaEl.textContent = useAssistSuggestions ? "Running AI suggestion path..." : "Checking local memory...";
  updateAssistToggleState({ phase: "running" });
  setButtonBusy(submitButton, true, useAssistSuggestions ? "Searching with AI..." : "Searching...");
  try {
    const payload = await searchSoundspace(question, {
      reviewBeforeStore: true,
      useAssistSuggestions
    });
    const aiSuggestionUsed = useAssistSuggestions && isAssistPayload(payload);
    metaEl.textContent = payload.source === "search-guidance"
      ? (useAssistSuggestions ? "AI search needs a recognizable device or one more detail" : "Local-only search needs one more detail")
      : payload.needsReview
      ? `${aiSuggestionUsed ? "AI proposal ready" : payload.source === "generated-proposal" ? "Local proposal ready" : "Proposal ready"} | ${payload.construct?.deviceModel ?? "Soundspace"}`
      : `${aiSuggestionUsed ? "AI suggestion used" : payload.source === "strandspace" ? "Recall hit" : "Learned result"} | ${payload.construct?.deviceModel ?? "Soundspace"}`;
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
    updateAssistToggleState();
  }
}

function seedQuery(value = "", { runSearch = false } = {}) {
  questionInput.value = value;
  updateAssistToggleState();
  questionInput.focus();
  if (runSearch) {
    void askQuestion();
  }
}

form?.addEventListener("submit", askQuestion);

clearButton?.addEventListener("click", () => {
  latestProposal = null;
  questionInput.value = "";
  metaEl.textContent = "Ready";
  renderAnswer(null);
  updateAssistToggleState();
  questionInput.focus();
});

quickQueryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    seedQuery(button.getAttribute("data-query") ?? "", {
      runSearch: button.getAttribute("data-run-query") === "true"
    });
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

  questionInput.value = construct.constructLabel
    ?? construct.name
    ?? construct.target
    ?? "Selected construct";
  metaEl.textContent = "Construct title loaded as the search";
  updateAssistToggleState();
  questionInput.focus();
});

librarySearchInput?.addEventListener("input", () => {
  renderLibrary();
});

questionInput?.addEventListener("input", () => {
  updateAssistToggleState();
});

assistToggle?.addEventListener("change", () => {
  updateAssistToggleState();
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
    const refreshed = await searchSoundspace(questionInput.value.trim() || proposal.question || "", {
      reviewBeforeStore: true,
      useAssistSuggestions: Boolean(assistToggle?.checked)
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
if (assistToggle) {
  assistToggle.checked = false;
}
updateAssistToggleState();
void loadSystemHealth();
void loadLibrary();
