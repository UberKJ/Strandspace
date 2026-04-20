import { normalizeText } from "./parser.js";
import {
  clamp,
  containsTerm,
  escapeRegExp,
  expressesAbsence,
  extractConstructConcepts,
  extractParsedConcepts,
  normalizeArray,
  normalizeBinderTerm,
  tokenize,
  uniqueValues
} from "./normalize.js";

export const READY_THRESHOLD = 34;
export const PARTIAL_READY_MULTIPLIER = 0.55;
export const LINK_SIMILARITY_THRESHOLD = 0.2;
export const MERGE_SIMILARITY_THRESHOLD = 0.68;
export const MAX_BINDER_BONUS = 10;
export const MAX_LINK_REINFORCEMENT = 8;

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


export {
  computeConstructSimilarity,
  scoreConstruct,
  scoreLinkedReinforcement
};
