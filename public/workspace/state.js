import { buildStepSequence, CONSTRUCT_TYPES, typeLabel } from "./schema.js";
import {
  objectToRows,
  parseCommaList,
  parseEntityList,
  rowsToObject,
  tokenize,
  uniqueList
} from "./utils.js";
import {
  detectSubjectProfile,
  fieldHasValue,
  isProfileDraftComplete,
  missingProfileFields,
  titleForProfile
} from "./profiles.js";

const storageKey = "strandspace_workspace_state_v1";

export function createDefaultState() {
  return {
    theme: "dark",
    flags: {
      debug: false
    },
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
      lookup: {
        sections: [{ name: "", rows: [{ key: "", value: "" }] }]
      },
      intake: {
        analysis: null,
        error: "",
        fieldSuggestion: null,
        suggestionAttempt: 0,
        lastTopic: "",
        ignoreStrongMatch: false,
        typePickerOpen: false,
        typeConfirmed: false
      },
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
      flags: {
        debug: Boolean(state.flags?.debug)
      },
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
  state.flags = {
    debug: Boolean(stored.flags?.debug)
  };
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

  state.ui.lookup.sections = lookupTableToSections(state.draft.lookup_table);

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

export function hydrateLookupEditor(state) {
  state.ui.lookup.sections = lookupTableToSections(state.draft.lookup_table);
  if (!Array.isArray(state.ui.lookup.sections) || state.ui.lookup.sections.length === 0) {
    state.ui.lookup.sections = [{ name: "", rows: [{ key: "", value: "" }] }];
  }
}

export function stepSequence(state) {
  if (state.flags?.debug) {
    return buildStepSequence(state.draft.construct_type || "");
  }

  return buildGuidedStepSequence(state);
}

function mapInferenceKindToStep(kind = "") {
  const k = String(kind ?? "").trim();
  if (k === "offer_match") return "reuse_match";
  if (k === "confirm_type") return "construct_type";
  if (k === "ask_purpose") return "purpose";
  if (k === "ask_entities") return "core_entities";
  if (k === "ask_lookup") return "lookup_table";
  if (k === "ask_steps") return "steps";
  if (k === "ask_attributes") return "attributes";
  if (k === "ask_rules") return "rules";
  if (k === "ask_examples") return "examples";
  return "";
}

function shouldAskReuseMatch(state) {
  if (state.ui?.intake?.ignoreStrongMatch) return false;
  const matched = state.ui?.intake?.analysis?.recall?.matched ?? null;
  const ready = Boolean(state.ui?.intake?.analysis?.recall?.ready);
  return Boolean(ready && matched && String(matched?.id ?? "").trim());
}

function shouldAskStep(state, key) {
  const draft = state.draft ?? {};
  const nulls = new Set(Array.isArray(draft.null_fields) ? draft.null_fields : []);
  if (nulls.has(key)) return false;
  if ((key === "diagnostic" || key === "specification") && nulls.has("attributes")) return false;

  if (key === "reuse_match") return shouldAskReuseMatch(state);
  if (key === "construct_type") return !Boolean(state.ui?.intake?.typeConfirmed);

  if (key === "purpose") return !String(draft.purpose ?? "").trim();
  if (key === "core_entities") return !(Array.isArray(draft.core_entities) && draft.core_entities.filter(Boolean).length);

  if (key === "lookup_table") {
    return !(draft.lookup_table && typeof draft.lookup_table === "object" && !Array.isArray(draft.lookup_table) && Object.keys(draft.lookup_table).length);
  }

  if (key === "steps") return !(Array.isArray(draft.steps) && draft.steps.filter(Boolean).length);
  if (key === "attributes") return !(draft.attributes && typeof draft.attributes === "object" && !Array.isArray(draft.attributes) && Object.keys(draft.attributes).length);
  if (key === "diagnostic") {
    const symptoms = Array.isArray(draft.attributes?.symptoms) ? draft.attributes.symptoms.filter(Boolean).length : 0;
    const checks = Array.isArray(draft.attributes?.checks) ? draft.attributes.checks.filter(Boolean).length : 0;
    const causes = Array.isArray(draft.attributes?.causes) ? draft.attributes.causes.filter(Boolean).length : 0;
    return symptoms + checks + causes === 0;
  }
  if (key === "specification") {
    const rows = Array.isArray(draft.attributes?.specs) ? draft.attributes.specs : [];
    return rows.filter((row) => row?.key || row?.value || row?.unit).length === 0;
  }

  if (key === "rules") return !(Array.isArray(draft.rules) && draft.rules.filter(Boolean).length);
  if (key === "examples") return !(Array.isArray(draft.examples) && draft.examples.filter(Boolean).length);
  if (key === "tags") return !(Array.isArray(draft.tags) && draft.tags.filter(Boolean).length);
  if (key === "retrieval_keys") return !(Array.isArray(draft.retrieval_keys) && draft.retrieval_keys.filter(Boolean).length);
  if (key === "trigger_phrases") return !(Array.isArray(draft.trigger_phrases) && draft.trigger_phrases.filter(Boolean).length);
  if (key === "linked_construct_ids") return !(Array.isArray(draft.linked_construct_ids) && draft.linked_construct_ids.filter(Boolean).length);
  if (key === "title") return canSuggestTitle(state) && !String(draft.title ?? "").trim();

  return false;
}

function essentialStepsForType(type = "") {
  const t = String(type ?? "").trim();
  if (t === "reference_lookup" || t === "classification") return ["lookup_table"];
  if (t === "procedure" || t === "timeline") return ["steps"];
  if (t === "diagnostic") return ["diagnostic"];
  if (t === "specification") return ["specification"];
  if (t === "configuration" || t === "profile" || t === "comparison") return ["attributes"];
  return ["attributes"];
}

function buildGuidedStepSequence(state) {
  const steps = ["topic"];
  const topic = String(state.draft?.topic ?? "").trim();
  if (!topic) return steps;

  const inference = state.ui?.intake?.analysis?.inference ?? null;
  const preferred = mapInferenceKindToStep(inference?.next_question_kind);
  if (preferred && preferred !== "topic" && shouldAskStep(state, preferred) && !steps.includes(preferred)) {
    steps.push(preferred);
  }

  const add = (key) => {
    if (!steps.includes(key) && shouldAskStep(state, key)) steps.push(key);
  };

  add("reuse_match");
  add("construct_type");
  add("purpose");
  add("core_entities");

  const profile = detectSubjectProfile(state.draft);
  if (profile?.required?.length) {
    for (const key of profile.required) add(key);
  }

  const type = String(state.draft?.construct_type ?? "").trim() || String(inference?.construct_type ?? "").trim();
  for (const key of essentialStepsForType(type)) add(key);

  add("rules");

  return steps;
}

function lookupTableToSections(table) {
  const normalized = table && typeof table === "object" && !Array.isArray(table) ? table : {};
  const entries = Object.entries(normalized);

  const sections = [];
  const flatRows = [];

  for (const [key, value] of entries) {
    const k = String(key ?? "").trim();
    if (!k) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const rows = Object.entries(value).map(([innerKey, innerValue]) => ({
        key: String(innerKey ?? "").trim(),
        value: innerValue === null || innerValue === undefined ? "" : String(innerValue)
      })).filter((row) => row.key || row.value);
      sections.push({ name: k, rows: rows.length ? rows : [{ key: "", value: "" }] });
    } else {
      flatRows.push({ key: k, value: value === null || value === undefined ? "" : String(value) });
    }
  }

  if (flatRows.length) {
    sections.unshift({ name: "", rows: flatRows });
  }

  if (sections.length === 0) {
    return [{ name: "", rows: [{ key: "", value: "" }] }];
  }

  return sections.map((section) => ({
    name: String(section?.name ?? ""),
    rows: Array.isArray(section?.rows) && section.rows.length ? section.rows : [{ key: "", value: "" }]
  }));
}

function parseLookupValue(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function sectionsToLookupTable(sections) {
  const normalized = Array.isArray(sections) ? sections : [];
  const out = {};

  for (const section of normalized) {
    const name = String(section?.name ?? "").trim();
    const rows = Array.isArray(section?.rows) ? section.rows : [];

    const entries = Object.fromEntries(
      rows
        .map((row) => [String(row?.key ?? "").trim(), String(row?.value ?? "").trim()])
        .filter(([key, value]) => key && value)
        .slice(0, 80)
        .map(([key, value]) => [key, parseLookupValue(value)])
    );

    if (Object.keys(entries).length === 0) {
      continue;
    }

    if (name) {
      out[name] = entries;
    } else {
      Object.assign(out, entries);
    }
  }

  return out;
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
  if (stepKey === "reuse_match") {
    state.ui.intake.ignoreStrongMatch = true;
    return;
  }

  if (stepKey === "topic") {
    state.draft.topic = "";
    return;
  }
  if (stepKey === "construct_type") {
    if (!String(state.draft.construct_type ?? "").trim()) {
      state.draft.construct_type = "hybrid";
    }
    state.ui.intake.typeConfirmed = true;
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
    linked_construct_ids: "linked_construct_ids",
    diagnostic: "attributes",
    specification: "attributes"
  };

  const key = map[stepKey];
  if (!key) return;
  state.draft[key] = null;
  const list = Array.isArray(state.draft.null_fields) ? state.draft.null_fields : [];
  state.draft.null_fields = uniqueList([...list, key], 64);
}

export function applyAttributesRowsToDraft(state) {
  state.draft.attributes = rowsToObject(state.ui.attributesRows);
}

export function applyLookupSectionsToDraft(state) {
  state.draft.lookup_table = sectionsToLookupTable(state.ui.lookup?.sections);
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

export function activeSubjectProfile(state) {
  return detectSubjectProfile(state.draft);
}

export function missingRequiredFields(state) {
  return missingProfileFields(state.draft);
}

export function isDraftComplete(state) {
  return isProfileDraftComplete(state.draft);
}

export function isFieldComplete(state, key) {
  return fieldHasValue(state.draft, key);
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
