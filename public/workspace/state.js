import { buildStepSequence, CONSTRUCT_TYPES, typeLabel } from "./schema.js";
import {
  objectToRows,
  parseCommaList,
  parseEntityList,
  rowsToObject,
  safeJsonParse,
  tokenize,
  uniqueList
} from "./utils.js";

const storageKey = "strandspace_workspace_state_v1";

export function createDefaultState() {
  return {
    theme: "dark",
    status: {
      openai: null,
      database: null,
      remoteAllowed: null
    },
    subjects: [],
    topicConstructs: [],
    filters: {
      search: "",
      types: new Set(CONSTRUCT_TYPES),
      showRecentDrafts: true
    },
    intake: {
      stepIndex: 0
    },
    draft: createEmptyDraft(),
    ui: {
      attributesRows: [{ key: "", value: "" }],
      lookupJsonText: "",
      lookupJsonError: "",
      diagnostic: {
        symptoms: [""],
        causes: [""],
        checks: [""]
      },
      specification: {
        rows: [{ key: "", value: "", unit: "" }]
      },
      queryText: "",
      lastRecall: null,
      lastAnswer: null,
      expandedMatchId: "",
      expandedSavedId: "",
      ignoredMatchIds: new Set(),
      recentDrafts: loadRecentDrafts()
    },
    savedSnapshot: ""
  };
}

export function createEmptyDraft() {
  return {
    id: "",
    topic: "",
    title: "",
    construct_type: "",
    purpose: "",
    summary: "",
    core_entities: [],
    attributes: {},
    relationships: [],
    rules: [],
    steps: [],
    lookup_table: {},
    examples: [],
    known_fields: [],
    unknown_fields: [],
    null_fields: [],
    sources: [],
    confidence: null,
    tags: [],
    retrieval_keys: [],
    trigger_phrases: [],
    linked_construct_ids: []
  };
}

