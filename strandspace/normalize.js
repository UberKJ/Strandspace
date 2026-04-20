import { normalizeText } from "./parser.js";

const QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "assist",
  "build",
  "can",
  "do",
  "for",
  "get",
  "help",
  "how",
  "i",
  "in",
  "is",
  "it",
  "let",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "recall",
  "remember",
  "settings",
  "setup",
  "show",
  "teach",
  "that",
  "the",
  "this",
  "to",
  "use",
  "want",
  "what",
  "which",
  "with"
]);

const NEGATIVE_CUE_TOKENS = new Set([
  "exclude",
  "excluding",
  "minus",
  "no",
  "not",
  "without"
]);

const GLOBAL_ALIAS_GROUPS = [
  {
    canonical: "room",
    terms: ["room", "rooms", "venue", "venues", "space", "spaces"]
  },
  {
    canonical: "playback",
    terms: ["playback", "track", "tracks", "backing track", "backing tracks", "music source", "music sources"]
  }
];

const SUBJECT_ALIAS_GROUPS = [
  {
    match: /music|sound|audio/i,
    groups: [
      {
        canonical: "vocal",
        terms: ["vocal", "vocals", "singer", "singers", "lead vocal", "lead vocals", "karaoke vocal", "karaoke vocals", "mic vocal", "vocal mic", "vocal mics"]
      },
      {
        canonical: "feedback",
        terms: ["feedback", "ringing", "ring out", "squeal", "howl"]
      },
      {
        canonical: "gain staging",
        terms: ["gain staging", "trim setup", "input gain", "signal level"]
      },
      {
        canonical: "reverb",
        terms: ["reverb", "verb", "fx", "effect", "effects"]
      }
    ]
  }
];

const BUILDER_FIELD_ALIASES = new Map([
  ["subject", "subjectLabel"],
  ["subject label", "subjectLabel"],
  ["subject name", "subjectLabel"],
  ["construct", "constructLabel"],
  ["construct label", "constructLabel"],
  ["name", "constructLabel"],
  ["title", "constructLabel"],
  ["target", "target"],
  ["focus", "target"],
  ["device", "target"],
  ["topic", "target"],
  ["objective", "objective"],
  ["goal", "objective"],
  ["use case", "objective"],
  ["notes", "notes"],
  ["summary", "notes"],
  ["tags", "tags"],
  ["keywords", "tags"]
]);

const BUILDER_CONTEXT_SECTION_KEYS = new Set([
  "context",
  "environment",
  "details"
]);

const BUILDER_STEPS_SECTION_KEYS = new Set([
  "steps",
  "checklist",
  "procedure",
  "process"
]);

const RELEVANCE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with"
]);

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function slugify(value = "") {
  return normalizeText(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || "strandspace-construct";
}

function humanize(value = "") {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeRelatedConstructIds(value, ownId = "") {
  const normalizedOwnId = String(ownId ?? "").trim();
  return [...new Set(
    normalizeArray(value)
      .map((item) => String(item ?? "").trim())
      .filter((item) => item && item !== normalizedOwnId)
  )].slice(0, 24);
}

function mergeUniqueArray(base = [], patch = [], limit = 12) {
  return [...new Set([
    ...normalizeArray(base),
    ...normalizeArray(patch)
  ])].slice(0, limit);
}

function normalizeSteps(value) {
  const steps = normalizeArray(value)
    .map((item) => item.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter(Boolean);

  return [...new Set(steps)].slice(0, 12);
}

function normalizeContext(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [String(key ?? "").trim(), String(item ?? "").trim()])
        .filter(([key, item]) => key && item)
        .slice(0, 12)
    );
  }

  if (typeof value !== "string") {
    return {};
  }

  const context = {};
  let detailIndex = 1;

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const pair = line.match(/^([^:]+):\s*(.+)$/);
    if (pair) {
      context[pair[1].trim()] = pair[2].trim();
      continue;
    }

    context[`detail ${detailIndex}`] = line;
    detailIndex += 1;
  }

  return context;
}

