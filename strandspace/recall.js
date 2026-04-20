import { normalizeText } from "./parser.js";
import { humanize, parseSubjectQuestion, normalizeRelatedConstructIds } from "./normalize.js";
import { buildTrace } from "./trace.js";
import { buildRouting, buildUnresolvedAnswer } from "./route.js";
import { READY_THRESHOLD, scoreConstruct, scoreLinkedReinforcement } from "./score.js";
import {
  getSubjectConstruct,
  listConstructLinks,
  listConstructStrands,
  listStrandBinders,
  listSubjectConstructs,
  touchConstructStrands
} from "./store.js";

function classifyChangeSeverity({ ready = false, stableCount = 0, missingCount = 0, changedCount = 0 } = {}) {
  if (!ready) {
    return "no_stable_match";
  }

  if (changedCount >= 2 || (changedCount >= 1 && missingCount >= 2)) {
    return "branch_worthy";
  }

  if (changedCount >= 1 || missingCount >= 3) {
    return "meaningful";
  }

  if (stableCount >= 1 && (missingCount === 1 || changedCount === 1)) {
    return "minor";
  }

  return "minor";
}

function buildPromptChangeDetection(parsed = {}, candidate = null, ready = false) {
  const stableMatch = Boolean(ready && candidate);
  if (!candidate) {
    return {
      status: "no_stable_match",
      severity: "no_stable_match",
      stableCues: { keywords: [], phrases: [], aliases: [] },
      missingCues: { keywords: [], phrases: [] },
      changedCues: [],
      counts: { stable: 0, missing: 0, changed: 0 },
      explanation: "No construct matched strongly enough to compare prompt changes."
    };
  }

  const matchedSources = new Set(Array.isArray(candidate.matchedSources) ? candidate.matchedSources : []);
  const stableKeywords = (Array.isArray(parsed.keywords) ? parsed.keywords : []).filter((token) => matchedSources.has(token));
  const stablePhrases = (Array.isArray(parsed.phrases) ? parsed.phrases : []).filter((phrase) => matchedSources.has(phrase));
  const stableAliases = (Array.isArray(candidate.aliasHits) ? candidate.aliasHits : [])
    .filter((hit) => hit?.source && matchedSources.has(hit.source))
    .slice(0, 6)
    .map((hit) => ({
      source: hit.source,
      term: hit.term,
      canonical: hit.canonical,
      field: hit.field
    }));

  const missingKeywords = (Array.isArray(parsed.keywords) ? parsed.keywords : []).filter((token) => !matchedSources.has(token)).slice(0, 8);
  const missingPhrases = (Array.isArray(parsed.phrases) ? parsed.phrases : []).filter((phrase) => !matchedSources.has(phrase)).slice(0, 6);
  const changedCues = (Array.isArray(candidate.excludedHits) ? candidate.excludedHits : [])
    .slice(0, 6)
    .map((hit) => ({
      cue: hit.cue,
      term: hit.term,
      via: hit.via,
      penalty: Number(hit.penalty ?? 0),
      field: hit.field
    }));

  const stableCount = stableKeywords.length + stablePhrases.length + stableAliases.length;
  const missingCount = missingKeywords.length + missingPhrases.length;
  const changedCount = changedCues.length;
  const severity = classifyChangeSeverity({
    ready: stableMatch,
    stableCount,
    missingCount,
    changedCount
  });

  const status = stableMatch ? "stable_match" : "no_stable_match";
  const explanation = stableMatch
    ? `Stable match found. ${stableCount} cue${stableCount === 1 ? "" : "s"} stayed aligned, ${missingCount} cue${missingCount === 1 ? "" : "s"} were missing, and ${changedCount} cue${changedCount === 1 ? "" : "s"} conflicted with excluded terms.`
    : "No construct matched strongly enough to compare prompt changes.";

  return {
    status,
    severity,
    stableCues: {
      keywords: stableKeywords.slice(0, 10),
      phrases: stablePhrases.slice(0, 6),
      aliases: stableAliases
    },
    missingCues: {
      keywords: missingKeywords,
      phrases: missingPhrases
    },
    changedCues,
    counts: {
      stable: stableCount,
      missing: missingCount,
      changed: changedCount
    },
    explanation
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
  const lineageParent = ready && enrichedMatched?.parentConstructId
    ? getSubjectConstruct(db, enrichedMatched.parentConstructId)
    : null;
  const lineageVariants = ready && enrichedMatched
    ? constructs.filter((record) => record.parentConstructId === enrichedMatched.id).slice(0, 6)
    : [];
  const routing = buildRouting(parsed, ranked, constructs);
  const changeDetection = buildPromptChangeDetection(parsed, matched, ready);
  const candidates = ranked.slice(0, 5).map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    subjectLabel: item.subjectLabel,
    constructLabel: item.constructLabel,
    target: item.target,
    objective: item.objective,
    relatedConstructIds: item.relatedConstructIds ?? [],
    parentConstructId: item.parentConstructId ?? null,
    variantType: item.variantType ?? null,
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
    changeDetection,
    lineage: ready ? {
      parent: lineageParent ? {
        id: lineageParent.id,
        subjectId: lineageParent.subjectId,
        subjectLabel: lineageParent.subjectLabel,
        constructLabel: lineageParent.constructLabel,
        variantType: lineageParent.variantType ?? null
      } : null,
      variants: lineageVariants.map((variant) => ({
        id: variant.id,
        subjectId: variant.subjectId,
        subjectLabel: variant.subjectLabel,
        constructLabel: variant.constructLabel,
        variantType: variant.variantType ?? null,
        branchReason: variant.branchReason ?? null,
        changeSummary: variant.changeSummary ?? null
      }))
    } : {
      parent: null,
      variants: []
    },
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