export function loadState() {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    const payload = {
      theme: state.theme,
      intake: state.intake,
      draft: state.draft,
      filters: {
        ...state.filters,
        types: Array.from(state.filters.types ?? [])
      },
      savedSnapshot: state.savedSnapshot,
      ui: {
        queryText: state.ui.queryText,
        recentDrafts: state.ui.recentDrafts
      }
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function hydrateState(stored, fallback) {
  const state = fallback ?? createDefaultState();
  if (!stored || typeof stored !== "object") return state;

  state.theme = stored.theme === "light" ? "light" : "dark";
  state.intake = {
    stepIndex: Number(stored.intake?.stepIndex ?? 0) || 0
  };

  state.draft = {
    ...createEmptyDraft(),
    ...(stored.draft ?? {})
  };

  const types = Array.isArray(stored.filters?.types) ? stored.filters.types : null;
  state.filters.search = String(stored.filters?.search ?? "");
  state.filters.types = new Set((types && types.length ? types : CONSTRUCT_TYPES).filter((t) => CONSTRUCT_TYPES.includes(t)));
  state.savedSnapshot = String(stored.savedSnapshot ?? "");

  state.ui.queryText = String(stored.ui?.queryText ?? "");
  state.ui.recentDrafts = Array.isArray(stored.ui?.recentDrafts) ? stored.ui.recentDrafts : loadRecentDrafts();

  state.ui.attributesRows = objectToRows(state.draft.attributes);
  if (state.ui.attributesRows.length === 0) state.ui.attributesRows = [{ key: "", value: "" }];

  state.ui.lookupJsonText = state.draft.lookup_table && Object.keys(state.draft.lookup_table).length
    ? JSON.stringify(state.draft.lookup_table, null, 2)
    : "";

  state.ui.diagnostic.symptoms = Array.isArray(state.draft.attributes?.symptoms) ? [...state.draft.attributes.symptoms] : [""];
  state.ui.diagnostic.causes = Array.isArray(state.draft.attributes?.causes) ? [...state.draft.attributes.causes] : [""];
  state.ui.diagnostic.checks = Array.isArray(state.draft.attributes?.checks) ? [...state.draft.attributes.checks] : [""];

  const specRows = Array.isArray(state.draft.attributes?.specs) ? state.draft.attributes.specs : [];
  state.ui.specification.rows = specRows.length ? specRows.map((row) => ({
    key: String(row?.key ?? "").trim(),
    value: String(row?.value ?? "").trim(),
    unit: String(row?.unit ?? "").trim()
  })) : [{ key: "", value: "", unit: "" }];

  return state;
}

export function stepSequence(state) {
  return buildStepSequence(state.draft.construct_type || "");
}

export function currentStep(state) {
  const steps = stepSequence(state);
  const idx = Math.max(0, Math.min(Number(state.intake.stepIndex ?? 0) || 0, steps.length - 1));
  return { key: steps[idx], index: idx, total: steps.length };
}

export function isDraftSaved(state) {
  const snapshot = snapshotDraft(state);
  return Boolean(state.savedSnapshot && snapshot === state.savedSnapshot);
}

export function snapshotDraft(state) {
  try {
    return JSON.stringify(normalizeDraftForSnapshot(state.draft));
  } catch {
    return "";
  }
}

function normalizeDraftForSnapshot(draft) {
  return {
    ...draft,
    id: String(draft.id ?? "").trim(),
    topic: String(draft.topic ?? "").trim(),
    title: String(draft.title ?? "").trim(),
    construct_type: String(draft.construct_type ?? "").trim(),
    purpose: String(draft.purpose ?? "").trim(),
    summary: String(draft.summary ?? "").trim(),
    core_entities: uniqueList(draft.core_entities, 64),
    attributes: draft.attributes && typeof draft.attributes === "object" && !Array.isArray(draft.attributes) ? draft.attributes : {},
    rules: uniqueList(draft.rules, 128),
    steps: uniqueList(draft.steps, 128),
    lookup_table: draft.lookup_table && typeof draft.lookup_table === "object" && !Array.isArray(draft.lookup_table) ? draft.lookup_table : {},
    examples: uniqueList(draft.examples, 64),
    tags: uniqueList(draft.tags, 64),
    retrieval_keys: uniqueList(draft.retrieval_keys, 64),
    trigger_phrases: uniqueList(draft.trigger_phrases, 64),
    linked_construct_ids: uniqueList(draft.linked_construct_ids, 64)
  };
}

export function canSuggestTitle(state) {
  const topic = String(state.draft.topic ?? "").trim();
  const type = String(state.draft.construct_type ?? "").trim();
  const hasPurpose = Boolean(String(state.draft.purpose ?? "").trim());
  const hasEntities = Array.isArray(state.draft.core_entities) && state.draft.core_entities.length > 0;
  const hasSteps = Array.isArray(state.draft.steps) && state.draft.steps.length > 0;
  const hasLookup = state.draft.lookup_table && typeof state.draft.lookup_table === "object" && Object.keys(state.draft.lookup_table).length > 0;
  const hasRules = Array.isArray(state.draft.rules) && state.draft.rules.length > 0;
  return Boolean(topic && type && (hasPurpose || hasEntities || hasSteps || hasLookup || hasRules));
}

export function titleSuggestion(state) {
  if (!canSuggestTitle(state)) return "";
  if (String(state.draft.title ?? "").trim()) return "";

  const topic = String(state.draft.topic ?? "").trim();
  const type = String(state.draft.construct_type ?? "").trim();
  const entities = Array.isArray(state.draft.core_entities) ? state.draft.core_entities : [];
  const entityHint = entities[0] ? `(${entities[0]})` : "";
  const label = typeLabel(type);
  return `${topic} — ${label}${entityHint ? ` ${entityHint}` : ""}`.trim();
}

export function buildRecallQuestion(state) {
  const tokens = [
    state.draft.topic,
    state.draft.title,
    state.draft.purpose,
    ...(Array.isArray(state.draft.core_entities) ? state.draft.core_entities : []),
    ...(Array.isArray(state.draft.tags) ? state.draft.tags : []),
    ...(Array.isArray(state.draft.retrieval_keys) ? state.draft.retrieval_keys : [])
  ].flatMap((chunk) => tokenize(String(chunk ?? "")));

  return uniqueList(tokens, 32).join(" ").trim();
}

export function applySkipToStep(state, stepKey) {
  if (stepKey === "topic") {
    state.draft.topic = "";
    return;
  }
  if (stepKey === "construct_type") {
    state.draft.construct_type = "";
    return;
  }

  const map = {
    purpose: "purpose",
    title: "title",
    attributes: "attributes",
    steps: "steps",
    rules: "rules",
    lookup_table: "lookup_table",
    examples: "examples",
    core_entities: "core_entities",
    tags: "tags",
    retrieval_keys: "retrieval_keys",
    trigger_phrases: "trigger_phrases",
    diagnostic: "attributes",
    specification: "attributes"
  };

  const key = map[stepKey];
  if (!key) return;
  state.draft[key] = null;
}

export function applyAttributesRowsToDraft(state) {
  state.draft.attributes = rowsToObject(state.ui.attributesRows);
}

export function applyLookupTextToDraft(state) {
  const parsed = safeJsonParse(state.ui.lookupJsonText);
  if (!parsed.ok) {
    state.ui.lookupJsonError = parsed.error ?? "Invalid JSON";
    return false;
  }
  state.ui.lookupJsonError = "";
  state.draft.lookup_table = parsed.value && typeof parsed.value === "object" ? parsed.value : {};
  return true;
}

export function applyDiagnosticToDraft(state) {
  const symptoms = uniqueList(state.ui.diagnostic.symptoms, 64);
  const causes = uniqueList(state.ui.diagnostic.causes, 64);
  const checks = uniqueList(state.ui.diagnostic.checks, 64);
  const next = state.draft.attributes && typeof state.draft.attributes === "object" && !Array.isArray(state.draft.attributes) ? { ...state.draft.attributes } : {};
  next.symptoms = symptoms;
  next.causes = causes;
  next.checks = checks;
  state.draft.attributes = next;
}

export function applySpecificationToDraft(state) {
  const filtered = (Array.isArray(state.ui.specification.rows) ? state.ui.specification.rows : [])
    .map((row) => ({ key: String(row?.key ?? "").trim(), value: String(row?.value ?? "").trim(), unit: String(row?.unit ?? "").trim() }))
    .filter((row) => row.key || row.value || row.unit)
    .slice(0, 64);
  const next = state.draft.attributes && typeof state.draft.attributes === "object" && !Array.isArray(state.draft.attributes) ? { ...state.draft.attributes } : {};
  next.specs = filtered;
  state.draft.attributes = next;
}

export function updateRecentDrafts(entry) {
  const stored = loadRecentDrafts();
  const next = [entry, ...stored.filter((item) => item?.id !== entry?.id)].slice(0, 20);
  try {
    window.localStorage.setItem("strandspace_recent_drafts_v1", JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

function loadRecentDrafts() {
  try {
    const raw = window.localStorage.getItem("strandspace_recent_drafts_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
