import { CONSTRUCT_TYPES, STEP_DEFS, TYPE_HINTS, typeLabel } from "./schema.js";
import { escapeHtml, tokenize } from "./utils.js";
import { canSuggestTitle, currentStep, isDraftSaved, stepSequence, titleSuggestion } from "./state.js";

function badge(label, tone = "neutral") {
  const cls = tone === "accent"
    ? "ss-badge ss-badge-accent"
    : tone === "warn"
      ? "ss-badge ss-badge-warn"
      : tone === "good"
        ? "ss-badge ss-badge-good"
        : "ss-badge";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

export function workspaceShellMarkup() {
  return `
    <section class="ss-card ss-card-intake">
      <header class="ss-card-header">
        <div>
          <div class="ss-card-kicker">Guided intake</div>
          <h2 class="ss-card-title">Build a construct</h2>
        </div>
        <div class="ss-card-meta">
          <span id="ss-step-indicator" class="ss-muted">Step</span>
        </div>
      </header>

      <div class="ss-question">
        <div class="ss-question-head">
          <div id="ss-intake-prompt" class="ss-question-prompt">What is the topic?</div>
          <div id="ss-intake-status" class="ss-question-status"></div>
        </div>
        <div id="ss-editor" class="ss-editor"></div>
        <div id="ss-intake-hint" class="ss-question-hint ss-muted"></div>
        <div id="ss-title-suggestion" class="ss-title-suggestion"></div>
      </div>
    </section>

    <section class="ss-card ss-card-draft">
      <header class="ss-card-header">
        <div>
          <div class="ss-card-kicker">Draft</div>
          <h2 class="ss-card-title">Captured structure</h2>
        </div>
        <div id="ss-draft-badges" class="ss-card-meta"></div>
      </header>
      <div id="ss-draft-summary" class="ss-draft-summary"></div>
    </section>

    <section class="ss-card ss-card-reconstruct">
      <header class="ss-card-header">
        <div>
          <div class="ss-card-kicker">Local reconstruction</div>
          <h2 class="ss-card-title">Ask the stored topic</h2>
        </div>
        <div id="ss-reconstruct-badges" class="ss-card-meta"></div>
      </header>

      <div class="ss-form-row">
        <label class="ss-label" for="ss-query-input">Question</label>
        <textarea id="ss-query-input" class="ss-textarea" rows="3" placeholder="Ask a question (example: brown black red gold)"></textarea>
      </div>
      <div class="ss-muted ss-inline-help">Uses local reconstruction first. Only call AI when local memory is insufficient.</div>
    </section>
  `;
}

export function leftSidebarMarkup(state) {
  const search = String(state.filters.search ?? "");
  const typeFilters = CONSTRUCT_TYPES.map((type) => {
    const checked = state.filters.types?.has(type);
    return `
      <label class="ss-check">
        <input type="checkbox" data-action="filter-type" data-type="${escapeHtml(type)}" ${checked ? "checked" : ""} />
        <span>${escapeHtml(typeLabel(type))}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="ss-panel">
      <div class="ss-panel-title">Library</div>
      <button class="ss-button ss-button-primary ss-button-full" data-action="new-construct">New construct</button>

      <div class="ss-form-row">
        <label class="ss-label" for="ss-search-input">Search</label>
        <input id="ss-search-input" class="ss-input" type="search" value="${escapeHtml(search)}" placeholder="Search saved constructs..." data-action="search" />
      </div>

      <details class="ss-details" open>
        <summary>Construct type filters</summary>
        <div class="ss-check-grid">
          ${typeFilters}
        </div>
      </details>
    </div>

    <div class="ss-panel">
      <div class="ss-panel-title">Saved constructs</div>
      <div class="ss-list" id="ss-saved-constructs"></div>
    </div>

    <div class="ss-panel">
      <div class="ss-panel-title">Recent drafts</div>
      <div class="ss-list" id="ss-recent-drafts"></div>
    </div>
  `;
}

export function rightSidebarMarkup() {
  return `
    <div class="ss-panel">
      <div class="ss-panel-title">Possible fits</div>
      <div id="ss-match-status" class="ss-muted">Type to see matches.</div>
      <div id="ss-match-list" class="ss-list"></div>
    </div>

    <div class="ss-panel">
      <div class="ss-panel-title">Reconstruction preview</div>
      <div id="ss-recon-status" class="ss-muted">Ask a question to preview local reconstruction.</div>
      <div id="ss-recon-preview" class="ss-preview"></div>
    </div>
  `;
}

export function bottomBarMarkup() {
  return `
    <div class="ss-bottom-left">
      <button class="ss-button ss-button-secondary" data-action="back">Back</button>
      <button class="ss-button ss-button-secondary" data-action="next">Next</button>
      <button class="ss-button ss-button-secondary" data-action="skip">Skip</button>
    </div>
    <div class="ss-bottom-center">
      <button class="ss-button ss-button-secondary" data-action="check-fits">Check possible fits</button>
      <button class="ss-button ss-button-secondary" data-action="reconstruct">Reconstruct answer</button>
    </div>
    <div class="ss-bottom-right">
      <button class="ss-button ss-button-primary" data-action="save">Save construct</button>
      <button class="ss-button ss-button-secondary" data-action="update">Update construct</button>
      <button class="ss-button ss-button-danger" data-action="delete-draft">Delete current draft</button>
      <button class="ss-button ss-button-secondary" data-action="reset">Reset intake</button>
    </div>
  `;
}

export function renderHeaderBadges(state) {
  const topic = String(state.draft.topic ?? "").trim();
  const type = String(state.draft.construct_type ?? "").trim();
  const saved = isDraftSaved(state);
  const dirtyBadge = saved ? badge("Saved", "good") : badge("Unsaved", "warn");
  const typeBadge = type ? badge(typeLabel(type), "accent") : badge("Type unknown", "neutral");
  const topicBadge = topic ? badge("Topic set", "neutral") : badge("Topic missing", "warn");
  return [topicBadge, typeBadge, dirtyBadge].join(" ");
}

export function renderDraftBadges(state) {
  const saved = isDraftSaved(state);
  const topic = String(state.draft.topic ?? "").trim();
  const type = String(state.draft.construct_type ?? "").trim();
  const missing = [];
  if (!topic) missing.push("topic");
  if (!type) missing.push("type");
  return `
    ${saved ? badge("Saved", "good") : badge("Draft", "accent")}
    ${missing.length ? badge(`Missing: ${missing.join(", ")}`, "warn") : ""}
  `.trim();
}

export function renderStepIndicator(state) {
  const { key, index, total } = currentStep(state);
  const def = STEP_DEFS[key] ?? { label: key };
  return `${escapeHtml(def.label)} (${index + 1}/${total})`;
}

export function renderPrompt(state) {
  const { key } = currentStep(state);
  const def = STEP_DEFS[key] ?? { prompt: "Next", hint: "" };
  const typeHint = key === "construct_type"
    ? (TYPE_HINTS[String(state.draft.construct_type ?? "").trim()] ?? "Pick the closest match.")
    : "";
  const hint = [def.hint, typeHint].filter(Boolean).join(" ");
  return { prompt: def.prompt, hint };
}

export function renderTitleSuggestion(state) {
  const suggestion = titleSuggestion(state);
  if (!suggestion) {
    if (!canSuggestTitle(state)) {
      return `<div class="ss-muted">Title suggestion unlocks after you capture a type and at least one core detail.</div>`;
    }
    return "";
  }

  return `
    <div class="ss-suggest">
      <div>
        <div class="ss-suggest-label">Suggested title</div>
        <div class="ss-suggest-value">${escapeHtml(suggestion)}</div>
      </div>
      <div class="ss-suggest-actions">
        <button class="ss-button ss-button-secondary" data-action="apply-title">Use title</button>
      </div>
    </div>
  `;
}

export function renderEditorMarkup(state) {
  const { key } = currentStep(state);
  const type = String(state.draft.construct_type ?? "").trim();

  if (key === "topic") {
    return `
      <label class="ss-label" for="ss-field-topic">Topic</label>
      <input id="ss-field-topic" class="ss-input ss-input-lg" type="text" placeholder="Enter a topic..." value="${escapeHtml(state.draft.topic ?? "")}" data-field="topic" />
    `;
  }

  if (key === "construct_type") {
    return `
      <label class="ss-label" for="ss-field-type">Construct type</label>
      <select id="ss-field-type" class="ss-select" data-field="construct_type">
        <option value="">Choose a type...</option>
        ${CONSTRUCT_TYPES.map((value) => `<option value="${escapeHtml(value)}" ${value === type ? "selected" : ""}>${escapeHtml(valueLabel(value))}</option>`).join("")}
      </select>
    `;
  }

  if (key === "purpose") {
    return `
      <label class="ss-label" for="ss-field-purpose">Purpose</label>
      <textarea id="ss-field-purpose" class="ss-textarea" rows="4" placeholder="What should this construct help you do?" data-field="purpose">${escapeHtml(state.draft.purpose ?? "")}</textarea>
    `;
  }

  if (key === "core_entities") {
    return `
      <label class="ss-label" for="ss-field-entities">Core entities</label>
      <textarea id="ss-field-entities" class="ss-textarea" rows="4" placeholder="One per line (device, system, person, key nouns)" data-field="core_entities_text">${escapeHtml((Array.isArray(state.draft.core_entities) ? state.draft.core_entities : []).join("\n"))}</textarea>
    `;
  }

  if (key === "attributes") {
    return `
      <div class="ss-editor-head">
        <div>
          <div class="ss-label">Attributes / settings</div>
          <div class="ss-muted">Key/value context that makes local reconstruction reliable.</div>
        </div>
        <button class="ss-button ss-button-secondary" data-action="attr-add">Add row</button>
      </div>
      <div class="ss-grid-editor">
        <div class="ss-grid-row ss-grid-header">
          <div>Key</div>
          <div>Value</div>
          <div></div>
        </div>
        ${(Array.isArray(state.ui.attributesRows) ? state.ui.attributesRows : []).map((row, idx) => `
          <div class="ss-grid-row">
            <input class="ss-input" type="text" value="${escapeHtml(row?.key ?? "")}" placeholder="key" data-action="attr-key" data-index="${idx}" />
            <input class="ss-input" type="text" value="${escapeHtml(row?.value ?? "")}" placeholder="value" data-action="attr-value" data-index="${idx}" />
            <button class="ss-icon-button" title="Remove row" data-action="attr-remove" data-index="${idx}">×</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (key === "steps") {
    return `
      <div class="ss-editor-head">
        <div>
          <div class="ss-label">Ordered steps</div>
          <div class="ss-muted">Use short, imperative steps. Keep them runnable.</div>
        </div>
        <button class="ss-button ss-button-secondary" data-action="steps-add">Add step</button>
      </div>
      <div class="ss-list-editor">
        ${(Array.isArray(state.draft.steps) ? state.draft.steps : []).map((step, idx) => `
          <div class="ss-list-row">
            <div class="ss-list-index">${idx + 1}</div>
            <input class="ss-input" type="text" value="${escapeHtml(step ?? "")}" placeholder="Step..." data-action="steps-edit" data-index="${idx}" />
            <div class="ss-list-actions">
              <button class="ss-icon-button" title="Move up" data-action="steps-up" data-index="${idx}">↑</button>
              <button class="ss-icon-button" title="Move down" data-action="steps-down" data-index="${idx}">↓</button>
              <button class="ss-icon-button" title="Remove" data-action="steps-remove" data-index="${idx}">×</button>
            </div>
          </div>
        `).join("") || `<div class="ss-muted">No steps yet.</div>`}
      </div>
    `;
  }

  if (key === "rules") {
    return `
      <div class="ss-editor-head">
        <div>
          <div class="ss-label">Rules</div>
          <div class="ss-muted">Explainable decision rules that help Strandspace answer locally.</div>
        </div>
        <button class="ss-button ss-button-secondary" data-action="rules-add">Add rule</button>
      </div>
      <div class="ss-list-editor">
        ${(Array.isArray(state.draft.rules) ? state.draft.rules : []).map((rule, idx) => `
          <div class="ss-list-row">
            <div class="ss-list-index">${idx + 1}</div>
            <input class="ss-input" type="text" value="${escapeHtml(rule ?? "")}" placeholder="Rule..." data-action="rules-edit" data-index="${idx}" />
            <div class="ss-list-actions">
              <button class="ss-icon-button" title="Remove" data-action="rules-remove" data-index="${idx}">×</button>
            </div>
          </div>
        `).join("") || `<div class="ss-muted">No rules yet.</div>`}
      </div>
    `;
  }

  if (key === "lookup_table") {
    return `
      <div class="ss-editor-head">
        <div>
          <div class="ss-label">Lookup table (JSON)</div>
          <div class="ss-muted">Nested objects are allowed. Keep keys stable and human-readable.</div>
        </div>
        <div class="ss-inline-actions">
          <button class="ss-button ss-button-secondary" data-action="lookup-format">Format JSON</button>
          <button class="ss-button ss-button-secondary" data-action="lookup-clear">Clear</button>
        </div>
      </div>
      <textarea class="ss-textarea ss-mono" rows="10" placeholder="{ \"digits\": { \"brown\": 1 } }" data-field="lookup_json">${escapeHtml(state.ui.lookupJsonText ?? "")}</textarea>
      ${state.ui.lookupJsonError ? `<div class="ss-error">JSON error: ${escapeHtml(state.ui.lookupJsonError)}</div>` : ""}
    `;
  }

  if (key === "examples") {
    return `
      <label class="ss-label" for="ss-field-examples">Examples</label>
      <textarea id="ss-field-examples" class="ss-textarea" rows="5" placeholder="One per line" data-field="examples_text">${escapeHtml((Array.isArray(state.draft.examples) ? state.draft.examples : []).join("\n"))}</textarea>
    `;
  }

  if (key === "tags") {
    return `
      <label class="ss-label" for="ss-field-tags">Tags</label>
      <input id="ss-field-tags" class="ss-input" type="text" placeholder="comma, separated, tags" value="${escapeHtml((Array.isArray(state.draft.tags) ? state.draft.tags : []).join(", "))}" data-field="tags_text" />
    `;
  }

  if (key === "title") {
    return `
      <label class="ss-label" for="ss-field-title">Title</label>
      <input id="ss-field-title" class="ss-input" type="text" placeholder="Optional title" value="${escapeHtml(state.draft.title ?? "")}" data-field="title" />
      <div class="ss-muted ss-inline-help">Topic is not the title. Leave this blank until the structure feels stable.</div>
    `;
  }

  if (key === "retrieval_keys") {
    return `
      <label class="ss-label" for="ss-field-retrieval">Retrieval keys</label>
      <textarea id="ss-field-retrieval" class="ss-textarea" rows="4" placeholder="One per line (or comma-separated)" data-field="retrieval_keys_text">${escapeHtml((Array.isArray(state.draft.retrieval_keys) ? state.draft.retrieval_keys : []).join("\n"))}</textarea>
    `;
  }

  if (key === "trigger_phrases") {
    return `
      <label class="ss-label" for="ss-field-trigger">Trigger phrases</label>
      <textarea id="ss-field-trigger" class="ss-textarea" rows="4" placeholder="One per line" data-field="trigger_phrases_text">${escapeHtml((Array.isArray(state.draft.trigger_phrases) ? state.draft.trigger_phrases : []).join("\n"))}</textarea>
    `;
  }

  if (key === "diagnostic") {
    const diag = state.ui.diagnostic ?? { symptoms: [""], causes: [""], checks: [""] };
    return `
      <div class="ss-split-editor">
        ${renderListColumn("Symptoms", "diagnostic-symptom", diag.symptoms)}
        ${renderListColumn("Likely causes", "diagnostic-cause", diag.causes)}
        ${renderListColumn("Checks", "diagnostic-check", diag.checks)}
      </div>
      <div class="ss-muted ss-inline-help">Stored as structured attributes so local reconstruction can stay explainable.</div>
    `;
  }

  if (key === "specification") {
    const rows = state.ui.specification?.rows ?? [{ key: "", value: "", unit: "" }];
    return `
      <div class="ss-editor-head">
        <div>
          <div class="ss-label">Spec grid</div>
          <div class="ss-muted">Measurements, limits, and units.</div>
        </div>
        <button class="ss-button ss-button-secondary" data-action="spec-add">Add row</button>
      </div>
      <div class="ss-grid-editor ss-grid-editor-3">
        <div class="ss-grid-row ss-grid-header">
          <div>Key</div>
          <div>Value</div>
          <div>Unit</div>
          <div></div>
        </div>
        ${rows.map((row, idx) => `
          <div class="ss-grid-row">
            <input class="ss-input" type="text" value="${escapeHtml(row?.key ?? "")}" placeholder="measurement" data-action="spec-key" data-index="${idx}" />
            <input class="ss-input" type="text" value="${escapeHtml(row?.value ?? "")}" placeholder="value" data-action="spec-value" data-index="${idx}" />
            <input class="ss-input" type="text" value="${escapeHtml(row?.unit ?? "")}" placeholder="unit" data-action="spec-unit" data-index="${idx}" />
            <button class="ss-icon-button" title="Remove row" data-action="spec-remove" data-index="${idx}">×</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  return `<div class="ss-muted">No editor for ${escapeHtml(key)}.</div>`;
}

function valueLabel(type) {
  return `${type} — ${typeLabel(type)}`;
}

function renderListColumn(title, actionPrefix, values = []) {
  const rows = Array.isArray(values) ? values : [];
  return `
    <div class="ss-column">
      <div class="ss-column-head">
        <div class="ss-label">${escapeHtml(title)}</div>
        <button class="ss-icon-button" title="Add row" data-action="${actionPrefix}-add">+</button>
      </div>
      <div class="ss-column-body">
        ${rows.map((value, idx) => `
          <div class="ss-column-row">
            <input class="ss-input" type="text" value="${escapeHtml(value ?? "")}" placeholder="..." data-action="${actionPrefix}-edit" data-index="${idx}" />
            <button class="ss-icon-button" title="Remove" data-action="${actionPrefix}-remove" data-index="${idx}">×</button>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

export function renderDraftSummary(state) {
  const draft = state.draft ?? {};
  const lines = [];
  const addRow = (label, value) => {
    lines.push(`
      <div class="ss-summary-row">
        <div class="ss-summary-label">${escapeHtml(label)}</div>
        <div class="ss-summary-value">${value}</div>
      </div>
    `);
  };

  addRow("Topic", escapeHtml(String(draft.topic ?? "").trim() || "—"));
  addRow("Type", escapeHtml(String(draft.construct_type ?? "").trim() || "—"));
  addRow("Title", escapeHtml(String(draft.title ?? "").trim() || "—"));
  addRow("Purpose", escapeHtml(String(draft.purpose ?? "").trim() || "—"));
  addRow("Entities", escapeHtml((Array.isArray(draft.core_entities) ? draft.core_entities.join(", ") : "") || "—"));
  addRow("Tags", escapeHtml((Array.isArray(draft.tags) ? draft.tags.join(", ") : "") || "—"));

  const steps = Array.isArray(draft.steps) ? draft.steps.filter(Boolean) : [];
  addRow("Steps", steps.length ? `<ol class="ss-mini-list">${steps.slice(0, 8).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` : "—");

  const rules = Array.isArray(draft.rules) ? draft.rules.filter(Boolean) : [];
  addRow("Rules", rules.length ? `<ul class="ss-mini-list">${rules.slice(0, 8).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : "—");

  const lookup = draft.lookup_table && typeof draft.lookup_table === "object" ? draft.lookup_table : {};
  addRow("Lookup", Object.keys(lookup).length ? `<pre class="ss-mini-pre">${escapeHtml(JSON.stringify(lookup, null, 2).slice(0, 900))}${JSON.stringify(lookup, null, 2).length > 900 ? "\n…" : ""}</pre>` : "—");

  const attrs = draft.attributes && typeof draft.attributes === "object" && !Array.isArray(draft.attributes) ? draft.attributes : {};
  const attrEntries = Object.entries(attrs).filter(([key]) => !["symptoms", "causes", "checks", "specs"].includes(key));
  addRow("Attributes", attrEntries.length ? `<ul class="ss-mini-list">${attrEntries.slice(0, 10).map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`).join("")}</ul>` : "—");

  if (Array.isArray(attrs.symptoms) || Array.isArray(attrs.causes) || Array.isArray(attrs.checks)) {
    addRow("Diagnostic", `
      <div class="ss-mini-columns">
        <div><div class="ss-muted">Symptoms</div>${miniList(attrs.symptoms)}</div>
        <div><div class="ss-muted">Causes</div>${miniList(attrs.causes)}</div>
        <div><div class="ss-muted">Checks</div>${miniList(attrs.checks)}</div>
      </div>
    `);
  }

  if (Array.isArray(attrs.specs) && attrs.specs.length) {
    addRow("Specs", `
      <ul class="ss-mini-list">
        ${attrs.specs.slice(0, 10).map((row) => `<li><strong>${escapeHtml(row?.key ?? "")}:</strong> ${escapeHtml(row?.value ?? "")}${row?.unit ? ` ${escapeHtml(row.unit)}` : ""}</li>`).join("")}
      </ul>
    `);
  }

  return lines.join("");
}

function miniList(items = []) {
  const rows = Array.isArray(items) ? items.filter(Boolean).slice(0, 6) : [];
  if (!rows.length) return `<div class="ss-muted">—</div>`;
  return `<ul class="ss-mini-list">${rows.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function renderSavedConstructList(state) {
  const query = String(state.filters.search ?? "").trim().toLowerCase();
  const allowedTypes = state.filters.types ?? new Set(CONSTRUCT_TYPES);
  const constructs = Array.isArray(state.topicConstructs) ? state.topicConstructs : [];

  const filtered = constructs.filter((construct) => {
    const type = String(construct?.construct_type ?? "").trim() || "hybrid";
    if (!allowedTypes.has(type)) return false;
    if (!query) return true;
    const haystack = [
      construct?.topic,
      construct?.title,
      type,
      ...(Array.isArray(construct?.tags) ? construct.tags : [])
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  }).slice(0, 80);

  if (!filtered.length) {
    return `<div class="ss-muted">No saved constructs match the current filters.</div>`;
  }

  return filtered.map((construct) => {
    const title = String(construct?.title ?? "").trim() || String(construct?.topic ?? "").trim() || "Untitled";
    const topic = String(construct?.topic ?? "").trim() || "—";
    const type = String(construct?.construct_type ?? "").trim() || "hybrid";
    const tags = Array.isArray(construct?.tags) ? construct.tags : [];
    const expanded = String(state.ui.expandedSavedId ?? "") === String(construct?.id ?? "");
    return `
      <div class="ss-list-item">
        <div class="ss-list-item-main">
          <div class="ss-list-item-title">${escapeHtml(title)}</div>
          <div class="ss-list-item-meta">
            ${escapeHtml(topic)} · ${escapeHtml(type)}${tags.length ? ` · ${escapeHtml(tags.slice(0, 3).join(", "))}` : ""}
          </div>
        </div>
        <div class="ss-list-item-actions">
          <button class="ss-icon-button" title="View" data-action="view-construct" data-id="${escapeHtml(construct?.id ?? "")}">${expanded ? "Hide" : "View"}</button>
          <button class="ss-icon-button" title="Use" data-action="use-construct" data-id="${escapeHtml(construct?.id ?? "")}">Use</button>
        </div>
        ${expanded ? `
          <div class="ss-list-item-detail">
            <div class="ss-muted">${escapeHtml(String(construct?.purpose ?? "").trim() || "No purpose captured yet.")}</div>
            ${Array.isArray(construct?.core_entities) && construct.core_entities.length ? `<div class="ss-muted">Entities: ${escapeHtml(construct.core_entities.slice(0, 6).join(", "))}</div>` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

export function renderRecentDrafts(state) {
  const rows = Array.isArray(state.ui.recentDrafts) ? state.ui.recentDrafts : [];
  if (!rows.length) return `<div class="ss-muted">No drafts yet.</div>`;

  return rows.slice(0, 10).map((item) => `
    <div class="ss-list-item">
      <div class="ss-list-item-main">
        <div class="ss-list-item-title">${escapeHtml(String(item?.title ?? item?.topic ?? "Draft"))}</div>
        <div class="ss-list-item-meta">${escapeHtml(String(item?.construct_type ?? "hybrid"))} · ${escapeHtml(String(item?.updatedAt ?? ""))}</div>
      </div>
      <div class="ss-list-item-actions">
        <button class="ss-icon-button" data-action="use-recent" data-payload="${escapeHtml(JSON.stringify(item ?? {}))}">Use</button>
      </div>
    </div>
  `).join("");
}

export function renderMatchPanel(state) {
  const recall = state.ui.lastRecall;
  const ignored = state.ui.ignoredMatchIds ?? new Set();
  const question = String(recall?.question ?? "").trim();

  if (!question) {
    return {
      status: "Type to see matches.",
      list: ""
    };
  }

  const candidates = Array.isArray(recall?.candidates) ? recall.candidates : [];
  const matched = recall?.matched ?? null;
  const rows = (matched ? [matched, ...candidates] : candidates).filter((row) => row && !ignored.has(row.id)).slice(0, 5);
  if (!rows.length) {
    return {
      status: "No matches yet.",
      list: `<div class="ss-muted">No close matches. Keep capturing details or save a partial construct.</div>`
    };
  }

  const tokens = new Set(tokenize(question));
  const list = rows.map((row) => {
    const title = String(row?.title ?? "").trim() || String(row?.topic ?? "").trim() || "Untitled";
    const type = String(row?.construct_type ?? "").trim() || "hybrid";
    const score = Number(row?.score ?? 0);
    const conf = Number(row?.confidence ?? NaN);
    const why = buildWhy(tokens, row);
    const tone = recall?.matched?.id === row?.id ? "good" : "neutral";
    const expanded = String(state.ui.expandedMatchId ?? "") === String(row?.id ?? "");
    return `
      <div class="ss-match-card ${tone === "good" ? "is-primary" : ""}">
        <div class="ss-match-head">
          <div>
            <div class="ss-match-title">${escapeHtml(title)}</div>
            <div class="ss-match-meta">${escapeHtml(type)} · score ${Number.isFinite(score) ? score.toFixed(1) : "0.0"}${Number.isFinite(conf) ? ` · conf ${conf.toFixed(2)}` : ""}</div>
          </div>
          <div class="ss-match-actions">
            <button class="ss-icon-button" data-action="view-match" data-id="${escapeHtml(row?.id ?? "")}">${expanded ? "Hide" : "View"}</button>
            <button class="ss-icon-button" data-action="use-match" data-id="${escapeHtml(row?.id ?? "")}">Use</button>
            <button class="ss-icon-button" data-action="merge-match" data-id="${escapeHtml(row?.id ?? "")}">Merge</button>
            <button class="ss-icon-button" data-action="ignore-match" data-id="${escapeHtml(row?.id ?? "")}">Ignore</button>
          </div>
        </div>
        ${why.length ? `<div class="ss-match-why"><span class="ss-muted">Why:</span> ${escapeHtml(why.join(", "))}</div>` : ""}
        ${expanded ? `
          <div class="ss-match-detail">
            <div class="ss-muted">${escapeHtml(String(row?.purpose ?? "").trim() || "No purpose captured yet.")}</div>
            ${Array.isArray(row?.core_entities) && row.core_entities.length ? `<div class="ss-muted">Entities: ${escapeHtml(row.core_entities.slice(0, 6).join(", "))}</div>` : ""}
            ${Array.isArray(row?.rules) && row.rules.length ? `<div class="ss-muted">Rules: ${escapeHtml(row.rules.slice(0, 2).join(" · "))}</div>` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  const ready = Boolean(recall?.ready);
  const status = ready ? "Stable local fit found." : "Partial match — keep adding structure.";
  return { status, list };
}

function buildWhy(tokens, row) {
  const fields = [
    String(row?.topic ?? ""),
    String(row?.title ?? ""),
    ...(Array.isArray(row?.tags) ? row.tags : []),
    ...(Array.isArray(row?.retrieval_keys) ? row.retrieval_keys : []),
    ...(Array.isArray(row?.trigger_phrases) ? row.trigger_phrases : [])
  ].join(" ");
  const hits = tokenize(fields).filter((token) => tokens.has(token));
  return [...new Set(hits)].slice(0, 5);
}

export function renderReconPreview(state) {
  const answer = state.ui.lastAnswer ?? null;
  if (!answer) {
    return { status: "Ask a question to preview local reconstruction.", preview: "" };
  }

  const source = String(answer.source ?? "unresolved");
  const confidence = Number(answer.confidence ?? answer.recall?.confidence ?? 0);
  const ready = source === "topicspace";
  const needsAssist = Boolean(answer.needsAssist);

  const status = ready
    ? `Can answer locally · confidence ${confidence.toFixed(2)}`
    : needsAssist
      ? "Partial reconstruction · needs more detail (or AI assist)"
      : "Needs a saved construct";

  const preview = `
    <div class="ss-preview-block">
      ${ready ? badge("Can answer locally", "good") : needsAssist ? badge("Partial", "warn") : badge("Needs construct", "warn")}
      <div class="ss-preview-answer">${escapeHtml(String(answer.answer ?? "").trim() || "—")}</div>
    </div>
  `;

  return { status, preview };
}
