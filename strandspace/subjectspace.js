import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const defaultSubjectSeedsPath = join(__dirname, "..", "data", "subject-seeds.json");
const READY_THRESHOLD = 34;
const PARTIAL_READY_MULTIPLIER = 0.55;

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
    provenance
  };
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
    provenance: options.provenance
      ?? (patchProvenance
        ? {
          ...(baseProvenance ?? {}),
          ...patchProvenance
        }
        : baseProvenance)
  });
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
    provenance: safeJsonParse(row.provenanceJson, null),
    learnedCount: Number(row.learnedCount ?? 1),
    updatedAt: row.updatedAt
  };
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !QUERY_STOPWORDS.has(token));
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

function computeSupport(record, parsed) {
  const needles = buildNeedles(record);
  const support = [];

  const checks = [
    {
      label: "construct",
      haystack: needles.label,
      summary: record.constructLabel
    },
    {
      label: "target",
      haystack: needles.target,
      summary: record.target
    },
    {
      label: "objective",
      haystack: needles.objective,
      summary: record.objective
    },
    ...Object.entries(record.context ?? {}).flatMap(([key, value]) => ([
      {
        label: `context:${key}`,
        haystack: normalizeText(`${key} ${value}`),
        summary: `${key}: ${value}`
      }
    ])),
    ...(record.tags ?? []).map((tag) => ({
      label: "tag",
      haystack: normalizeText(tag),
      summary: tag
    }))
  ];

  for (const entry of checks) {
    const matchedTokens = parsed.keywords.filter((token) => entry.haystack.includes(token));
    if (matchedTokens.length === 0) {
      continue;
    }

    support.push({
      label: entry.label,
      summary: entry.summary,
      tokens: matchedTokens
    });
  }

  return support.slice(0, 8);
}

function scoreConstruct(record, parsed) {
  const needles = buildNeedles(record);
  let score = 0;
  const matchedTokens = new Set();

  if (parsed.subjectId && record.subjectId === parsed.subjectId) {
    score += 26;
  }

  if (parsed.normalized && needles.label.includes(parsed.normalized)) {
    score += 36;
  }

  for (const token of parsed.keywords) {
    let tokenScore = 0;

    if (needles.label.includes(token)) {
      tokenScore = Math.max(tokenScore, 15);
    }
    if (needles.target.includes(token)) {
      tokenScore = Math.max(tokenScore, 13);
    }
    if (needles.objective.includes(token)) {
      tokenScore = Math.max(tokenScore, 11);
    }
    if (needles.contextValues.some((value) => value.includes(token))) {
      tokenScore = Math.max(tokenScore, 9);
    }
    if (needles.contextKeys.some((value) => value.includes(token))) {
      tokenScore = Math.max(tokenScore, 8);
    }
    if (needles.tags.some((value) => value.includes(token))) {
      tokenScore = Math.max(tokenScore, 8);
    }
    if (needles.strands.some((value) => value.includes(token))) {
      tokenScore = Math.max(tokenScore, 7);
    }
    if (needles.steps.some((value) => value.includes(token))) {
      tokenScore = Math.max(tokenScore, 4);
    }
    if (needles.notes.includes(token)) {
      tokenScore = Math.max(tokenScore, 4);
    }

    if (tokenScore > 0) {
      matchedTokens.add(token);
      score += tokenScore;
    }
  }

  if (parsed.keywords.length > 0) {
    score += Number(((matchedTokens.size / parsed.keywords.length) * 18).toFixed(2));
  }

  if (record.learnedCount > 1) {
    score += Math.min(record.learnedCount, 8);
  }

  return {
    score: Number(score.toFixed(2)),
    support: computeSupport(record, parsed),
    matchedTokens: [...matchedTokens]
  };
}

