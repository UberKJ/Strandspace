import { normalizeText } from "./parser.js";
import { tokenize } from "./normalize.js";
import { PARTIAL_READY_MULTIPLIER, READY_THRESHOLD } from "./score.js";

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


export {
  buildRouting,
  buildUnresolvedAnswer
};
