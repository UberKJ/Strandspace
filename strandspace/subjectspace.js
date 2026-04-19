import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const defaultSubjectSeedsPath = join(__dirname, "..", "data", "subject-seeds.json");
export const releaseSubjectSeedsPath = join(__dirname, "..", "data", "release-subject-seeds.json");
const READY_THRESHOLD = 34;
const PARTIAL_READY_MULTIPLIER = 0.55;
const LINK_SIMILARITY_THRESHOLD = 0.2;
const MERGE_SIMILARITY_THRESHOLD = 0.68;
const MAX_BINDER_BONUS = 10;
const MAX_LINK_REINFORCEMENT = 8;

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
    provenance
  };
}

function collectConstructAnchorTerms(construct = {}) {
  const record = normalizeConstruct(construct);
  const anchorCandidates = [
    record.constructLabel,
    record.target,
    record.objective,
    record.notes,
    ...normalizeArray(record.tags),
    ...Object.entries(record.context ?? {}).flatMap(([key, value]) => [key, value, `${key} ${value}`]),
    ...normalizeArray(record.strands).map((strand) => humanize(String(strand ?? "").replace(/[:_]/g, " ")))
  ];

  return uniqueValues(anchorCandidates)
    .map((item) => ({
      raw: String(item ?? "").trim(),
      normalized: normalizeText(item)
    }))
    .filter((item) => item.raw && item.normalized)
    .filter((item) => item.normalized.split(/\s+/).some((token) => token && !RELEVANCE_STOPWORDS.has(token)));
}

export function buildConstructRelevanceSummary(construct = {}) {
  const record = normalizeConstruct(construct);
  const contextCount = Object.keys(record.context ?? {}).length;
  const stepsCount = normalizeArray(record.steps).length;
  const tagsCount = normalizeArray(record.tags).length;
  const strandsCount = normalizeArray(record.strands).length;
  const relatedCount = normalizeArray(record.relatedConstructIds).length;
  const anchors = collectConstructAnchorTerms(record)
    .slice(0, 10)
    .map((item) => item.raw);
  const uniqueAnchorCount = anchors.length;

  let score = 0;
  score += record.constructLabel ? 12 : 0;
  score += record.target ? 12 : 0;
  score += record.objective ? 12 : 0;
  score += Math.min(24, stepsCount * 4.5);
  score += Math.min(14, contextCount * 3.5);
  score += Math.min(12, tagsCount * 3);
  score += Math.min(8, uniqueAnchorCount * 1.4);
  score += Math.min(6, relatedCount * 2);
  score += record.notes ? 10 : 0;
  score = Number(clamp(score, 0, 100).toFixed(1));

  const issues = [];
  const strengths = [];
  if (!record.target) {
    issues.push("Missing target");
  } else {
    strengths.push("clear target");
  }
  if (!record.objective) {
    issues.push("Missing objective");
  } else {
    strengths.push("clear objective");
  }
  if (!stepsCount) {
    issues.push("No working steps");
  } else if (stepsCount < 3) {
    issues.push("Thin step coverage");
    strengths.push("has working steps");
  } else {
    strengths.push("strong step coverage");
  }
  if (!contextCount) {
    issues.push("No context fields");
  } else {
    strengths.push("context attached");
  }
  if (!tagsCount) {
    issues.push("No tags");
  } else {
    strengths.push("tagged for recall");
  }
  if (!record.notes) {
    issues.push("No notes");
  }
  if (uniqueAnchorCount < 4) {
    issues.push("Low semantic anchor variety");
  } else {
    strengths.push("good semantic anchors");
  }
  if (relatedCount > 0) {
    strengths.push("linked to related constructs");
  }

  return {
    score,
    status: score >= 78 ? "strong" : score >= 58 ? "usable" : "thin",
    coverageRatio: Number((score / 100).toFixed(2)),
    anchors: anchors.slice(0, 8),
    counts: {
      context: contextCount,
      steps: stepsCount,
      tags: tagsCount,
      strands: strandsCount,
      related: relatedCount
    },
    issues: uniqueValues(issues),
    strengths: uniqueValues(strengths).slice(0, 5)
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

function fromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    constructLabel: row.constructLabel,
    target: row.target,
    objective: row.objective,
    context: safeJsonParse(row.contextJson, {}),
    steps: safeJsonParse(row.stepsJson, []),
    notes: row.notes,
    tags: safeJsonParse(row.tagsJson, []),
    strands: safeJsonParse(row.strandsJson, []),
    relatedConstructIds: normalizeRelatedConstructIds(safeJsonParse(row.relatedConstructIdsJson, []), row.id),
    provenance: safeJsonParse(row.provenanceJson, null),
    learnedCount: Number(row.learnedCount ?? 1),
    updatedAt: row.updatedAt
  };
}

function binderFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    subjectId: row.subjectId || "",
    leftTerm: row.leftTerm,
    rightTerm: row.rightTerm,
    weight: Number(row.weight ?? 0),
    reason: row.reason || "",
    source: row.source || "manual",
    updatedAt: row.updatedAt
  };
}

function linkFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sourceConstructId: row.sourceConstructId,
    relatedConstructId: row.relatedConstructId,
    score: Number(row.score ?? 0),
    reason: row.reason || "",
    detail: safeJsonParse(row.detailJson, {}),
    updatedAt: row.updatedAt
  };
}

function subjectStrandFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    subjectId: row.subjectId,
    strandKey: row.strandKey,
    label: row.label,
    normalizedLabel: row.normalizedLabel,
    layer: row.layer,
    role: row.role,
    weight: Number(row.weight ?? 0),
    confidence: Number(row.confidence ?? 0),
    source: row.source || "derived",
    usageCount: Number(row.usageCount ?? 0),
    constructCount: Number(row.constructCount ?? 0),
    lastUsedAt: row.lastUsedAt || null,
    provenance: safeJsonParse(row.provenanceJson, null),
    updatedAt: row.updatedAt
  };
}

function constructStrandFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    constructId: row.constructId,
    subjectId: row.subjectId,
    strandId: row.strandId,
    strandKey: row.strandKey,
    label: row.label || humanize(String(row.strandKey ?? "").replace(/[:_]/g, " ")),
    normalizedLabel: row.normalizedLabel || normalizeText(row.label || row.strandKey),
    layer: row.layer,
    role: row.role,
    weight: Number(row.weight ?? 0),
    confidence: Number(row.confidence ?? 0),
    source: row.source || "derived",
    usageCount: Number(row.usageCount ?? 0),
    constructCount: Number(row.constructCount ?? 0),
    lastUsedAt: row.lastUsedAt || null,
    updatedAt: row.updatedAt
  };
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

function intersectionRatio(leftValues = [], rightValues = []) {
  const left = new Set(uniqueValues(leftValues).map((value) => normalizeBinderTerm(value)).filter(Boolean));
  const right = new Set(uniqueValues(rightValues).map((value) => normalizeBinderTerm(value)).filter(Boolean));

  if (!left.size || !right.size) {
    return 0;
  }

  let matches = 0;
  for (const value of left) {
    if (right.has(value)) {
      matches += 1;
    }
  }

  return Number((matches / Math.max(left.size, right.size)).toFixed(2));
}

function scoreBinderBridge(leftTerms = [], rightTerms = [], binders = []) {
  const left = new Set(leftTerms.map((term) => normalizeBinderTerm(term)).filter(Boolean));
  const right = new Set(rightTerms.map((term) => normalizeBinderTerm(term)).filter(Boolean));
  const hits = [];
  let score = 0;

  if (!left.size || !right.size || !binders.length) {
    return {
      score: 0,
      hits
    };
  }

  for (const binder of binders) {
    const leftHit = left.has(binder.leftTerm) && right.has(binder.rightTerm);
    const rightHit = left.has(binder.rightTerm) && right.has(binder.leftTerm);
    if (!leftHit && !rightHit) {
      continue;
    }

    const weight = Number(binder.weight ?? 0);
    if (!weight) {
      continue;
    }

    score += weight;
    hits.push({
      leftTerm: binder.leftTerm,
      rightTerm: binder.rightTerm,
      weight,
      source: binder.source,
      reason: binder.reason
    });
  }

  return {
    score: Number(score.toFixed(2)),
    hits: hits.slice(0, 6)
  };
}