function mergeNotes(base = "", patch = "") {
  const baseText = String(base ?? "").trim();
  const patchText = String(patch ?? "").trim();

  if (!baseText) {
    return patchText;
  }
  if (!patchText) {
    return baseText;
  }

  const baseLower = baseText.toLowerCase();
  const patchLower = patchText.toLowerCase();

  if (baseLower.includes(patchLower)) {
    return baseText;
  }
  if (patchLower.includes(baseLower)) {
    return patchText;
  }

  return `${baseText}\n\n${patchText}`;
}

function deriveStrands({
  subjectId,
  constructLabel,
  target,
  objective,
  context,
  tags
}) {
  const strands = [
    `subject:${subjectId}`,
    constructLabel ? `construct:${slugify(constructLabel).replace(/-/g, "_")}` : null,
    target ? `target:${slugify(target).replace(/-/g, "_")}` : null,
    objective ? `objective:${slugify(objective).replace(/-/g, "_")}` : null,
    ...Object.entries(context ?? {}).flatMap(([key, value]) => {
      const normalizedKey = slugify(key).replace(/-/g, "_");
      const normalizedValue = slugify(value).replace(/-/g, "_");
      return [
        normalizedKey ? `context:${normalizedKey}` : null,
        normalizedKey && normalizedValue ? `${normalizedKey}:${normalizedValue}` : null
      ];
    }),
    ...normalizeArray(tags).map((tag) => `tag:${slugify(tag).replace(/-/g, "_")}`)
  ].filter(Boolean);

  return [...new Set(strands)].slice(0, 24);
}

function normalizeConstruct(payload = {}) {
  const subjectLabel = String(
    payload.subjectLabel
      ?? payload.subject
      ?? payload.subjectName
      ?? "General Recall"
  ).trim() || "General Recall";
  const subjectId = String(payload.subjectId ?? slugify(subjectLabel)).trim() || slugify(subjectLabel);
  const target = String(payload.target ?? payload.focus ?? payload.device ?? payload.topic ?? "").trim();
  const objective = String(payload.objective ?? payload.goal ?? payload.useCase ?? "").trim();
  const constructLabel = String(
    payload.constructLabel
      ?? payload.name
      ?? [target, objective].filter(Boolean).join(" - ")
      ?? "Untitled construct"
  ).trim() || "Untitled construct";
  const context = normalizeContext(payload.context ?? payload.contextText ?? payload.environment ?? {});
  const steps = normalizeSteps(payload.steps ?? payload.setup ?? payload.checklist ?? []);
  const notes = String(payload.notes ?? payload.summary ?? "").trim();
  const tags = [...new Set(normalizeArray(payload.tags ?? payload.keywords))].slice(0, 12);
  const strands = normalizeArray(payload.strands);
  const id = String(payload.id ?? `${subjectId}-${slugify(constructLabel)}`).trim();
  const parentConstructId = String(payload.parentConstructId ?? "").trim();
  const branchReason = String(payload.branchReason ?? "").trim();
  const changeSummary = String(payload.changeSummary ?? "").trim();
  const variantType = String(payload.variantType ?? "").trim();
  const provenance = payload.provenance && typeof payload.provenance === "object" ? payload.provenance : null;
  const relatedConstructIds = normalizeRelatedConstructIds(payload.relatedConstructIds, id);

  return {
    id,
    subjectId,
    subjectLabel,
    constructLabel,
    target,
    objective,
    context,
    steps,
    notes,
    tags,
    strands: strands.length
      ? [...new Set(strands.map((item) => String(item).trim()).filter(Boolean))].slice(0, 24)
      : deriveStrands({
        subjectId,
        constructLabel,
        target,
        objective,
        context,
        tags
      }),
    relatedConstructIds,
    parentConstructId: parentConstructId || null,
    branchReason: branchReason || null,
    changeSummary: changeSummary || null,
    variantType: variantType || null,
    provenance
  };
}


function buildSubjectStrandId(subjectId = "", strandKey = "") {
  return `strand:${subjectId || "global"}:${strandKey}`;
}

function clampConfidence(value, fallback = 0.72) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Number(clamp(parsed, 0.05, 0.99).toFixed(2));
}

