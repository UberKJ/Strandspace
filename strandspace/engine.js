import { normalizeText } from "./parser.js";

const PRIMITIVE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "color",
  "compare",
  "does",
  "do",
  "for",
  "how",
  "i",
  "in",
  "is",
  "like",
  "many",
  "me",
  "plants",
  "the",
  "this",
  "what",
  "which"
]);

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}

function tokenize(value = "") {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function splitAttribute(attribute = null) {
  return attribute ? String(attribute).split("_").filter(Boolean) : [];
}

function primitiveRole(token, parsed) {
  if (splitAttribute(parsed.attribute).includes(token)) {
    return "requested_property";
  }
  if (tokenize(parsed.plantPhrase).includes(token)) {
    return "target_identity";
  }
  if (tokenize(parsed.trait).includes(token)) {
    return "target_trait";
  }
  return "query_term";
}

function buildPrimitiveLayer(parsed) {
  const pool = [
    ...splitAttribute(parsed.attribute),
    ...tokenize(parsed.plantPhrase),
    ...tokenize(parsed.trait),
    ...(parsed.keywords ?? [])
  ]
    .map((token) => token.trim())
    .filter((token) => token && !PRIMITIVE_STOPWORDS.has(token));

  return uniqueBy(
    pool.map((token, index) => ({
      kind: "primitive",
      name: token,
      role: primitiveRole(token, parsed),
      weight: Number(Math.max(1 - index * 0.08, 0.4).toFixed(2))
    })),
    (item) => item.name
  ).slice(0, 12);
}

function buildTriggerLayer(parsed, controllers = []) {
  const base = [
    {
      kind: "trigger",
      name: parsed.intent ?? "lookup",
      role: "query_intent"
    }
  ];

  if (parsed.attribute) {
    base.push({
      kind: "trigger",
      name: parsed.attribute,
      role: "requested_attribute"
    });
  }

  if (parsed.audienceHint) {
    base.push({
      kind: "trigger",
      name: parsed.audienceHint,
      role: "audience_hint"
    });
  }

  const controllerTriggers = controllers.map((controller) => ({
    kind: "controller",
    name: controller.id ?? controller.label ?? "controller",
    label: controller.label ?? controller.id ?? "controller",
    role: controller.layer ?? "controller"
  }));

  return [...base, ...controllerTriggers];
}

function buildAnchorLayer(activated = []) {
  return activated
    .filter((strand) => strand.kind === "anchor")
    .map((strand, index) => ({
      kind: "anchor",
      name: strand.name,
      value: strand.value ?? null,
      plant: strand.plant ?? null,
      weight: Number(Math.max(1 - index * 0.08, 0.35).toFixed(2))
    }));
}

function buildCompositeLayer({
  activated = [],
  matchedPlant = null,
  relatedPlants = []
}) {
  const composites = activated
    .filter((strand) => strand.kind === "composite" || strand.kind === "taxonomy")
    .map((strand, index) => ({
      kind: strand.kind,
      name: strand.name,
      value: strand.value ?? null,
      plant: strand.plant ?? null,
      weight: Number(Math.max(1 - index * 0.06, 0.4).toFixed(2))
    }));

  const constructs = [];
  if (matchedPlant) {
    constructs.push({
      kind: "construct",
      name: matchedPlant.name,
      value: matchedPlant.constructStrand ?? matchedPlant.id ?? matchedPlant.name,
      role: "matched_identity",
      weight: 1
    });
  } else if (relatedPlants.length) {
    constructs.push({
      kind: "construct",
      name: relatedPlants.map((plant) => plant.name).join(", "),
      value: "related_construct_field",
      role: "list_expression",
      weight: 0.88
    });
  }

  return [...constructs, ...composites].slice(0, 12);
}

function buildStabilizedMemoryLayer({
  candidates = [],
  matchedPlant = null,
  relatedPlants = [],
  audience = "gardener"
}) {
  const reusedCandidates = candidates.slice(0, 4).map((candidate, index) => ({
    kind: "memory_path",
    name: candidate.name ?? candidate.id ?? `candidate_${index + 1}`,
    score: Number(candidate.score ?? 0),
    role: index === 0 ? "winner_path" : "alternate_path"
  }));

  if (matchedPlant) {
    reusedCandidates.unshift({
      kind: "memory_path",
      name: matchedPlant.name,
      score: Number(candidates[0]?.score ?? 0),
      role: "stabilized_match"
    });
  } else if (relatedPlants.length) {
    reusedCandidates.unshift({
      kind: "memory_path",
      name: `${relatedPlants.length} related plants`,
      score: relatedPlants.length,
      role: "list_cluster"
    });
  }

  reusedCandidates.push({
    kind: "memory_path",
    name: audience,
    score: 1,
    role: "audience_bias"
  });

  return uniqueBy(reusedCandidates, (item) => `${item.role}:${item.name}`).slice(0, 6);
}

function summarizeSupport(layers, matchedPlant, parsed) {
  const targetTerms = new Set([
    ...tokenize(parsed.plantPhrase),
    ...tokenize(parsed.trait),
    ...splitAttribute(parsed.attribute)
  ]);

  const support = [];

  for (const anchor of layers.anchor) {
    const score = targetTerms.has(anchor.name) || tokenize(anchor.value).some((token) => targetTerms.has(token)) ? 1 : 0.7;
    support.push({
      type: "anchor",
      name: anchor.name,
      value: anchor.value ?? null,
      score: Number(score.toFixed(2)),
      plant: anchor.plant ?? matchedPlant?.name ?? null
    });
  }

  for (const composite of layers.composite) {
    const score = composite.kind === "construct" ? 1 : 0.82;
    support.push({
      type: composite.kind,
      name: composite.name,
      value: composite.value ?? null,
      score: Number(score.toFixed(2)),
      plant: composite.plant ?? matchedPlant?.name ?? null
    });
  }

  return support.slice(0, 10);
}

function buildExpressionSlots({ parsed, matchedPlant, relatedPlants, layers, keyHolder }) {
  return [
    {
      slot: "trigger",
      value: parsed.intent ?? "lookup",
      source: "query",
      filled: true
    },
    {
      slot: "identity",
      value:
        matchedPlant?.name
        ?? (relatedPlants.length ? `${relatedPlants.length} related plants` : null)
        ?? parsed.plantPhrase
        ?? keyHolder?.identifier
        ?? null,
      source: matchedPlant ? "matched_plant" : relatedPlants.length ? "related_plants" : "query",
      filled: Boolean(matchedPlant?.name || parsed.plantPhrase || relatedPlants.length || keyHolder?.identifier)
    },
    {
      slot: "property",
      value: parsed.attribute ?? parsed.trait ?? "general_lookup",
      source: parsed.attribute ? "attribute" : parsed.trait ? "trait" : "fallback",
      filled: true
    },
    {
      slot: "support",
      value: summarizeSupport(layers, matchedPlant, parsed),
      source: "activated_layers",
      filled: layers.anchor.length + layers.composite.length > 0
    }
  ];
}

function buildCandidateAssemblies({ candidates, matchedPlant, relatedPlants, parsed, layers }) {
  const winnerKey = matchedPlant?.name ?? candidates[0]?.name ?? null;
  const topCandidates = candidates.slice(0, 4).map((candidate, index) => {
    const support = summarizeSupport(layers, candidate, parsed).slice(0, 4);
    const baseScore = Number(candidate.score ?? 0);
    const supportBoost = support.length * 4;
    const stabilizedScore = Number((baseScore + supportBoost).toFixed(2));

    return {
      rank: index + 1,
      name: candidate.name ?? candidate.id ?? `candidate_${index + 1}`,
      score: baseScore,
      stabilizedScore,
      status: (candidate.name ?? candidate.id) === winnerKey ? "winner" : "contender",
      matchedBy: candidate.matchedBy ?? null,
      support
    };
  });

  if (!topCandidates.length && relatedPlants.length) {
    return relatedPlants.slice(0, 4).map((plant, index) => ({
      rank: index + 1,
      name: plant.name,
      score: 0,
      stabilizedScore: Number((12 - index).toFixed(2)),
      status: index === 0 ? "winner" : "contender",
      matchedBy: { list: true },
      support: summarizeSupport(layers, plant, parsed).slice(0, 4)
    }));
  }

  return topCandidates;
}

function buildStabilization(candidateAssemblies = [], keyHolder = null) {
  const winner = candidateAssemblies[0] ?? null;
  const runnerUp = candidateAssemblies[1] ?? null;
  const margin = Number(((winner?.stabilizedScore ?? 0) - (runnerUp?.stabilizedScore ?? 0)).toFixed(2));
  const accepted = Boolean(keyHolder?.canRelate) && Boolean(winner);
  const confidence = Number(
    Math.max(
      Math.min((winner?.stabilizedScore ?? 0) / 100 + margin / 40, 0.99),
      accepted ? 0.35 : 0
    ).toFixed(2)
  );

  return {
    accepted,
    margin,
    confidence,
    winner: winner
      ? {
          name: winner.name,
          stabilizedScore: winner.stabilizedScore
        }
      : null,
    suppressed: candidateAssemblies
      .slice(1)
      .map((candidate) => ({
        name: candidate.name,
        stabilizedScore: candidate.stabilizedScore,
        reason: margin > 0 ? "weaker binding pressure than the winner" : "insufficient separation from the winner"
      }))
  };
}

export function buildStrandEngine({
  parsed,
  audience,
  controllers = [],
  activated = [],
  candidates = [],
  matchedPlant = null,
  relatedPlants = [],
  keyHolder = null,
  answer = "",
  matchStatus = "matched"
}) {
  const layers = {
    primitive: buildPrimitiveLayer(parsed),
    trigger: buildTriggerLayer(parsed, controllers),
    anchor: buildAnchorLayer(activated),
    composite: buildCompositeLayer({
      activated,
      matchedPlant,
      relatedPlants
    }),
    stabilizedMemory: buildStabilizedMemoryLayer({
      candidates,
      matchedPlant,
      relatedPlants,
      audience
    })
  };
  const slots = buildExpressionSlots({
    parsed,
    matchedPlant,
    relatedPlants,
    layers,
    keyHolder
  });
  const candidatesByField = buildCandidateAssemblies({
    candidates,
    matchedPlant,
    relatedPlants,
    parsed,
    layers
  });
  const stabilization = buildStabilization(candidatesByField, keyHolder);

  return {
    phase: "phase_1_minimal_strand_engine",
    matchStatus,
    keyHolder: keyHolder
      ? {
          identifier: keyHolder.identifier ?? keyHolder.name ?? null,
          canRelate: Boolean(keyHolder.canRelate)
        }
      : null,
    layers,
    expression: {
      answerPreview: answer ? String(answer).slice(0, 180) : "",
      activeLayerCount: Object.values(layers).filter((items) => items.length > 0).length,
      stabilizedLabel:
        matchedPlant?.name
        ?? (relatedPlants.length ? relatedPlants.map((plant) => plant.name).join(", ") : null)
        ?? parsed.plantPhrase
        ?? parsed.trait
        ?? parsed.normalized,
      slots,
      candidates: candidatesByField,
      stabilization,
      emission: {
        mode: matchStatus,
        outputType: relatedPlants.length ? "list" : "answer",
        answerPreview: answer ? String(answer).slice(0, 180) : ""
      },
      notes: [
        `Query intent "${parsed.intent ?? "lookup"}" activated ${layers.trigger.length} trigger/controller strands.`,
        `${layers.anchor.length} anchors and ${layers.composite.length} construct strands entered the expression field.`,
        keyHolder?.canRelate
          ? "Key holder accepted the query shape and allowed stabilization."
          : "Key holder did not find a stable local construct, so the field stayed provisional."
      ]
    }
  };
}