function computeConstructSimilarity(candidate = {}, existing = {}, binders = []) {
  const candidateTags = normalizeArray(candidate.tags);
  const existingTags = normalizeArray(existing.tags);
  const candidateStrands = normalizeArray(candidate.strands);
  const existingStrands = normalizeArray(existing.strands);
  const candidateContext = Object.entries(candidate.context ?? {}).map(([key, value]) => `${key}: ${value}`);
  const existingContext = Object.entries(existing.context ?? {}).map(([key, value]) => `${key}: ${value}`);
  const candidateTerms = extractConstructConcepts(candidate, { limit: 24 });
  const existingTerms = extractConstructConcepts(existing, { limit: 24 });
  const lexical = intersectionRatio(candidateTerms, existingTerms);
  const tagOverlap = intersectionRatio(candidateTags, existingTags);
  const strandOverlap = intersectionRatio(candidateStrands, existingStrands);
  const contextOverlap = intersectionRatio(candidateContext, existingContext);
  const targetOverlap = intersectionRatio([candidate.target, candidate.constructLabel], [existing.target, existing.constructLabel]);
  const binderBridge = scoreBinderBridge(candidateTerms, existingTerms, binders);
  const binderBonus = Math.min(Math.max(binderBridge.score, -4), 6) / 12;
  const score = clamp(
    (lexical * 0.36)
    + (tagOverlap * 0.2)
    + (strandOverlap * 0.18)
    + (contextOverlap * 0.12)
    + (targetOverlap * 0.22)
    + (binderBonus * 0.12),
    0,
    1
  );
  const reasons = [];

  if (targetOverlap >= 0.6) {
    reasons.push("shared target or construct anchor");
  }
  if (tagOverlap >= 0.34) {
    reasons.push("shared tags");
  }
  if (strandOverlap >= 0.3) {
    reasons.push("shared strands");
  }
  if (contextOverlap >= 0.25) {
    reasons.push("shared context");
  }
  if (binderBridge.hits.some((hit) => Number(hit.weight ?? 0) > 0)) {
    reasons.push("positive binder reinforcement");
  }
  if (binderBridge.hits.some((hit) => Number(hit.weight ?? 0) < 0)) {
    reasons.push("negative binder suppression");
  }

  return {
    score: Number(score.toFixed(2)),
    reason: reasons[0] ?? "lexical overlap",
    detail: {
      lexical,
      tagOverlap,
      strandOverlap,
      contextOverlap,
      targetOverlap,
      binderScore: Number(binderBridge.score ?? 0),
      binderHits: binderBridge.hits
    }
  };
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

function buildNeedles(record) {
  const contextEntries = Object.entries(record.context ?? {});

  return {
    label: normalizeText(record.constructLabel),
    target: normalizeText(record.target),
    objective: normalizeText(record.objective),
    notes: normalizeText(record.notes),
    steps: (record.steps ?? []).map((step) => normalizeText(step)),
    contextKeys: contextEntries.map(([key]) => normalizeText(key)),
    contextValues: contextEntries.map(([, value]) => normalizeText(value)),
    tags: (record.tags ?? []).map((tag) => normalizeText(tag)),
    strands: (record.strands ?? []).map((strand) => normalizeText(strand.replace(/[:_]/g, " ")))
  };
}

function buildFieldEntries(record, needles = buildNeedles(record)) {
  return [
    {
      key: "construct",
      label: "construct",
      summary: record.constructLabel,
      haystacks: [needles.label],
      weights: {
        token: 15,
        aliasToken: 10,
        phrase: 23,
        aliasPhrase: 17,
        exclusion: 18
      }
    },
    {
      key: "target",
      label: "target",
      summary: record.target,
      haystacks: [needles.target],
      weights: {
        token: 13,
        aliasToken: 9,
        phrase: 21,
        aliasPhrase: 15,
        exclusion: 16
      }
    },
    {
      key: "objective",
      label: "objective",
      summary: record.objective,
      haystacks: [needles.objective],
      weights: {
        token: 11,
        aliasToken: 8,
        phrase: 18,
        aliasPhrase: 13,
        exclusion: 15
      }
    },
    ...Object.entries(record.context ?? {}).map(([key, value], index) => ({
      key: `context:${key}:${index}`,
      label: `context:${key}`,
      summary: `${key}: ${value}`,
      haystacks: [normalizeText(`${key} ${value}`), normalizeText(value)],
      weights: {
        token: 9,
        aliasToken: 6,
        phrase: 14,
        aliasPhrase: 10,
        exclusion: 12
      }
    })),
    ...(record.tags ?? []).map((tag, index) => ({
      key: `tag:${index}`,
      label: "tag",
      summary: tag,
      haystacks: [normalizeText(tag)],
      weights: {
        token: 8,
        aliasToken: 5,
        phrase: 16,
        aliasPhrase: 12,
        exclusion: 14
      }
    })),
    ...(record.strands ?? []).map((strand, index) => ({
      key: `strand:${index}`,
      label: "strand",
      summary: strand,
      haystacks: [normalizeText(String(strand ?? "").replace(/[:_]/g, " "))],
      weights: {
        token: 7,
        aliasToken: 5,
        phrase: 15,
        aliasPhrase: 11,
        exclusion: 14
      }
    })),
    ...(record.steps ?? []).map((step, index) => ({
      key: `step:${index}`,
      label: "step",
      summary: step,
      haystacks: [normalizeText(step)],
      weights: {
        token: 4,
        aliasToken: 3,
        phrase: 8,
        aliasPhrase: 6,
        exclusion: 10
      }
    })),
    {
      key: "notes",
      label: "notes",
      summary: record.notes,
      haystacks: [needles.notes],
      weights: {
        token: 4,
        aliasToken: 3,
        phrase: 7,
        aliasPhrase: 5,
        exclusion: 10
      }
    }
  ].filter((entry) => entry.summary && entry.haystacks.some(Boolean));
}

function upsertSupportHit(supportMap, entry, payload = {}) {
  const existing = supportMap.get(entry.key) ?? {
    label: entry.label,
    summary: entry.summary,
    tokens: [],
    aliasHits: [],
    phraseHits: [],
    excludedHits: [],
    totalWeight: 0
  };

  const next = {
    ...existing,
    tokens: uniqueValues([...(existing.tokens ?? []), ...(payload.tokens ?? [])]),
    aliasHits: [...(existing.aliasHits ?? [])],
    phraseHits: [...(existing.phraseHits ?? [])],
    excludedHits: [...(existing.excludedHits ?? [])],
    totalWeight: Number(existing.totalWeight ?? 0) + Number(payload.weight ?? 0)
  };

  for (const item of payload.aliasHits ?? []) {
    if (!next.aliasHits.some((candidate) => candidate.source === item.source && candidate.term === item.term)) {
      next.aliasHits.push(item);
    }
  }

  for (const item of payload.phraseHits ?? []) {
    if (!next.phraseHits.some((candidate) => candidate.phrase === item.phrase && candidate.via === item.via && candidate.source === item.source)) {
      next.phraseHits.push(item);
    }
  }

  for (const item of payload.excludedHits ?? []) {
    if (!next.excludedHits.some((candidate) => candidate.cue === item.cue && candidate.term === item.term)) {
      next.excludedHits.push(item);
    }
  }

  supportMap.set(entry.key, next);
}

function findStrongestFieldMatch(entries = [], term = "", kind = "token") {
  let strongest = null;

  for (const entry of entries) {
    if (!entry?.haystacks?.some((haystack) => containsTerm(haystack, term))) {
      continue;
    }

    const weight = Number(entry.weights?.[kind] ?? 0);
    if (!weight) {
      continue;
    }

    if (!strongest || weight > strongest.weight) {
      strongest = {
        entry,
        weight
      };
    }
  }

  return strongest;
}

function findStrongestExclusionMatch(entries = [], exclusionCue = "", term = "") {
  let strongest = null;

  for (const entry of entries) {
    const matchedHaystack = entry?.haystacks?.find((haystack) => containsTerm(haystack, term));
    if (!matchedHaystack) {
      continue;
    }

    if (expressesAbsence(matchedHaystack, exclusionCue) || expressesAbsence(matchedHaystack, term)) {
      continue;
    }

    const weight = Number(entry.weights?.exclusion ?? 0);
    if (!weight) {
      continue;
    }

    if (!strongest || weight > strongest.weight) {
      strongest = {
        entry,
        weight
      };
    }
  }

  return strongest;
}

function scoreBinderAlignment(record, parsed, binders = []) {
  const queryTerms = extractParsedConcepts(parsed, { limit: 20 });
  const recordTerms = extractConstructConcepts(record, { limit: 24 });
  const querySet = new Set(queryTerms);
  const recordSet = new Set(recordTerms);
  const hits = [];
  let bonus = 0;

  if (!querySet.size || !recordSet.size || !binders.length) {
    return {
      score: 0,
      hits
    };
  }

  for (const binder of binders) {
    const queryHasLeft = querySet.has(binder.leftTerm);
    const queryHasRight = querySet.has(binder.rightTerm);
    const recordHasLeft = recordSet.has(binder.leftTerm);
    const recordHasRight = recordSet.has(binder.rightTerm);

    if (!queryHasLeft && !queryHasRight) {
      continue;
    }

    if (!recordHasLeft && !recordHasRight) {
      continue;
    }

    let contribution = 0;
    let mode = "bridge";
    const weight = Number(binder.weight ?? 0);
    if (!weight) {
      continue;
    }

    if (queryHasLeft && queryHasRight && recordHasLeft && recordHasRight) {
      contribution = weight * 1.15;
      mode = "full-pair";
    } else if ((queryHasLeft && recordHasRight) || (queryHasRight && recordHasLeft)) {
      contribution = weight * 0.82;
      mode = "cross-pair";
    } else if ((queryHasLeft || queryHasRight) && recordHasLeft && recordHasRight) {
      contribution = weight * 0.68;
      mode = "construct-pair";
    }

    if (!contribution) {
      continue;
    }

    bonus += contribution;
    hits.push({
      leftTerm: binder.leftTerm,
      rightTerm: binder.rightTerm,
      weight: Number(weight.toFixed(2)),
      contribution: Number(contribution.toFixed(2)),
      mode,
      source: binder.source,
      reason: binder.reason
    });
  }

  return {
    score: Number(clamp(bonus, -MAX_BINDER_BONUS, MAX_BINDER_BONUS).toFixed(2)),
    hits: hits
      .sort((left, right) => Math.abs(Number(right.contribution ?? 0)) - Math.abs(Number(left.contribution ?? 0)))
      .slice(0, 6)
  };
}

function scoreConstruct(record, parsed, options = {}) {
  const needles = buildNeedles(record);
  const entries = buildFieldEntries(record, needles);
  let score = 0;
  const matchedTokens = new Set();
  const matchedSources = new Set();
  const matchedPhrases = new Set();
  const aliasHits = [];
  const phraseHits = [];
  const excludedHits = [];
  const binderHits = [];
  const supportMap = new Map();

  function recordPositiveMatch(match, payload = {}) {
    if (!match?.entry || !match.weight) {
      return false;
    }

    score += match.weight;
    upsertSupportHit(supportMap, match.entry, {
      weight: match.weight,
      tokens: payload.tokens ?? [],
      aliasHits: payload.aliasHits ?? [],
      phraseHits: payload.phraseHits ?? []
    });
    return true;
  }

  if (parsed.subjectId && record.subjectId === parsed.subjectId) {
    score += 26;
  }

  if (parsed.normalized && containsTerm(needles.label, parsed.normalized)) {
    score += 36;
  }

  for (const token of parsed.keywords) {
    const match = findStrongestFieldMatch(entries, token, "token");
    if (!recordPositiveMatch(match, {
      tokens: [token]
    })) {
      continue;
    }

    matchedTokens.add(token);
    matchedSources.add(token);
  }

  for (const phrase of parsed.phrases ?? []) {
    const match = findStrongestFieldMatch(entries, phrase, "phrase");
    if (!recordPositiveMatch(match, {
      phraseHits: [
        {
          phrase,
          via: "direct",
          source: phrase
        }
      ]
    })) {
      continue;
    }

    matchedPhrases.add(phrase);
    matchedSources.add(phrase);
    phraseHits.push({
      phrase,
      via: "direct",
      source: phrase,
      field: match.entry.label
    });
  }

  for (const alias of parsed.aliasTerms ?? []) {
    const match = findStrongestFieldMatch(entries, alias.term, alias.kind === "phrase" ? "aliasPhrase" : "aliasToken");
    if (!recordPositiveMatch(match, {
      aliasHits: [
        {
          source: alias.source,
          term: alias.term,
          canonical: alias.canonical
        }
      ],
      phraseHits: alias.kind === "phrase"
        ? [
          {
            phrase: alias.term,
            via: "alias",
            source: alias.source
          }
        ]
        : []
    })) {
      continue;
    }

    matchedSources.add(alias.source);
    aliasHits.push({
      source: alias.source,
      term: alias.term,
      canonical: alias.canonical,
      field: match.entry.label
    });

    if (alias.kind === "phrase") {
      matchedPhrases.add(alias.source);
      phraseHits.push({
        phrase: alias.term,
        via: "alias",
        source: alias.source,
        field: match.entry.label
      });
    }
  }

  for (const exclusion of parsed.exclusions ?? []) {
    let strongestPenalty = null;
    const exclusionTerms = [
      {
        term: exclusion.cue,
        via: "direct"
      },
      ...((exclusion.aliasTerms ?? []).map((alias) => ({
        term: alias.term,
        via: "alias"
      }))),
      ...(exclusion.tokens ?? []).map((token) => ({
        term: token,
        via: "direct"
      }))
    ];

    for (const candidate of exclusionTerms) {
      const match = findStrongestExclusionMatch(entries, exclusion.cue, candidate.term);
      if (!match) {
        continue;
      }

      const penalty = Number(match.weight + (candidate.term.includes(" ") ? 3 : 0) - (candidate.via === "alias" ? 2 : 0));
      if (!strongestPenalty || penalty > strongestPenalty.penalty) {
        strongestPenalty = {
          ...match,
          penalty,
          term: candidate.term,
          via: candidate.via
        };
      }
    }

    if (!strongestPenalty) {
      continue;
    }

    score -= strongestPenalty.penalty;
    const exclusionHit = {
      cue: exclusion.cue,
      term: strongestPenalty.term,
      via: strongestPenalty.via,
      penalty: strongestPenalty.penalty,
      field: strongestPenalty.entry.label
    };
    excludedHits.push(exclusionHit);
    upsertSupportHit(supportMap, strongestPenalty.entry, {
      weight: -strongestPenalty.penalty,
      excludedHits: [exclusionHit]
    });
  }

  const binderAlignment = scoreBinderAlignment(record, parsed, options.binders ?? []);
  if (binderAlignment.score) {
    score += binderAlignment.score;
  }
  for (const hit of binderAlignment.hits) {
    binderHits.push(hit);
    upsertSupportHit(supportMap, {
      key: `binder:${hit.leftTerm}:${hit.rightTerm}`,
      label: "binder",
      summary: `${hit.leftTerm} <-> ${hit.rightTerm}`,
      haystacks: [],
      weights: {}
    }, {
      weight: hit.contribution,
      phraseHits: [{
        phrase: `${hit.leftTerm} + ${hit.rightTerm}`,
        via: hit.mode,
        source: hit.source
      }]
    });
  }

  const matchedKeywordCount = parsed.keywords.filter((token) => matchedSources.has(token)).length;
  const matchedPhraseCount = (parsed.phrases ?? []).filter((phrase) => matchedSources.has(phrase)).length;
  const cueWeightTotal = (parsed.keywords.length || 0) + ((parsed.phrases?.length ?? 0) * 1.35);
  const cueWeightMatched = matchedKeywordCount + (matchedPhraseCount * 1.35);

  if (cueWeightTotal > 0) {
    score += Number(((cueWeightMatched / cueWeightTotal) * 18).toFixed(2));
  }

  if (record.learnedCount > 1) {
    score += Math.min(record.learnedCount, 8);
  }

  return {
    score: Number(score.toFixed(2)),
    support: [...supportMap.values()]
      .sort((left, right) => Number(right.totalWeight ?? 0) - Number(left.totalWeight ?? 0))
      .slice(0, 8)
      .map(({ totalWeight, ...entry }) => entry),
    matchedTokens: [...matchedTokens],
    matchedSources: [...matchedSources],
    matchedRatio: Number((cueWeightTotal > 0 ? cueWeightMatched / cueWeightTotal : 0).toFixed(2)),
    aliasHits,
    phraseHits,
    excludedHits,
    binderHits
  };
}

function buildTrace(record, parsed, candidates = []) {
  const contextEntries = Object.entries(record?.context ?? {});
  const aliasPreview = (record?.aliasHits ?? []).slice(0, 4);
  const phrasePreview = (record?.phraseHits ?? []).slice(0, 4);
  const binderPreview = (record?.binderHits ?? []).slice(0, 4);
  const linkPreview = (record?.linkHits ?? []).slice(0, 4);
  const persistentStrands = (record?.constructStrands ?? []).slice(0, 8);
  const activatedStrands = (record?.activatedStrands ?? []).slice(0, 8);
  const exclusionPreview = [
    ...((parsed.exclusions ?? []).map((entry) => ({
      cue: entry.cue,
      penalty: null
    }))),
    ...((record?.excludedHits ?? []).map((entry) => ({
      cue: entry.cue,
      penalty: entry.penalty
    })))
  ]
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.cue === entry.cue) === index)
    .slice(0, 4);

  return {
    triggerStrands: [
      {
        kind: "trigger",
        name: parsed.intent,
        detail: parsed.intent === "compare" ? "Comparison request" : "Recall request"
      },
      parsed.subjectId
        ? {
          kind: "trigger",
          name: `subject:${parsed.subjectId}`,
          detail: record?.subjectLabel ?? humanize(parsed.subjectId)
        }
        : null,
      ...parsed.keywords.slice(0, 4).map((token) => ({
        kind: "trigger",
        name: token,
        detail: "query cue"
      }))
    ].filter(Boolean),
    aliasStrands: aliasPreview.map((entry) => ({
      kind: "alias",
      name: entry.source,
      value: `matched via ${entry.term}`
    })),
    binderStrands: binderPreview.map((entry) => ({
      kind: "binder",
      name: `${entry.leftTerm} + ${entry.rightTerm}`,
      value: `${entry.contribution > 0 ? "reinforced" : "suppressed"} by ${entry.contribution.toFixed(2)}`
    })),
    phraseStrands: phrasePreview.map((entry) => ({
      kind: "phrase",
      name: entry.source ?? entry.phrase,
      value: entry.via === "alias"
        ? `phrase matched through alias ${entry.phrase}`
        : `phrase matched as ${entry.phrase}`
    })),
    anchorStrands: [
      record?.target
        ? {
          kind: "anchor",
          name: "target",
          value: record.target
        }
        : null,
      record?.objective
        ? {
          kind: "anchor",
          name: "objective",
          value: record.objective
        }
        : null,
      ...contextEntries.slice(0, 5).map(([key, value]) => ({
        kind: "anchor",
        name: key,
        value
      }))
    ].filter(Boolean),
    compositeStrands: [
      record
        ? {
          kind: "composite",
          name: record.constructLabel,
          value: `${record.subjectLabel} construct`
        }
        : null,
      ...(record?.tags ?? []).slice(0, 4).map((tag) => ({
        kind: "composite",
        name: tag,
        value: "tagged memory"
      }))
    ].filter(Boolean),
    exclusionStrands: exclusionPreview.map((entry) => ({
      kind: "exclude",
      name: entry.cue,
      value: entry.penalty ? `penalized ${entry.penalty.toFixed(1)} points` : "excluded cue detected"
    })),
    stabilizedMemory: candidates.slice(0, 4).map((candidate, index) => ({
      kind: "memory",
      name: candidate.constructLabel,
      score: candidate.score,
      role: index === 0 ? "winner" : "contender"
    })),
    linkedStrands: linkPreview.map((entry) => ({
      kind: "link",
      name: entry.constructLabel,
      value: `reinforced by ${entry.reinforcement.toFixed(2)} from a ${entry.reason || "related"} construct`
    })),
    persistentStrands: persistentStrands.map((entry) => ({
      kind: "persistent",
      name: entry.label,
      value: `${entry.layer}/${entry.role} weight ${Number(entry.weight ?? 0).toFixed(2)}`
    })),
    activatedStrands: activatedStrands.map((entry) => ({
      kind: "activated",
      name: entry.label,
      value: entry.reason || `${entry.layer}/${entry.role} strand activated`
    })),
    expressionField: record
      ? `Triggers from the question docked into ${record.constructLabel}, using ${record.subjectLabel} anchors to emit a reusable answer construct.`
      : "No construct crossed the stability threshold yet, so the expression field stayed unresolved."
  };
}