function classifyStrandDescriptor(strandKey = "", label = "") {
  const normalizedKey = String(strandKey ?? "").trim().toLowerCase();
  const normalizedLabel = normalizeText(label);

  if (normalizedKey.startsWith("construct:")) {
    return { layer: "construct", role: "identity", weight: 1.45, confidence: 0.92 };
  }
  if (normalizedKey.startsWith("subject:")) {
    return { layer: "task", role: "subject", weight: 1.15, confidence: 0.88 };
  }
  if (normalizedKey.startsWith("target:")) {
    return { layer: "composite", role: "target", weight: 1.25, confidence: 0.82 };
  }
  if (normalizedKey.startsWith("objective:")) {
    return { layer: "task", role: "objective", weight: 1.12, confidence: 0.8 };
  }
  if (normalizedKey.startsWith("context:")) {
    return { layer: "context", role: "context", weight: 0.92, confidence: 0.76 };
  }
  if (normalizedKey.startsWith("tag:")) {
    return { layer: "anchor", role: "tag", weight: 0.84, confidence: 0.72 };
  }
  if (normalizedKey.startsWith("feature:")) {
    return normalizedLabel.includes(" ")
      ? { layer: "composite", role: "feature", weight: 1.04, confidence: 0.74 }
      : { layer: "anchor", role: "feature", weight: 0.9, confidence: 0.72 };
  }
  if (normalizedKey.includes(":")) {
    return { layer: "composite", role: "relation", weight: 1.02, confidence: 0.74 };
  }

  return normalizedLabel.includes(" ")
    ? { layer: "composite", role: "feature", weight: 1.0, confidence: 0.72 }
    : { layer: "anchor", role: "feature", weight: 0.86, confidence: 0.7 };
}

function createStrandDescriptor(subjectId = "", strandKey = "", label = "", meta = {}) {
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const normalizedStrandKey = String(strandKey ?? "").trim();
  const normalizedLabel = String(label ?? "").trim() || humanize(normalizedStrandKey.replace(/[:_]/g, " "));
  const classification = classifyStrandDescriptor(normalizedStrandKey, normalizedLabel);

  return {
    id: buildSubjectStrandId(normalizedSubjectId, normalizedStrandKey),
    subjectId: normalizedSubjectId,
    strandKey: normalizedStrandKey,
    label: normalizedLabel,
    normalizedLabel: normalizeText(normalizedLabel),
    layer: String(meta.layer ?? classification.layer),
    role: String(meta.role ?? classification.role),
    weight: Number(clamp(Number(meta.weight ?? classification.weight), -12, 12).toFixed(2)),
    confidence: clampConfidence(meta.confidence ?? classification.confidence),
    source: String(meta.source ?? "derived").trim() || "derived",
    provenance: meta.provenance && typeof meta.provenance === "object" ? meta.provenance : null
  };
}

function derivePersistentStrandDescriptors(record = {}, options = {}) {
  const normalizedSubjectId = String(record.subjectId ?? "").trim();
  const descriptors = [];
  const seen = new Set();
  const limit = Number(options.limit ?? 18) || 18;

  function pushDescriptor(descriptor) {
    if (!descriptor?.strandKey || seen.has(descriptor.strandKey) || descriptors.length >= limit) {
      return;
    }

    seen.add(descriptor.strandKey);
    descriptors.push(descriptor);
  }

  for (const strandKey of normalizeArray(record.strands)) {
    pushDescriptor(createStrandDescriptor(
      normalizedSubjectId,
      strandKey,
      humanize(String(strandKey ?? "").replace(/[:_]/g, " "))
    ));
  }

  for (const term of extractConstructConcepts(record, { limit: 8 })) {
    const normalizedTerm = String(term ?? "").trim();
    if (!normalizedTerm) {
      continue;
    }

    pushDescriptor(createStrandDescriptor(
      normalizedSubjectId,
      `feature:${slugify(normalizedTerm).replace(/-/g, "_")}`,
      normalizedTerm,
      {
        source: "derived-concept"
      }
    ));
  }

  return descriptors;
}

function lineLooksLikeListItem(value = "") {
  return /^\s*(?:[-*]|\d+\.)\s+/.test(String(value ?? ""));
}

function cleanListItem(value = "") {
  return String(value ?? "").replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim();
}

