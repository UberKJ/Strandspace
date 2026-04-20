import { normalizeText } from "./parser.js";
import { clamp, humanize, normalizeArray, normalizeConstruct, uniqueValues } from "./normalize.js";

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

export { buildTrace };