function buildRecallAnswer(record) {
  const contextSummary = Object.entries(record.context ?? {})
    .slice(0, 4)
    .map(([key, value]) => `${humanize(key)}: ${value}`)
    .join(" | ");

  return [
    `Strandspace recalled "${record.constructLabel}" in ${record.subjectLabel}.`,
    record.objective ? `Use it when the goal is ${record.objective}.` : null,
    contextSummary ? `Context: ${contextSummary}.` : null,
    record.notes ? record.notes : null
  ]
    .filter(Boolean)
    .join(" ");
}

function stripTrailingRecall(label = "") {
  const normalized = String(label ?? "").trim();
  return normalized.replace(/\brecall\b\s*$/i, "").trim() || normalized;
}

function preferredContextValues(context = {}) {
  const entries = Object.entries(context ?? {})
    .map(([key, value]) => [String(key ?? "").trim().toLowerCase(), String(value ?? "").trim()])
    .filter(([, value]) => value);
  const ordered = [];
  const seen = new Set();
  const preferredKeys = [
    "room",
    "show type",
    "environment",
    "camera",
    "console",
    "source",
    "key light",
    "monitor"
  ];

  for (const key of preferredKeys) {
    for (const [entryKey, value] of entries) {
      if (entryKey !== key || seen.has(value)) {
        continue;
      }
      ordered.push(value);
      seen.add(value);
    }
  }

  for (const [, value] of entries) {
    if (seen.has(value)) {
      continue;
    }
    ordered.push(value);
    seen.add(value);
  }

  return ordered;
}

