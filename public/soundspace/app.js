const form = document.getElementById("soundspace-form");
const questionInput = document.getElementById("soundspace-question");
const metaEl = document.getElementById("soundspace-meta");
const answerEl = document.getElementById("soundspace-answer");
const libraryMetaEl = document.getElementById("soundspace-library-meta");
const libraryEl = document.getElementById("soundspace-library");

let soundspaceLibrary = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAnswer(payload = null) {
  if (!payload) {
    answerEl.className = "answer-card empty";
    answerEl.innerHTML = "<p>Ask a question to see whether Soundspace recalled or generated the setup.</p>";
    return;
  }

  const construct = payload.construct ?? null;
  const recall = payload.recall ?? {};
  const candidates = recall.candidates ?? [];

  answerEl.className = "answer-card";
  answerEl.innerHTML = `
    <p><strong>${escapeHtml(payload.source === "strandspace" ? "Recalled from Strandspace" : "Generated and stored")}</strong></p>
    <p>${escapeHtml(payload.answer ?? "No answer returned.")}</p>
    <dl class="answer-meta">
      <div><dt>Device</dt><dd>${escapeHtml([construct?.deviceBrand, construct?.deviceModel].filter(Boolean).join(" ") || "n/a")}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(construct?.sourceType ?? "n/a")}</dd></div>
      <div><dt>Event</dt><dd>${escapeHtml(construct?.eventType ?? "n/a")}</dd></div>
      <div><dt>Venue</dt><dd>${escapeHtml(construct?.venueSize ?? "n/a")}</dd></div>
      <div><dt>Ready</dt><dd>${recall.ready ? "yes" : "no"}</dd></div>
      <div><dt>Recommendation</dt><dd>${escapeHtml(recall.recommendation ?? payload.source)}</dd></div>
    </dl>
    ${construct?.setup ? `
      <div class="setup-grid">
        ${Object.entries(construct.setup)
          .filter(([, value]) => value)
          .map(([label, value]) => `
            <article>
              <strong>${escapeHtml(label)}</strong>
              <p>${escapeHtml(value)}</p>
            </article>
          `)
          .join("")}
      </div>
    ` : ""}
    ${Array.isArray(construct?.strands) && construct.strands.length ? `
      <div class="chip-row">
        ${construct.strands.slice(0, 10).map((strand) => `<span class="chip">${escapeHtml(strand)}</span>`).join("")}
      </div>
    ` : ""}
    ${candidates.length ? `
      <p class="subtle">Candidate recall field: ${escapeHtml(candidates.map((item) => `${item.name} (${Number(item.score ?? 0).toFixed(1)})`).join(", "))}</p>
    ` : ""}
  `;
}

function renderLibrary(items = soundspaceLibrary) {
  if (!items.length) {
    libraryMetaEl.textContent = "No sound constructs stored";
    libraryEl.className = "library empty";
    libraryEl.innerHTML = "<p>No Soundspace constructs stored yet.</p>";
    return;
  }

  libraryMetaEl.textContent = `${items.length} constructs stored`;
  libraryEl.className = "library";
  libraryEl.innerHTML = items
    .map((item) => `
      <button type="button" class="library-card" data-soundspace-id="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml([item.deviceBrand, item.deviceModel].filter(Boolean).join(" ") || "Audio construct")}</span>
        <small>${escapeHtml([item.sourceType, item.eventType, item.venueSize].filter(Boolean).join(" | "))}</small>
      </button>
    `)
    .join("");
}

async function loadLibrary() {
  libraryMetaEl.textContent = "Loading Soundspace memory...";
  try {
    const response = await fetch("/api/soundspace/library");
    if (!response.ok) {
      throw new Error(`Soundspace library failed with ${response.status}`);
    }
    const payload = await response.json();
    soundspaceLibrary = payload.constructs ?? [];
    renderLibrary(soundspaceLibrary);
  } catch (error) {
    libraryMetaEl.textContent = "Soundspace unavailable";
    libraryEl.className = "library empty";
    libraryEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : "Unable to load Soundspace memory.")}</p>`;
  }
}

async function fetchAnswer(question) {
  const response = await fetch("/api/soundspace/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Soundspace request failed with ${response.status}`);
  }

  return response.json();
}

async function askQuestion(event) {
  event.preventDefault();
  const question = questionInput.value.trim();

  if (!question) {
    metaEl.textContent = "Enter a sound question";
    renderAnswer(null);
    return;
  }

  metaEl.textContent = "Working...";
  try {
    const payload = await fetchAnswer(question);
    metaEl.textContent = `${payload.source === "strandspace" ? "Recalled" : "Generated"} - ${payload.construct?.deviceModel ?? "Soundspace"}`;
    renderAnswer(payload);
    await loadLibrary();
  } catch (error) {
    metaEl.textContent = "Error";
    answerEl.className = "answer-card empty";
    answerEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : "Unable to answer that sound question.")}</p>`;
  }
}

form?.addEventListener("submit", askQuestion);

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

  questionInput.value = `What is a good ${construct.eventType ?? "live"} ${construct.sourceType ?? "microphone"} setup for a ${[construct.deviceBrand, construct.deviceModel].filter(Boolean).join(" ")} in a ${construct.venueSize ?? "small"} venue?`;
  questionInput.focus();
});

void loadLibrary();