function buildTrace(record, parsed, candidates = []) {
  const contextEntries = Object.entries(record?.context ?? {});

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
    stabilizedMemory: candidates.slice(0, 4).map((candidate, index) => ({
      kind: "memory",
      name: candidate.constructLabel,
      score: candidate.score,
      role: index === 0 ? "winner" : "contender"
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

function buildUnresolvedAnswer(parsed, candidates = []) {
  if (!candidates.length) {
    return `No stable Strandspace memory formed for "${parsed.raw}". Teach a construct for this subject and it will become recallable next time.`;
  }

  const hints = candidates
    .slice(0, 3)
    .map((candidate) => candidate.constructLabel)
    .join(", ");

  return `Strandspace found partial overlap for "${parsed.raw}", but nothing was strong enough to emit a trusted answer. Closest constructs: ${hints}.`;
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
  const keywordCount = parsed.keywords.length || 1;
  const matchedRatio = matched ? Number(((matched.matchedTokens?.length ?? 0) / keywordCount).toFixed(2)) : 0;
  const scoreRatio = Number(clamp(score / READY_THRESHOLD, 0, 1.8).toFixed(2));
  const confidence = matched
    ? Number(clamp((scoreRatio * 0.46) + (matchedRatio * 0.4) + (Math.min(margin, 18) / 18) * 0.14, 0.08, 0.98).toFixed(2))
    : Number(clamp(constructs.length ? 0.12 : 0.05, 0, 0.2).toFixed(2));
  const missingKeywords = matched
    ? parsed.keywords.filter((token) => !(matched.matchedTokens ?? []).includes(token))
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
      missingKeywords
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
      reason: "The top construct is clearly ahead and most query cues were satisfied locally.",
      nextAction: "Use the recalled construct as-is, then tighten it with more examples if you want even faster recall later.",
      promptDraft: "",
      missingKeywords
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
      reason: "Strandspace found a usable construct, but the overlap is narrow or the winning margin is small.",
      nextAction: "Use the local answer as the baseline and let an API validate or expand only the uncertain parts.",
      promptDraft: buildAssistPrompt({
        parsed,
        matched,
        subjectLabel: matched.subjectLabel,
        missingKeywords
      }),
      missingKeywords
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
      missingKeywords
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
    missingKeywords
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
      learnedCount INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_subject ON subject_constructs(subjectId, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_label ON subject_constructs(constructLabel);
    CREATE INDEX IF NOT EXISTS idx_subject_constructs_updated ON subject_constructs(updatedAt DESC);
  `);
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

export function upsertSubjectConstruct(db, payload = {}) {
  ensureSubjectspaceTables(db);
  const record = normalizeConstruct(payload);
  const existing = getSubjectConstruct(db, record.id);
  const updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO subject_constructs (
      id, subjectId, subjectLabel, constructLabel, target, objective, contextJson,
      stepsJson, notes, tagsJson, strandsJson, provenanceJson, learnedCount, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    Number(existing?.learnedCount ?? 0) + 1,
    updatedAt
  );

  return getSubjectConstruct(db, record.id);
}

export function parseSubjectQuestion(question = "", subjectId = "") {
  const raw = String(question ?? "").trim();
  const normalized = normalizeText(raw);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const keywords = tokens.filter((token) => !QUERY_STOPWORDS.has(token));

  return {
    raw,
    normalized,
    tokens,
    keywords,
    subjectId: String(subjectId ?? "").trim(),
    intent: /\bcompare\b|\bvs\b|\bversus\b/.test(normalized) ? "compare" : "recall"
  };
}

export function recallSubjectSpace(db, { question = "", subjectId = "" } = {}) {
  const parsed = parseSubjectQuestion(question, subjectId);
  const constructs = listSubjectConstructs(db, subjectId);
  const ranked = constructs
    .map((record) => {
      const analysis = scoreConstruct(record, parsed);
      return {
        ...record,
        score: analysis.score,
        support: analysis.support,
        matchedTokens: analysis.matchedTokens
      };
    })
    .filter((record) => record.score > 0)
    .sort((left, right) => right.score - left.score || left.constructLabel.localeCompare(right.constructLabel));

  const matched = ranked[0] ?? null;
  const ready = Boolean(matched && matched.score >= READY_THRESHOLD);
  const routing = buildRouting(parsed, ranked, constructs);
  const candidates = ranked.slice(0, 5).map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    subjectLabel: item.subjectLabel,
    constructLabel: item.constructLabel,
    target: item.target,
    objective: item.objective,
    score: item.score,
    support: item.support,
    matchedRatio: Number(((item.matchedTokens?.length ?? 0) / (parsed.keywords.length || 1)).toFixed(2))
  }));

  return {
    question: parsed.raw,
    parsed,
    ready,
    matched: ready ? matched : null,
    candidates,
    answer: ready && matched ? buildRecallAnswer(matched) : buildUnresolvedAnswer(parsed, candidates),
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
    trace: buildTrace(ready ? matched : null, parsed, candidates)
  };
}