function uniqueQueryTokens(values = []) {
  const tokens = [];
  const seen = new Set();

  for (const value of values) {
    for (const token of tokenize(value)) {
      if (seen.has(token)) {
        continue;
      }
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

export function estimateTextTokens(value = "") {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function buildSubjectBenchmarkQuestionCandidates(record = {}, parsed = {}) {
  const constructLabel = stripTrailingRecall(record.constructLabel);
  const target = String(record.target ?? "").trim();
  const objectiveTokens = tokenize(record.objective).slice(0, 2).join(" ");
  const contextValues = preferredContextValues(record.context).slice(0, 2);
  const parsedKeywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
  const alignedTokens = uniqueQueryTokens([
    constructLabel,
    target,
    ...contextValues,
    parsedKeywords.join(" ")
  ]).slice(0, 6).join(" ");
  const candidates = [];

  function pushCandidate(question = "") {
    const normalized = String(question ?? "").trim().replace(/\s+/g, " ");
    if (!normalized || candidates.includes(normalized)) {
      return;
    }
    candidates.push(normalized);
  }

  if (constructLabel) {
    pushCandidate(`Recall ${constructLabel}.`);
  }
  if (alignedTokens) {
    pushCandidate(`Recall ${alignedTokens}.`);
  }
  if (target) {
    pushCandidate(`Recall ${target}.`);
  }
  if (constructLabel && target && normalizeText(constructLabel) !== normalizeText(target)) {
    pushCandidate(`Recall ${constructLabel} for ${target}.`);
  }
  if (target && contextValues[0]) {
    pushCandidate(`Recall ${target} in ${contextValues[0]}.`);
  }
  if (constructLabel && contextValues[0]) {
    pushCandidate(`Recall ${constructLabel} in ${contextValues[0]}.`);
  }
  if (target && objectiveTokens) {
    pushCandidate(`Recall ${target} for ${objectiveTokens}.`);
  }

  return candidates.sort((left, right) => (
    estimateTextTokens(left) - estimateTextTokens(right)
    || left.length - right.length
    || left.localeCompare(right)
  ));
}

function buildUnresolvedAnswer(parsed, candidates = [], libraryCount = 0) {
  if (!candidates.length) {
    return libraryCount > 0
      ? `No stable Strandspace memory formed for "${parsed.raw}". Teach a sharper construct or tighten the prompt so the field has a stronger anchor next time.`
      : `No constructs are stored for this subject yet. Teach one strong construct with target, objective, context, and steps, and Strandspace will start recalling it from partial cues.`;
  }

  const hints = candidates
    .slice(0, 3)
    .map((candidate) => candidate.constructLabel)
    .join(", ");

  return `Strandspace found partial overlap for "${parsed.raw}", but the field still needs either a stronger local construct or a tighter prompt before it can emit a trusted answer. Closest constructs: ${hints}.`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildAssistPrompt({
  parsed,
  matched,
  subjectLabel,
  missingKeywords = []
}) {
  if (!parsed.raw) {
    return "";
  }

  const lead = matched
    ? `Use the local construct "${matched.constructLabel}" as the baseline for ${subjectLabel}.`
    : `Create a first-pass construct for ${subjectLabel}.`;
  const missing = missingKeywords.length
    ? `Prioritize the missing cues: ${missingKeywords.join(", ")}.`
    : "Resolve any gaps or ambiguity that the local field could not settle on.";
  const contextHint = matched?.target
    ? `Target: ${matched.target}.`
    : "";

  return `${lead} The user asked: "${parsed.raw}". ${contextHint} ${missing} Return only actionable setup details that can be learned back into Strandspace.`
    .replace(/\s+/g, " ")
    .trim();
}

function buildRouting(parsed, ranked = [], constructs = []) {
  const matched = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const score = Number(matched?.score ?? 0);
  const margin = Number(Math.max(score - Number(second?.score ?? 0), 0).toFixed(2));
  const matchedRatio = Number(matched?.matchedRatio ?? 0);
  const scoreRatio = Number(clamp(score / READY_THRESHOLD, 0, 1.8).toFixed(2));
  const confidence = matched
    ? Number(clamp((scoreRatio * 0.46) + (matchedRatio * 0.4) + (Math.min(margin, 18) / 18) * 0.14, 0.08, 0.98).toFixed(2))
    : Number(clamp(constructs.length ? 0.12 : 0.05, 0, 0.2).toFixed(2));
  const missingKeywords = matched
    ? parsed.keywords.filter((token) => !(matched.matchedSources ?? []).includes(token))
    : parsed.keywords.slice(0, 6);

  if (!matched) {
    return {
      mode: "teach_local",
      label: "Teach Strandspace first",
      confidence,
      margin,
      matchedRatio,
      apiRecommended: false,
      reason: constructs.length
        ? "No stored construct aligned closely enough with the question."
        : "This subject field is still empty, so there is nothing local to recall.",
      nextAction: "Store one strong construct with target, objective, context, and steps before using API assistance.",
      promptDraft: "",
      missingKeywords,
      exclusions: (parsed.exclusions ?? []).map((entry) => entry.cue)
    };
  }

  if (score >= READY_THRESHOLD && matchedRatio >= 0.72 && margin >= 8) {
    return {
      mode: "local_recall",
      label: "Local recall is stable",
      confidence,
      margin,
      matchedRatio,
      apiRecommended: false,
      reason: matched.excludedHits?.length
        ? "The top construct still won locally, but it had to work around one or more excluded cues."
        : "The top construct is clearly ahead and most query cues were satisfied locally.",
      nextAction: "Use the recalled construct as-is, then tighten it with more examples if you want even faster recall later.",
      promptDraft: "",
      missingKeywords,
      exclusions: (parsed.exclusions ?? []).map((entry) => entry.cue)
    };
  }

  if (score >= READY_THRESHOLD) {
    return {
      mode: "api_validate",
      label: "Local recall works, but validate the edge cases",
      confidence,
      margin,
      matchedRatio,
      apiRecommended: true,
      reason: matched.excludedHits?.length
        ? "Strandspace found a usable construct, but excluded cues or narrow overlap mean the edge cases should be validated."
        : "Strandspace found a usable construct, but the overlap is narrow or the winning margin is small.",
      nextAction: "Use the local answer as the baseline and let an API validate or expand only the uncertain parts.",
      promptDraft: buildAssistPrompt({
        parsed,
        matched,
        subjectLabel: matched.subjectLabel,
        missingKeywords
      }),
      missingKeywords,
      exclusions: (parsed.exclusions ?? []).map((entry) => entry.cue)
    };
  }

  if (score >= READY_THRESHOLD * PARTIAL_READY_MULTIPLIER) {
    return {
      mode: "api_expand",
      label: "Partial recall found, good moment for API assist",
      confidence,
      margin,
      matchedRatio,
      apiRecommended: true,
      reason: "There is enough local memory to guide an API, but not enough to emit a trusted answer alone.",
      nextAction: "Ask an API to expand the partial construct, then learn the validated result back into Strandspace.",
      promptDraft: buildAssistPrompt({
        parsed,
        matched,
        subjectLabel: matched.subjectLabel,
        missingKeywords
      }),
      missingKeywords,
      exclusions: (parsed.exclusions ?? []).map((entry) => entry.cue)
    };
  }

  return {
    mode: "teach_local",
    label: "Teach another local example first",
    confidence,
    margin,
    matchedRatio,
    apiRecommended: false,
    reason: "The local overlap is too thin to justify external expansion yet.",
    nextAction: "Capture one more concrete example for this subject so future API use has a better local anchor.",
    promptDraft: "",
    missingKeywords,
    exclusions: (parsed.exclusions ?? []).map((entry) => entry.cue)
  };
}

export function ensureSubjectspaceTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subject_constructs (
      id TEXT PRIMARY KEY,
      subjectId TEXT NOT NULL,
      subjectLabel TEXT NOT NULL,
      constructLabel TEXT NOT NULL,
      target TEXT,
      objective TEXT,
      contextJson TEXT NOT NULL,
      stepsJson TEXT NOT NULL,
      notes TEXT,
      tagsJson TEXT NOT NULL,
      strandsJson TEXT NOT NULL,
      provenanceJson TEXT,
      relatedConstructIdsJson TEXT,
      learnedCount INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_subject ON subject_constructs(subjectId, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_label ON subject_constructs(constructLabel);
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_updated ON subject_constructs(updatedAt DESC);
    CREATE TABLE IF NOT EXISTS strand_binders (
      id TEXT PRIMARY KEY,
      subjectId TEXT NOT NULL DEFAULT '',
      leftTerm TEXT NOT NULL,
      rightTerm TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0,
      reason TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_strand_binders_pair ON strand_binders(subjectId, leftTerm, rightTerm);
    CREATE INDEX IF NOT EXISTS idx_strand_binders_subject ON strand_binders(subjectId, updatedAt DESC);
    CREATE TABLE IF NOT EXISTS construct_links (
      id TEXT PRIMARY KEY,
      sourceConstructId TEXT NOT NULL,
      relatedConstructId TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      reason TEXT,
      detailJson TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_construct_links_pair ON construct_links(sourceConstructId, relatedConstructId);
    CREATE INDEX IF NOT EXISTS idx_construct_links_source ON construct_links(sourceConstructId, score DESC);
    CREATE TABLE IF NOT EXISTS subject_strands (
      id TEXT PRIMARY KEY,
      subjectId TEXT NOT NULL,
      strandKey TEXT NOT NULL,
      label TEXT NOT NULL,
      normalizedLabel TEXT NOT NULL,
      layer TEXT NOT NULL DEFAULT 'anchor',
      role TEXT NOT NULL DEFAULT 'feature',
      weight REAL NOT NULL DEFAULT 1,
      confidence REAL NOT NULL DEFAULT 0.72,
      source TEXT NOT NULL DEFAULT 'derived',
      usageCount INTEGER NOT NULL DEFAULT 0,
      constructCount INTEGER NOT NULL DEFAULT 0,
      lastUsedAt TEXT,
      provenanceJson TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_strands_subject_key ON subject_strands(subjectId, strandKey);
    CREATE INDEX IF NOT EXISTS idx_subject_strands_subject_usage ON subject_strands(subjectId, usageCount DESC, constructCount DESC, updatedAt DESC);
    CREATE TABLE IF NOT EXISTS construct_strands (
      id TEXT PRIMARY KEY,
      constructId TEXT NOT NULL,
      subjectId TEXT NOT NULL,
      strandId TEXT NOT NULL,
      strandKey TEXT NOT NULL,
      layer TEXT NOT NULL DEFAULT 'anchor',
      role TEXT NOT NULL DEFAULT 'feature',
      weight REAL NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'derived',
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_construct_strands_pair ON construct_strands(constructId, strandId);
    CREATE INDEX IF NOT EXISTS idx_construct_strands_construct ON construct_strands(constructId, weight DESC, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_construct_strands_subject ON construct_strands(subjectId, updatedAt DESC);
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      subjectId TEXT,
      title TEXT,
      metadataJson TEXT,
      createdAt TEXT NOT NULL,
      lastMessageAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(lastMessageAt DESC);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      subjectId TEXT,
      constructId TEXT,
      metadataJson TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversationId, createdAt ASC);
  `);

  const columns = db.prepare("PRAGMA table_info(subject_constructs)").all();
  if (!columns.some((column) => column.name === "relatedConstructIdsJson")) {
    db.exec("ALTER TABLE subject_constructs ADD COLUMN relatedConstructIdsJson TEXT;");
  }
}

export function seedSubjectspace(db, filePath = defaultSubjectSeedsPath) {
  ensureSubjectspaceTables(db);
  const count = Number(db.prepare("SELECT COUNT(*) as count FROM subject_constructs").get().count ?? 0);
  if (count > 0) {
    return count;
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  for (const item of raw) {
    upsertSubjectConstruct(db, {
      ...item,
      provenance: {
        source: "seed",
        importedFrom: filePath
      }
    });
  }

  return Number(db.prepare("SELECT COUNT(*) as count FROM subject_constructs").get().count ?? 0);
}

export function listSubjectSpaces(db) {
  ensureSubjectspaceTables(db);

  return db.prepare(`
    SELECT
      subjectId,
      subjectLabel,
      COUNT(*) as constructCount,
      MAX(updatedAt) as updatedAt
    FROM subject_constructs
    GROUP BY subjectId, subjectLabel
    ORDER BY subjectLabel ASC
  `).all().map((row) => ({
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    constructCount: Number(row.constructCount ?? 0),
    updatedAt: row.updatedAt,
    descriptor: `${row.subjectLabel} memory field`
  }));
}

export function listSubjectConstructs(db, subjectId = "") {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const query = normalizedSubjectId
    ? db.prepare("SELECT * FROM subject_constructs WHERE subjectId = ? ORDER BY updatedAt DESC, constructLabel ASC")
    : db.prepare("SELECT * FROM subject_constructs ORDER BY subjectLabel ASC, updatedAt DESC, constructLabel ASC");
  const rows = normalizedSubjectId ? query.all(normalizedSubjectId) : query.all();
  return rows.map(fromRow);
}

export function getSubjectConstruct(db, id) {
  ensureSubjectspaceTables(db);
  return fromRow(db.prepare("SELECT * FROM subject_constructs WHERE id = ?").get(String(id)));
}

export function listSubjectStrands(db, subjectId = "", options = {}) {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const limit = Number(options.limit ?? 100) || 100;
  const rows = normalizedSubjectId
    ? db.prepare(`
      SELECT * FROM subject_strands
      WHERE subjectId = ?
      ORDER BY usageCount DESC, constructCount DESC, updatedAt DESC, label ASC
      LIMIT ?
    `).all(normalizedSubjectId, limit)
    : db.prepare(`
      SELECT * FROM subject_strands
      ORDER BY subjectId ASC, usageCount DESC, constructCount DESC, updatedAt DESC, label ASC
      LIMIT ?
    `).all(limit);
  return rows.map(subjectStrandFromRow);
}

export function listConstructStrands(db, constructId = "", options = {}) {
  ensureSubjectspaceTables(db);
  const normalizedConstructId = String(constructId ?? "").trim();
  const limit = Number(options.limit ?? 100) || 100;
  const rows = normalizedConstructId
    ? db.prepare(`
      SELECT cs.*, ss.label, ss.normalizedLabel, ss.confidence, ss.usageCount, ss.constructCount, ss.lastUsedAt, ss.provenanceJson
      FROM construct_strands cs
      LEFT JOIN subject_strands ss ON ss.id = cs.strandId
      WHERE cs.constructId = ?
      ORDER BY cs.weight DESC, cs.updatedAt DESC, cs.layer ASC
      LIMIT ?
    `).all(normalizedConstructId, limit)
    : db.prepare(`
      SELECT cs.*, ss.label, ss.normalizedLabel, ss.confidence, ss.usageCount, ss.constructCount, ss.lastUsedAt, ss.provenanceJson
      FROM construct_strands cs
      LEFT JOIN subject_strands ss ON ss.id = cs.strandId
      ORDER BY cs.updatedAt DESC, cs.weight DESC
      LIMIT ?
    `).all(limit);
  return rows.map(constructStrandFromRow);
}

export function listStrandBinders(db, subjectId = "", options = {}) {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const includeGlobal = options.includeGlobal !== false;

  let rows = [];
  if (normalizedSubjectId && includeGlobal) {
    rows = db.prepare(`
      SELECT * FROM strand_binders
      WHERE subjectId = ? OR subjectId = ''
      ORDER BY subjectId DESC, ABS(weight) DESC, updatedAt DESC
    `).all(normalizedSubjectId);
  } else if (normalizedSubjectId) {
    rows = db.prepare(`
      SELECT * FROM strand_binders
      WHERE subjectId = ?
      ORDER BY ABS(weight) DESC, updatedAt DESC
    `).all(normalizedSubjectId);
  } else {
    rows = db.prepare(`
      SELECT * FROM strand_binders
      ORDER BY subjectId ASC, ABS(weight) DESC, updatedAt DESC
    `).all();
  }

  return rows.map(binderFromRow);
}

export function upsertStrandBinder(db, payload = {}) {
  ensureSubjectspaceTables(db);
  const pair = normalizeBinderPair(payload.leftTerm, payload.rightTerm);
  if (!pair) {
    return null;
  }

  const subjectId = String(payload.subjectId ?? "").trim();
  const source = String(payload.source ?? "manual").trim() || "manual";
  const updatedAt = new Date().toISOString();
  const id = String(payload.id ?? buildStrandBinderId(subjectId, pair[0], pair[1])).trim();
  const weight = Number(clamp(Number(payload.weight ?? 0), -12, 12).toFixed(2));
  const existing = db.prepare(`
    SELECT * FROM strand_binders
    WHERE subjectId = ? AND leftTerm = ? AND rightTerm = ?
  `).get(subjectId, pair[0], pair[1]);

  const nextWeight = existing && String(existing.source ?? "") === "derived" && source === "derived"
    ? Math.max(Number(existing.weight ?? 0), weight)
    : weight;
  const nextReason = String(payload.reason ?? existing?.reason ?? "").trim();

  db.prepare(`
    INSERT INTO strand_binders (id, subjectId, leftTerm, rightTerm, weight, reason, source, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subjectId = excluded.subjectId,
      leftTerm = excluded.leftTerm,
      rightTerm = excluded.rightTerm,
      weight = excluded.weight,
      reason = excluded.reason,
      source = excluded.source,
      updatedAt = excluded.updatedAt
  `).run(
    id,
    subjectId,
    pair[0],
    pair[1],
    nextWeight,
    nextReason || null,
    source,
    updatedAt
  );

  return binderFromRow(db.prepare("SELECT * FROM strand_binders WHERE id = ?").get(id));
}

export function listConstructLinks(db, constructId = "") {
  ensureSubjectspaceTables(db);
  const normalizedConstructId = String(constructId ?? "").trim();
  const rows = normalizedConstructId
    ? db.prepare(`
      SELECT * FROM construct_links
      WHERE sourceConstructId = ?
      ORDER BY score DESC, updatedAt DESC
    `).all(normalizedConstructId)
    : db.prepare(`
      SELECT * FROM construct_links
      ORDER BY updatedAt DESC, score DESC
    `).all();

  return rows.map(linkFromRow);
}

function createDatasetIssueCounter() {
  return {
    missingTarget: 0,
    missingObjective: 0,
    missingSteps: 0,
    missingContext: 0,
    missingTags: 0,
    missingNotes: 0,
    lowAnchorVariety: 0,
    orphanRelatedIds: 0,
    duplicateLabels: 0,
    thinConstructs: 0
  };
}

function computeDatasetAuditFromConstructs(constructs = [], options = {}) {
  const rows = Array.isArray(constructs) ? constructs.map((construct) => normalizeConstruct(construct)) : [];
  const byId = new Map(rows.map((construct) => [construct.id, construct]));
  const labelBuckets = new Map();
  const issueCounts = createDatasetIssueCounter();
  const maxIssues = Math.max(3, Number(options.maxIssues ?? 10) || 10);

  for (const construct of rows) {
    const labelKey = `${construct.subjectId}::${normalizeText(construct.constructLabel)}`;
    const bucket = labelBuckets.get(labelKey) ?? [];
    bucket.push(construct.id);
    labelBuckets.set(labelKey, bucket);
  }

  const duplicateIds = new Set(
    [...labelBuckets.values()]
      .filter((bucket) => bucket.length > 1)
      .flatMap((bucket) => bucket)
  );

  const constructsWithIssues = rows.map((construct) => {
    const relevance = buildConstructRelevanceSummary(construct);
    const issues = [...(relevance.issues ?? [])];
    const orphanRelatedIds = normalizeRelatedConstructIds(construct.relatedConstructIds, construct.id)
      .filter((relatedId) => !byId.has(relatedId));

    if (!construct.target) {
      issueCounts.missingTarget += 1;
    }
    if (!construct.objective) {
      issueCounts.missingObjective += 1;
    }
    if (!construct.steps?.length) {
      issueCounts.missingSteps += 1;
    }
    if (!Object.keys(construct.context ?? {}).length) {
      issueCounts.missingContext += 1;
    }
    if (!construct.tags?.length) {
      issueCounts.missingTags += 1;
    }
    if (!construct.notes) {
      issueCounts.missingNotes += 1;
    }
    if ((relevance.anchors ?? []).length < 4) {
      issueCounts.lowAnchorVariety += 1;
    }
    if (relevance.status === "thin") {
      issueCounts.thinConstructs += 1;
    }
    if (orphanRelatedIds.length) {
      issueCounts.orphanRelatedIds += orphanRelatedIds.length;
      issues.push(`Broken related links: ${orphanRelatedIds.join(", ")}`);
    }
    if (duplicateIds.has(construct.id)) {
      issueCounts.duplicateLabels += 1;
      issues.push("Duplicate construct label inside the same subject");
    }

    return {
      id: construct.id,
      subjectId: construct.subjectId,
      subjectLabel: construct.subjectLabel,
      constructLabel: construct.constructLabel,
      target: construct.target,
      objective: construct.objective,
      relevance,
      orphanRelatedIds,
      issues: uniqueValues(issues)
    };
  });

  const totalScore = constructsWithIssues.reduce((sum, construct) => sum + Number(construct.relevance?.score ?? 0), 0);
  const averageRelevanceScore = rows.length ? Number((totalScore / rows.length).toFixed(1)) : 0;
  const issuePenalty = Math.min(
    55,
    (issueCounts.missingTarget * 3)
      + (issueCounts.missingObjective * 3)
      + (issueCounts.missingSteps * 5)
      + (issueCounts.missingContext * 4)
      + (issueCounts.missingTags * 3)
      + (issueCounts.missingNotes * 2)
      + (issueCounts.lowAnchorVariety * 2)
      + (issueCounts.orphanRelatedIds * 2)
      + (issueCounts.duplicateLabels * 4)
      + (issueCounts.thinConstructs * 3)
  );
  const releaseReadinessScore = rows.length
    ? Number(clamp(Math.round(averageRelevanceScore - (issuePenalty / Math.max(rows.length, 1))), 0, 100))
    : 0;

  return {
    subjectId: String(options.subjectId ?? "").trim() || null,
    constructCount: rows.length,
    averageRelevanceScore,
    releaseReadinessScore,
    status: rows.length === 0
      ? "empty"
      : releaseReadinessScore >= 75
        ? "release-ready"
        : releaseReadinessScore >= 55
          ? "review"
          : "repair",
    issueCounts,
    flaggedConstructs: constructsWithIssues
      .filter((construct) => construct.issues.length)
      .sort((left, right) => {
        const issueDelta = right.issues.length - left.issues.length;
        if (issueDelta !== 0) {
          return issueDelta;
        }
        return Number(left.relevance?.score ?? 0) - Number(right.relevance?.score ?? 0);
      })
      .slice(0, maxIssues)
  };
}

export function auditSubjectDataset(db, { subjectId = "", maxIssues = 10 } = {}) {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const constructs = listSubjectConstructs(db, normalizedSubjectId);
  return computeDatasetAuditFromConstructs(constructs, {
    subjectId: normalizedSubjectId,
    maxIssues
  });
}

export function auditSubjectSeedFile(filePath = defaultSubjectSeedsPath, options = {}) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const constructs = Array.isArray(raw) ? raw : [];
  return {
    filePath,
    ...computeDatasetAuditFromConstructs(constructs, {
      subjectId: String(options.subjectId ?? "").trim(),
      maxIssues: options.maxIssues ?? 8
    })
  };
}

export function cleanSubjectDataset(db, { subjectId = "", maxIssues = 10 } = {}) {
  ensureSubjectspaceTables(db);
  const normalizedSubjectId = String(subjectId ?? "").trim();
  const constructs = listSubjectConstructs(db, normalizedSubjectId);
  const knownIds = new Set(constructs.map((construct) => construct.id));
  const startedAt = new Date().toISOString();
  let normalizedCount = 0;
  let repairedRelatedCount = 0;

  for (const construct of constructs) {
    const cleanedRelatedIds = normalizeRelatedConstructIds(construct.relatedConstructIds, construct.id)
      .filter((relatedId) => knownIds.has(relatedId));
    const cleaned = normalizeConstruct({
      ...construct,
      relatedConstructIds: cleanedRelatedIds,
      provenance: {
        ...(construct.provenance ?? {}),
        datasetCleanedAt: startedAt,
        datasetCleaned: true
      }
    });

    const changed = JSON.stringify({
      subjectLabel: cleaned.subjectLabel,
      constructLabel: cleaned.constructLabel,
      target: cleaned.target,
      objective: cleaned.objective,
      context: cleaned.context,
      steps: cleaned.steps,
      notes: cleaned.notes,
      tags: cleaned.tags,
      strands: cleaned.strands,
      relatedConstructIds: cleaned.relatedConstructIds
    }) !== JSON.stringify({
      subjectLabel: construct.subjectLabel,
      constructLabel: construct.constructLabel,
      target: construct.target,
      objective: construct.objective,
      context: construct.context ?? {},
      steps: construct.steps ?? [],
      notes: construct.notes ?? "",
      tags: construct.tags ?? [],
      strands: construct.strands ?? [],
      relatedConstructIds: construct.relatedConstructIds ?? []
    });

    if (construct.relatedConstructIds?.length !== cleanedRelatedIds.length) {
      repairedRelatedCount += Math.max(0, Number(construct.relatedConstructIds?.length ?? 0) - cleanedRelatedIds.length);
    }

    if (!changed) {
      refreshSubjectConstructRelations(db, construct.id);
      continue;
    }

    upsertSubjectConstruct(db, {
      ...construct,
      ...cleaned,
      provenance: {
        ...(construct.provenance ?? {}),
        ...(cleaned.provenance ?? {}),
        datasetCleanedAt: startedAt,
        datasetCleaned: true
      }
    });
    normalizedCount += 1;
  }

  return {
    ok: true,
    subjectId: normalizedSubjectId || null,
    cleanedAt: startedAt,
    normalizedCount,
    repairedRelatedCount,
    constructCount: constructs.length,
    health: auditSubjectDataset(db, {
      subjectId: normalizedSubjectId,
      maxIssues
    })
  };
}

function saveConstructLink(db, payload = {}) {
  ensureSubjectspaceTables(db);
  const sourceConstructId = String(payload.sourceConstructId ?? "").trim();
  const relatedConstructId = String(payload.relatedConstructId ?? "").trim();
  if (!sourceConstructId || !relatedConstructId || sourceConstructId === relatedConstructId) {
    return null;
  }

  const id = buildConstructLinkId(sourceConstructId, relatedConstructId);
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO construct_links (id, sourceConstructId, relatedConstructId, score, reason, detailJson, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sourceConstructId = excluded.sourceConstructId,
      relatedConstructId = excluded.relatedConstructId,
      score = excluded.score,
      reason = excluded.reason,
      detailJson = excluded.detailJson,
      updatedAt = excluded.updatedAt
  `).run(
    id,
    sourceConstructId,
    relatedConstructId,
    Number(payload.score ?? 0),
    String(payload.reason ?? "").trim() || null,
    JSON.stringify(payload.detail ?? {}),
    updatedAt
  );

  return linkFromRow(db.prepare("SELECT * FROM construct_links WHERE id = ?").get(id));
}

function syncPersistentStrandsForConstruct(db, construct = null) {
  const record = normalizeConstruct(construct ?? {});
  if (!record?.id || !record.subjectId) {
    return [];
  }

  const updatedAt = new Date().toISOString();
  const descriptors = derivePersistentStrandDescriptors(record, {
    limit: 24
  });

  db.prepare("DELETE FROM construct_strands WHERE constructId = ?").run(record.id);

  for (const descriptor of descriptors) {
    const existing = db.prepare(`
      SELECT * FROM subject_strands
      WHERE subjectId = ? AND strandKey = ?
    `).get(record.subjectId, descriptor.strandKey);

    const nextLabel = String(existing?.label ?? descriptor.label ?? "").trim() || humanize(descriptor.strandKey);
    const nextWeight = Number(Math.max(
      Number(existing?.weight ?? 0),
      Number(descriptor.weight ?? 0)
    ).toFixed(2));
    const nextConfidence = clampConfidence(
      Math.max(
        Number(existing?.confidence ?? 0),
        Number(descriptor.confidence ?? 0)
      ),
      descriptor.confidence
    );
    const nextLayer = String(existing?.source ?? "") === "manual"
      ? String(existing?.layer ?? descriptor.layer ?? "anchor")
      : String(descriptor.layer ?? existing?.layer ?? "anchor");
    const nextRole = String(existing?.source ?? "") === "manual"
      ? String(existing?.role ?? descriptor.role ?? "feature")
      : String(descriptor.role ?? existing?.role ?? "feature");
    const nextSource = String(existing?.source ?? descriptor.source ?? "derived").trim() || "derived";
    const nextProvenance = {
      ...(safeJsonParse(existing?.provenanceJson, {}) ?? {}),
      ...(descriptor.provenance ?? {})
    };

    db.prepare(`
      INSERT INTO subject_strands (
        id, subjectId, strandKey, label, normalizedLabel, layer, role, weight, confidence,
        source, usageCount, constructCount, lastUsedAt, provenanceJson, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subjectId = excluded.subjectId,
        strandKey = excluded.strandKey,
        label = excluded.label,
        normalizedLabel = excluded.normalizedLabel,
        layer = excluded.layer,
        role = excluded.role,
        weight = excluded.weight,
        confidence = excluded.confidence,
        source = excluded.source,
        usageCount = COALESCE(subject_strands.usageCount, 0),
        constructCount = COALESCE(subject_strands.constructCount, 0),
        lastUsedAt = COALESCE(subject_strands.lastUsedAt, excluded.lastUsedAt),
        provenanceJson = excluded.provenanceJson,
        updatedAt = excluded.updatedAt
    `).run(
      descriptor.id,
      record.subjectId,
      descriptor.strandKey,
      nextLabel,
      normalizeText(nextLabel),
      nextLayer,
      nextRole,
      nextWeight,
      nextConfidence,
      nextSource,
      Number(existing?.usageCount ?? 0),
      Number(existing?.constructCount ?? 0),
      existing?.lastUsedAt ?? null,
      Object.keys(nextProvenance).length ? JSON.stringify(nextProvenance) : null,
      updatedAt
    );

    db.prepare(`
      INSERT INTO construct_strands (
        id, constructId, subjectId, strandId, strandKey, layer, role, weight, source, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        constructId = excluded.constructId,
        subjectId = excluded.subjectId,
        strandId = excluded.strandId,
        strandKey = excluded.strandKey,
        layer = excluded.layer,
        role = excluded.role,
        weight = excluded.weight,
        source = excluded.source,
        updatedAt = excluded.updatedAt
    `).run(
      `construct-strand:${record.id}:${slugify(descriptor.strandKey)}`,
      record.id,
      record.subjectId,
      descriptor.id,
      descriptor.strandKey,
      descriptor.layer,
      descriptor.role,
      Number(descriptor.weight ?? 1),
      String(descriptor.source ?? "derived").trim() || "derived",
      updatedAt
    );
  }

  db.prepare(`
    UPDATE subject_strands
    SET constructCount = (
      SELECT COUNT(*)
      FROM construct_strands
      WHERE construct_strands.strandId = subject_strands.id
    )
    WHERE subjectId = ?
  `).run(record.subjectId);

  db.prepare(`
    DELETE FROM subject_strands
    WHERE subjectId = ?
      AND source = 'derived'
      AND COALESCE(constructCount, 0) <= 0
  `).run(record.subjectId);

  return listConstructStrands(db, record.id);
}

function touchConstructStrands(db, constructId = "") {
  const normalizedConstructId = String(constructId ?? "").trim();
  if (!normalizedConstructId) {
    return;
  }

  const updatedAt = new Date().toISOString();
  db.prepare(`
    UPDATE subject_strands
    SET usageCount = COALESCE(usageCount, 0) + 1,
        lastUsedAt = ?,
        updatedAt = ?
    WHERE id IN (
      SELECT strandId
      FROM construct_strands
      WHERE constructId = ?
    )
  `).run(updatedAt, updatedAt, normalizedConstructId);
}

function buildActivatedStrands(record = null, parsed = null) {
  const constructStrands = Array.isArray(record?.constructStrands) ? record.constructStrands : [];
  if (!constructStrands.length) {
    return [];
  }

  const needles = [...new Set([
    ...((parsed?.keywords ?? []).map((item) => normalizeText(item))),
    ...((parsed?.phrases ?? []).map((item) => normalizeText(item))),
    ...((parsed?.aliasTerms ?? []).flatMap((entry) => [
      normalizeText(entry.source),
      normalizeText(entry.term)
    ]))
  ])].filter(Boolean);

  const hits = [];
  for (const strand of constructStrands) {
    const haystack = normalizeText(`${strand.strandKey ?? ""} ${strand.label ?? ""}`);
    const reasons = [];
    for (const needle of needles) {
      const exactPhrase = needle.includes(" ") && haystack.includes(needle);
      const exactToken = !needle.includes(" ") && haystack.split(/\s+/).includes(needle);
      if (exactPhrase || exactToken) {
        reasons.push(needle);
      }
    }

    if (!reasons.length && (strand.layer === "construct" || strand.role === "identity")) {
      reasons.push("identity strand");
    }

    if (!reasons.length) {
      continue;
    }

    hits.push({
      ...strand,
      reason: reasons[0] === "identity strand"
        ? "activated as the construct identity"
        : `activated by ${reasons.slice(0, 2).join(", ")}`
    });
  }

  return hits
    .sort((left, right) => Number(right.weight ?? 0) - Number(left.weight ?? 0))
    .slice(0, 8);
}

function syncDerivedBindersForConstruct(db, record = {}) {
  const terms = extractConstructConcepts(record, { limit: 8 });
  for (let index = 0; index < terms.length; index += 1) {
    for (let pointer = index + 1; pointer < terms.length; pointer += 1) {
      const pair = normalizeBinderPair(terms[index], terms[pointer]);
      if (!pair) {
        continue;
      }

      const existing = db.prepare(`
        SELECT * FROM strand_binders
        WHERE subjectId = ? AND leftTerm = ? AND rightTerm = ?
      `).get(record.subjectId, pair[0], pair[1]);
      if (existing && String(existing.source ?? "").trim() !== "derived") {
        continue;
      }

      const weight = pair[0].includes(" ") || pair[1].includes(" ") ? 1.7 : 1.1;
      upsertStrandBinder(db, {
        subjectId: record.subjectId,
        leftTerm: pair[0],
        rightTerm: pair[1],
        weight,
        reason: `derived:${record.constructLabel}`,
        source: "derived"
      });
    }
  }
}

function syncConstructLinksForRecord(db, record = {}) {
  if (!record?.id || !record?.subjectId) {
    return [];
  }

  const relatedConstructs = listSubjectConstructs(db, record.subjectId).filter((candidate) => candidate.id !== record.id);
  const binders = listStrandBinders(db, record.subjectId);
  db.prepare("DELETE FROM construct_links WHERE sourceConstructId = ? OR relatedConstructId = ?").run(record.id, record.id);

  const savedLinks = [];
  for (const candidate of relatedConstructs) {
    const similarity = computeConstructSimilarity(record, candidate, binders);
    if (similarity.score < LINK_SIMILARITY_THRESHOLD) {
      continue;
    }

    savedLinks.push(saveConstructLink(db, {
      sourceConstructId: record.id,
      relatedConstructId: candidate.id,
      score: similarity.score,
      reason: similarity.reason,
      detail: similarity.detail
    }));
    savedLinks.push(saveConstructLink(db, {
      sourceConstructId: candidate.id,
      relatedConstructId: record.id,
      score: similarity.score,
      reason: similarity.reason,
      detail: similarity.detail
    }));
  }

  return savedLinks.filter(Boolean);
}

export function refreshSubjectConstructRelations(db, constructOrId = null) {
  ensureSubjectspaceTables(db);
  const record = typeof constructOrId === "string"
    ? getSubjectConstruct(db, constructOrId)
    : normalizeConstruct(constructOrId ?? {});

  if (!record?.id) {
    return null;
  }

  syncDerivedBindersForConstruct(db, record);
  syncPersistentStrandsForConstruct(db, record);
  syncConstructLinksForRecord(db, record);
  return getSubjectConstruct(db, record.id);
}

function selectMergeCandidate(db, record = {}, options = {}) {
  if (!record?.subjectId) {
    return null;
  }

  const candidates = listSubjectConstructs(db, record.subjectId).filter((candidate) => candidate.id !== record.id);
  if (!candidates.length) {
    return null;
  }

  const binders = listStrandBinders(db, record.subjectId);
  let strongest = null;
  for (const candidate of candidates) {
    const similarity = computeConstructSimilarity(record, candidate, binders);
    if (similarity.score < Number(options.threshold ?? MERGE_SIMILARITY_THRESHOLD)) {
      continue;
    }

    if (!strongest || similarity.score > strongest.similarity.score) {
      strongest = {
        construct: candidate,
        similarity
      };
    }
  }

  return strongest;
}

export function upsertSubjectConstruct(db, payload = {}) {
  ensureSubjectspaceTables(db);
  const explicitId = Boolean(String(payload.id ?? "").trim());
  const normalized = normalizeConstruct(payload);
  const mergeCandidate = explicitId ? null : selectMergeCandidate(db, normalized);
  const record = mergeCandidate
    ? mergeSubjectConstruct(mergeCandidate.construct, normalized, {
      preserveId: true,
      provenance: {
        ...(mergeCandidate.construct.provenance ?? {}),
        ...(normalized.provenance ?? {}),
        mergedIntoConstructId: mergeCandidate.construct.id,
        mergeReason: mergeCandidate.similarity.reason,
        mergeScore: mergeCandidate.similarity.score
      }
    })
    : normalized;
  const existing = getSubjectConstruct(db, record.id);
  const updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO subject_constructs (
      id, subjectId, subjectLabel, constructLabel, target, objective, contextJson,
      stepsJson, notes, tagsJson, strandsJson, provenanceJson, relatedConstructIdsJson, learnedCount, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subjectId = excluded.subjectId,
      subjectLabel = excluded.subjectLabel,
      constructLabel = excluded.constructLabel,
      target = excluded.target,
      objective = excluded.objective,
      contextJson = excluded.contextJson,
      stepsJson = excluded.stepsJson,
      notes = excluded.notes,
      tagsJson = excluded.tagsJson,
      strandsJson = excluded.strandsJson,
      provenanceJson = excluded.provenanceJson,
      relatedConstructIdsJson = excluded.relatedConstructIdsJson,
      learnedCount = excluded.learnedCount,
      updatedAt = excluded.updatedAt
  `).run(
    record.id,
    record.subjectId,
    record.subjectLabel,
    record.constructLabel,
    record.target,
    record.objective,
    JSON.stringify(record.context ?? {}),
    JSON.stringify(record.steps ?? []),
    record.notes || null,
    JSON.stringify(record.tags ?? []),
    JSON.stringify(record.strands ?? []),
    record.provenance ? JSON.stringify(record.provenance) : null,
    record.relatedConstructIds?.length ? JSON.stringify(record.relatedConstructIds) : null,
    Number(existing?.learnedCount ?? 0) + 1,
    updatedAt
  );

  const saved = getSubjectConstruct(db, record.id);
  return refreshSubjectConstructRelations(db, saved);
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

function scoreLinkedReinforcement(record, lexicalScores = [], links = []) {
  const lexicalById = new Map(lexicalScores.map((entry) => [entry.id, entry]));
  const recordLinks = links.filter((entry) => entry.sourceConstructId === record.id);
  const hits = [];
  let score = 0;

  for (const link of recordLinks) {
    const related = lexicalById.get(link.relatedConstructId);
    if (!related || Number(related.score ?? 0) <= 0) {
      continue;
    }

    const reinforcement = Math.min(
      Number(link.score ?? 0) * Math.min(Number(related.score ?? 0) / READY_THRESHOLD, 1.2) * 0.35,
      MAX_LINK_REINFORCEMENT
    );
    if (!reinforcement) {
      continue;
    }

    score += reinforcement;
    hits.push({
      constructId: related.id,
      constructLabel: related.constructLabel,
      linkScore: Number(link.score ?? 0),
      reinforcement: Number(reinforcement.toFixed(2)),
      reason: link.reason
    });
  }

  return {
    score: Number(clamp(score, 0, MAX_LINK_REINFORCEMENT).toFixed(2)),
    hits: hits
      .sort((left, right) => Number(right.reinforcement ?? 0) - Number(left.reinforcement ?? 0))
      .slice(0, 4)
  };
}

function fetchRelatedSubjectConstructs(db, construct = null) {
  const constructId = String(construct?.id ?? "").trim();
  if (!constructId) {
    return [];
  }

  const relatedIds = normalizeRelatedConstructIds(construct?.relatedConstructIds, constructId);
  const relatedConstructs = [];

  for (const relatedId of relatedIds) {
    const related = getSubjectConstruct(db, relatedId);
    if (!related) {
      continue;
    }

    relatedConstructs.push(related);
  }

  return relatedConstructs;
}

export function recallSubjectSpace(db, { question = "", subjectId = "" } = {}) {
  const parsed = parseSubjectQuestion(question, subjectId);
  const constructs = listSubjectConstructs(db, subjectId);
  const binders = listStrandBinders(db, parsed.subjectId || subjectId);
  const lexical = constructs
    .map((record) => {
      const analysis = scoreConstruct(record, parsed, {
        binders
      });
      return {
        ...record,
        score: analysis.score,
        support: analysis.support,
        matchedTokens: analysis.matchedTokens,
        matchedSources: analysis.matchedSources,
        matchedRatio: analysis.matchedRatio,
        aliasHits: analysis.aliasHits,
        phraseHits: analysis.phraseHits,
        excludedHits: analysis.excludedHits,
        binderHits: analysis.binderHits
      };
    })
    .filter((record) => record.score > 0);
  const links = lexical.length ? listConstructLinks(db).filter((entry) => lexical.some((candidate) => candidate.id === entry.sourceConstructId)) : [];
  const ranked = lexical
    .map((record) => {
      const linked = scoreLinkedReinforcement(record, lexical, links);
      return {
        ...record,
        score: Number((Number(record.score ?? 0) + Number(linked.score ?? 0)).toFixed(2)),
        linkHits: linked.hits
      };
    })
    .sort((left, right) => right.score - left.score || left.constructLabel.localeCompare(right.constructLabel));

  const matched = ranked[0] ?? null;
  const ready = Boolean(matched && matched.score >= READY_THRESHOLD);
  const enrichedMatched = ready && matched
    ? {
      ...matched,
      constructStrands: listConstructStrands(db, matched.id, { limit: 18 })
    }
    : null;
  const activatedStrands = enrichedMatched ? buildActivatedStrands(enrichedMatched, parsed) : [];
  if (enrichedMatched) {
    enrichedMatched.activatedStrands = activatedStrands;
    touchConstructStrands(db, enrichedMatched.id);
  }
  const relatedConstructs = ready && enrichedMatched ? fetchRelatedSubjectConstructs(db, enrichedMatched) : [];
  const routing = buildRouting(parsed, ranked, constructs);
  const candidates = ranked.slice(0, 5).map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    subjectLabel: item.subjectLabel,
    constructLabel: item.constructLabel,
    target: item.target,
    objective: item.objective,
    relatedConstructIds: item.relatedConstructIds ?? [],
    score: item.score,
    support: item.support,
    matchedRatio: Number(item.matchedRatio ?? 0),
    matchedTokens: item.matchedTokens ?? [],
    aliasHits: item.aliasHits ?? [],
    phraseHits: item.phraseHits ?? [],
    excludedHits: item.excludedHits ?? [],
    binderHits: item.binderHits ?? [],
    linkHits: item.linkHits ?? []
  }));

  return {
    question: parsed.raw,
    parsed,
    ready,
    matched: ready ? enrichedMatched : null,
    relatedConstructs,
    candidates,
    answer: ready && enrichedMatched
      ? buildRecallAnswer(enrichedMatched)
      : buildUnresolvedAnswer(parsed, candidates, constructs.length),
    recommendation: ready ? "use_strandspace" : "teach_or_refine",
    readiness: {
      threshold: READY_THRESHOLD,
      matchedScore: Number(matched?.score ?? 0),
      matchedRatio: routing.matchedRatio,
      margin: routing.margin,
      confidence: routing.confidence,
      subjectLocked: Boolean(subjectId),
      libraryCount: constructs.length
    },
    routing,
    trace: buildTrace(ready ? enrichedMatched : (ranked[0] ?? null), parsed, candidates)
  };
}