function toTitleCase(value = "") {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word === word.toUpperCase() && word.length <= 6) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function splitSentences(value = "") {
  return String(value ?? "")
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferConstructLabel({ constructLabel = "", target = "", subjectLabel = "", notes = "", genericLines = [] } = {}) {
  if (constructLabel) {
    return constructLabel;
  }

  if (target) {
    const normalizedTarget = String(target).trim().replace(/\bsetup\b/gi, "").replace(/\s+/g, " ").trim();
    return `${normalizedTarget || target} recall`;
  }

  const candidate = splitSentences([notes, ...genericLines].join(" "))[0] ?? "";
  if (candidate) {
    const trimmed = candidate
      .replace(/^(?:use|build|create|draft)\s+/i, "")
      .split(/\s+/)
      .slice(0, 8)
      .join(" ");
    return `${toTitleCase(trimmed)} recall`;
  }

  return `${subjectLabel || "General Recall"} construct`;
}

function inferTarget({ target = "", notes = "", genericLines = [] } = {}) {
  if (target) {
    return target;
  }

  const haystack = [notes, ...genericLines].join(" ").replace(/\s+/g, " ").trim();
  if (!haystack) {
    return "";
  }

  const patterns = [
    /\b(?:for|target(?:ing)?|focus(?:ed)? on)\s+([^.;:]+)/i,
    /\b(?:setup|scene|preset)\s+for\s+([^.;:]+)/i,
    /\bon\s+([^.;:]+?)(?:\s+(?:in|with|under|during)\b|[.;:]|$)/i
  ];

  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function inferObjective({ objective = "", notes = "", genericLines = [] } = {}) {
  if (objective) {
    return objective;
  }

  const haystack = [notes, ...genericLines].join(" ").replace(/\s+/g, " ").trim();
  if (!haystack) {
    return "";
  }

  const patterns = [
    /\b(?:goal|objective|so that|to)\s+([^.;:]+)/i,
    /\b(?:use this when|best for)\s+([^.;:]+)/i
  ];

  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

export function buildSubjectConstructDraftFromInput(input = "", options = {}) {
  const raw = String(input ?? "").trim();
  const subjectLabelOption = String(options.subjectLabel ?? options.subject ?? "").trim();
  const subjectIdOption = String(options.subjectId ?? "").trim();
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const draft = {
    subjectLabel: subjectLabelOption,
    subjectId: subjectIdOption,
    constructLabel: "",
    target: "",
    objective: "",
    notes: "",
    tags: [],
    context: {},
    steps: []
  };
  const genericLines = [];
  let activeSection = "";

  for (const line of lines) {
    const pair = line.match(/^([^:]+):\s*(.*)$/);

    if (pair) {
      const rawKey = pair[1].trim();
      const normalizedKey = normalizeText(rawKey);
      const value = pair[2].trim();

      if (BUILDER_CONTEXT_SECTION_KEYS.has(normalizedKey)) {
        activeSection = "context";
        if (value) {
          draft.context = {
            ...draft.context,
            ...normalizeContext(value)
          };
        }
        continue;
      }

      if (BUILDER_STEPS_SECTION_KEYS.has(normalizedKey)) {
        activeSection = "steps";
        if (value) {
          draft.steps = [...draft.steps, ...normalizeSteps(value)];
        }
        continue;
      }

      activeSection = "";

      const mappedField = BUILDER_FIELD_ALIASES.get(normalizedKey);
      if (mappedField === "subjectLabel") {
        draft.subjectLabel = value || draft.subjectLabel;
        continue;
      }
      if (mappedField === "constructLabel") {
        draft.constructLabel = value || draft.constructLabel;
        continue;
      }
      if (mappedField === "target") {
        draft.target = value || draft.target;
        continue;
      }
      if (mappedField === "objective") {
        draft.objective = value || draft.objective;
        continue;
      }
      if (mappedField === "notes") {
        draft.notes = [draft.notes, value].filter(Boolean).join(" ").trim();
        continue;
      }
      if (mappedField === "tags") {
        draft.tags = [...draft.tags, ...normalizeArray(value)];
        continue;
      }

      draft.context[rawKey] = value;
      continue;
    }

    if (activeSection === "steps" || lineLooksLikeListItem(line)) {
      draft.steps.push(cleanListItem(line));
      continue;
    }

    if (activeSection === "context") {
      draft.context[`detail ${Object.keys(draft.context).length + 1}`] = line;
      continue;
    }

    genericLines.push(line);
  }

  draft.subjectLabel = draft.subjectLabel || subjectLabelOption || "Custom Subject";
  draft.target = inferTarget({
    target: draft.target,
    notes: draft.notes,
    genericLines
  });
  draft.objective = inferObjective({
    objective: draft.objective,
    notes: draft.notes,
    genericLines
  });

  if (!draft.notes && genericLines.length) {
    draft.notes = genericLines.join(" ");
  }

  draft.constructLabel = inferConstructLabel({
    constructLabel: draft.constructLabel,
    target: draft.target,
    subjectLabel: draft.subjectLabel,
    notes: draft.notes,
    genericLines
  });

  if (!draft.tags.length) {
    draft.tags = tokenize([
      draft.subjectLabel,
      draft.constructLabel,
      draft.target,
      draft.objective
    ].filter(Boolean).join(" "))
      .filter((token) => token.length > 3)
      .slice(0, 6);
  }

  return normalizeConstruct({
    ...draft,
    subjectId: draft.subjectId || undefined,
    provenance: {
      source: "builder-heuristic",
      learnedFromQuestion: raw || null
    }
  });
}

export function mergeSubjectConstruct(basePayload = {}, patchPayload = {}, options = {}) {
  const base = normalizeConstruct(basePayload);
  const patchId = String(patchPayload.id ?? "").trim();
  const patchSubjectId = String(patchPayload.subjectId ?? "").trim();
  const patchSubjectLabel = String(
    patchPayload.subjectLabel
      ?? patchPayload.subject
      ?? patchPayload.subjectName
      ?? ""
  ).trim();
  const patchConstructLabel = String(
    patchPayload.constructLabel
      ?? patchPayload.name
      ?? ""
  ).trim();
  const patchTarget = String(
    patchPayload.target
      ?? patchPayload.focus
      ?? patchPayload.device
      ?? patchPayload.topic
      ?? ""
  ).trim();
  const patchObjective = String(
    patchPayload.objective
      ?? patchPayload.goal
      ?? patchPayload.useCase
      ?? ""
  ).trim();
  const patchContext = normalizeContext(patchPayload.context ?? patchPayload.contextText ?? patchPayload.environment ?? {});
  const patchSteps = normalizeSteps(patchPayload.steps ?? patchPayload.setup ?? patchPayload.checklist ?? []);
  const patchNotes = String(patchPayload.notes ?? patchPayload.summary ?? "").trim();
  const patchTags = normalizeArray(patchPayload.tags ?? patchPayload.keywords);
  const patchStrands = normalizeArray(patchPayload.strands);
  const patchRelatedConstructIds = normalizeRelatedConstructIds(
    patchPayload.relatedConstructIds,
    String(base.id ?? patchPayload.id ?? "").trim()
  );
  const patchParentConstructId = String(patchPayload.parentConstructId ?? "").trim();
  const patchBranchReason = String(patchPayload.branchReason ?? "").trim();
  const patchChangeSummary = String(patchPayload.changeSummary ?? "").trim();
  const patchVariantType = String(patchPayload.variantType ?? "").trim();
  const preserveId = options.preserveId !== false;
  const baseProvenance = base.provenance && typeof base.provenance === "object" ? base.provenance : null;
  const patchProvenance = patchPayload.provenance && typeof patchPayload.provenance === "object" ? patchPayload.provenance : null;

  return normalizeConstruct({
    ...base,
    id: preserveId
      ? (base.id || patchId || undefined)
      : (patchId || base.id || undefined),
    subjectId: patchSubjectId || base.subjectId,
    subjectLabel: patchSubjectLabel || base.subjectLabel,
    constructLabel: patchConstructLabel || base.constructLabel,
    target: patchTarget || base.target,
    objective: patchObjective || base.objective,
    context: {
      ...(base.context ?? {}),
      ...patchContext
    },
    steps: mergeUniqueArray(base.steps, patchSteps, 12),
    notes: mergeNotes(base.notes, patchNotes),
    tags: mergeUniqueArray(base.tags, patchTags, 12),
    strands: patchStrands.length
      ? mergeUniqueArray(base.strands, patchStrands, 24)
      : base.strands,
    relatedConstructIds: patchRelatedConstructIds.length
      ? mergeUniqueArray(base.relatedConstructIds, patchRelatedConstructIds, 24)
      : base.relatedConstructIds,
    parentConstructId: patchParentConstructId || base.parentConstructId || null,
    branchReason: patchBranchReason || base.branchReason || null,
    changeSummary: patchChangeSummary || base.changeSummary || null,
    variantType: patchVariantType || base.variantType || null,
    provenance: options.provenance
      ?? (patchProvenance
        ? {
          ...(baseProvenance ?? {}),
          ...patchProvenance
        }
        : baseProvenance)
  });
}

export function ingestConversationToConstructs(input = {}, options = {}) {
  const messages = buildConversationMessages(input?.messages ?? input?.transcript ?? input);
  const subjectLabelOption = String(input?.subjectLabel ?? options.subjectLabel ?? "").trim();
  const subjectIdOption = String(input?.subjectId ?? options.subjectId ?? "").trim();
  if (!messages.length) {
    return [];
  }

  const transcript = messages
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join("\n");
  const drafts = [];
  const assistantDraftBlocks = messages
    .filter((entry) => entry.role === "assistant")
    .map((entry) => entry.content)
    .filter((content) => /subject\s*:|target\s*:|objective\s*:|steps\s*:|context\s*:/i.test(content));

  const blocks = assistantDraftBlocks.length ? assistantDraftBlocks : [transcript];
  for (const block of blocks) {
    const draft = buildSubjectConstructDraftFromInput(block, {
      subjectLabel: subjectLabelOption || "Conversation Memory",
      subjectId: subjectIdOption || undefined
    });
    drafts.push(mergeSubjectConstruct(draft, {
      provenance: {
        source: "conversation-ingest",
        learnedFromQuestion: transcript
      }
    }, {
      preserveId: false,
      provenance: {
        ...(draft.provenance ?? {}),
        source: "conversation-ingest",
        learnedFromQuestion: transcript
      }
    }));
  }

  return drafts.filter((draft, index, all) => (
    all.findIndex((candidate) => candidate.subjectId === draft.subjectId && candidate.constructLabel === draft.constructLabel) === index
  ));
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !QUERY_STOPWORDS.has(token));
}

function escapeRegExp(value = "") {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystack = "", term = "") {
  const normalizedHaystack = String(haystack ?? "").trim();
  const normalizedTerm = String(term ?? "").trim();
  if (!normalizedHaystack || !normalizedTerm) {
    return false;
  }

  return new RegExp(`(^|\\s)${escapeRegExp(normalizedTerm)}(?=\\s|$)`).test(normalizedHaystack);
}

function expressesAbsence(haystack = "", term = "") {
  const normalizedHaystack = String(haystack ?? "").trim();
  const normalizedTerm = String(term ?? "").trim();
  if (!normalizedHaystack || !normalizedTerm) {
    return false;
  }

  return new RegExp(`(^|\\s)(?:no|without|minus|exclude|excluding|not)(?:\\s+for)?\\s+${escapeRegExp(normalizedTerm)}(?=\\s|$)`).test(normalizedHaystack);
}

function uniqueValues(items = []) {
  return [...new Set(
    items
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
  )];
}

function buildPhrases(tokens = [], maxSize = 3) {
  const normalizedTokens = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  const phrases = [];

  for (let size = 2; size <= maxSize; size += 1) {
    for (let index = 0; index <= normalizedTokens.length - size; index += 1) {
      phrases.push(normalizedTokens.slice(index, index + size).join(" "));
    }
  }

  return uniqueValues(phrases);
}

function resolveAliasGroups(subjectId = "") {
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const groups = [...GLOBAL_ALIAS_GROUPS];

  for (const entry of SUBJECT_ALIAS_GROUPS) {
    if (!normalizedSubjectId || entry.match.test(normalizedSubjectId)) {
      groups.push(...entry.groups);
    }
  }

  return groups.map((group) => ({
    canonical: normalizeText(group.canonical ?? ""),
    terms: uniqueValues((group.terms ?? []).map((term) => normalizeText(term)))
  }));
}

function expandAliasTerms(normalizedQuery = "", subjectId = "") {
  const aliasTerms = [];
  const seen = new Set();

  for (const group of resolveAliasGroups(subjectId)) {
    const matchedSources = group.terms.filter((term) => containsTerm(normalizedQuery, term));
    if (!matchedSources.length) {
      continue;
    }

    for (const source of matchedSources) {
      for (const term of group.terms) {
        if (!term || term === source) {
          continue;
        }

        const key = `${source}=>${term}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        aliasTerms.push({
          source,
          term,
          canonical: group.canonical || term,
          kind: term.includes(" ") ? "phrase" : "token"
        });
      }
    }
  }

  return aliasTerms;
}

function extractNegativeCues(normalized = "", subjectId = "") {
  const tokens = String(normalized ?? "").split(/\s+/).filter(Boolean);
  const cues = [];
  const seen = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    if (!NEGATIVE_CUE_TOKENS.has(tokens[index])) {
      continue;
    }

    const excludedTokens = [];
    for (let pointer = index + 1; pointer < tokens.length && excludedTokens.length < 3; pointer += 1) {
      const candidate = tokens[pointer];
      if (!candidate || NEGATIVE_CUE_TOKENS.has(candidate)) {
        break;
      }
      if ((candidate === "for" || QUERY_STOPWORDS.has(candidate)) && excludedTokens.length === 0) {
        continue;
      }

      excludedTokens.push(candidate);
      const next = tokens[pointer + 1] ?? "";
      if (!next || NEGATIVE_CUE_TOKENS.has(next) || (QUERY_STOPWORDS.has(next) && excludedTokens.length >= 1)) {
        break;
      }
    }

    const phrase = excludedTokens.join(" ").trim();
    if (!phrase || seen.has(phrase)) {
      continue;
    }

    seen.add(phrase);
    cues.push({
      cue: phrase,
      source: tokens[index],
      tokens: uniqueValues(excludedTokens.filter((token) => !QUERY_STOPWORDS.has(token))),
      aliasTerms: expandAliasTerms(phrase, subjectId)
    });
  }

  return cues;
}

function normalizeBinderTerm(value = "") {
  const normalized = normalizeText(String(value ?? "").replace(/[:_]/g, " "));
  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length > 1 && !QUERY_STOPWORDS.has(token) && !NEGATIVE_CUE_TOKENS.has(token));

  return tokens.slice(0, 4).join(" ").trim();
}

function normalizeBinderPair(leftTerm = "", rightTerm = "") {
  const normalizedLeft = normalizeBinderTerm(leftTerm);
  const normalizedRight = normalizeBinderTerm(rightTerm);

  if (!normalizedLeft || !normalizedRight || normalizedLeft === normalizedRight) {
    return null;
  }

  return [normalizedLeft, normalizedRight].sort((left, right) => left.localeCompare(right));
}

function buildStrandBinderId(subjectId = "", leftTerm = "", rightTerm = "") {
  const subjectKey = String(subjectId ?? "").trim() || "global";
  return `binder:${subjectKey}:${leftTerm}=>${rightTerm}`;
}

function buildConstructLinkId(sourceConstructId = "", relatedConstructId = "") {
  return `link:${String(sourceConstructId ?? "").trim()}=>${String(relatedConstructId ?? "").trim()}`;
}

function pushUniqueTerm(list, seen, term, limit = 24) {
  const normalized = normalizeBinderTerm(term);
  if (!normalized || seen.has(normalized) || list.length >= limit) {
    return;
  }

  seen.add(normalized);
  list.push(normalized);
}

function extractConceptTermsFromText(value = "", options = {}) {
  const limit = Number(options.limit ?? 8) || 8;
  const terms = [];
  const seen = new Set();
  const normalized = normalizeBinderTerm(value);

  if (normalized) {
    pushUniqueTerm(terms, seen, normalized, limit);
  }

  const tokens = tokenize(value)
    .filter((token) => token.length > 2)
    .slice(0, limit);
  for (const token of tokens) {
    pushUniqueTerm(terms, seen, token, limit);
  }

  const phrases = buildPhrases(tokens, 2).slice(0, limit);
  for (const phrase of phrases) {
    pushUniqueTerm(terms, seen, phrase, limit);
  }

  return terms;
}

function extractConstructConcepts(record = {}, options = {}) {
  const limit = Number(options.limit ?? 20) || 20;
  const terms = [];
  const seen = new Set();
  const sources = [
    record.constructLabel,
    record.target,
    record.objective,
    ...(record.tags ?? []),
    ...(record.steps ?? []).slice(0, 4),
    ...Object.values(record.context ?? {}),
    ...(record.strands ?? []).map((strand) => String(strand ?? "").replace(/[:_]/g, " "))
  ];

  for (const source of sources) {
    for (const term of extractConceptTermsFromText(source, {
      limit: 6
    })) {
      pushUniqueTerm(terms, seen, term, limit);
    }
  }

  return terms;
}

function extractParsedConcepts(parsed = {}, options = {}) {
  const limit = Number(options.limit ?? 20) || 20;
  const terms = [];
  const seen = new Set();
  const sources = [
    ...(parsed.keywords ?? []),
    ...(parsed.phrases ?? []),
    ...((parsed.aliasTerms ?? []).flatMap((alias) => [alias.source, alias.term, alias.canonical])),
    ...((parsed.exclusions ?? []).flatMap((entry) => [entry.cue, ...(entry.tokens ?? []), ...((entry.aliasTerms ?? []).map((alias) => alias.term))]))
  ];

  for (const source of sources) {
    pushUniqueTerm(terms, seen, source, limit);
  }

  return terms;
}


function buildConversationMessages(input = null) {
  if (Array.isArray(input)) {
    return input
      .map((entry, index) => ({
        role: String(entry?.role ?? (index % 2 === 0 ? "user" : "assistant")).trim().toLowerCase() || "user",
        content: String(entry?.content ?? entry?.message ?? "").trim()
      }))
      .filter((entry) => entry.content);
  }

  const transcript = String(input ?? "").trim();
  if (!transcript) {
    return [];
  }

  return transcript
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(user|assistant|system)\s*:\s*(.+)$/i);
      if (match) {
        return {
          role: String(match[1] ?? "user").trim().toLowerCase(),
          content: String(match[2] ?? "").trim()
        };
      }

      return {
        role: "user",
        content: line
      };
    });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function parseSubjectQuestion(question = "", subjectId = "") {
  const raw = String(question ?? "").trim();
  const normalized = normalizeText(raw);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const exclusions = extractNegativeCues(normalized, subjectId);
  const excludedTokens = new Set(exclusions.flatMap((entry) => entry.tokens ?? []));
  const keywords = tokens.filter((token) => !QUERY_STOPWORDS.has(token) && !NEGATIVE_CUE_TOKENS.has(token) && !excludedTokens.has(token));
  const phrases = buildPhrases(keywords);
  const aliasTerms = expandAliasTerms(normalized, subjectId).filter((entry) => !excludedTokens.has(entry.source) && !excludedTokens.has(entry.term));

  return {
    raw,
    normalized,
    tokens,
    keywords,
    phrases,
    aliasTerms,
    exclusions,
    subjectId: String(subjectId ?? "").trim(),
    intent: /\bcompare\b|\bvs\b|\bversus\b/.test(normalized) ? "compare" : "recall"
  };
}

export {
  buildConstructLinkId,
  buildStrandBinderId,
  clamp,
  clampConfidence,
  containsTerm,
  derivePersistentStrandDescriptors,
  escapeRegExp,
  expressesAbsence,
  extractConceptTermsFromText,
  extractConstructConcepts,
  extractNegativeCues,
  extractParsedConcepts,
  humanize,
  normalizeArray,
  normalizeBinderPair,
  normalizeBinderTerm,
  normalizeConstruct,
  normalizeRelatedConstructIds,
  safeJsonParse,
  slugify,
  tokenize,
  uniqueValues
};
