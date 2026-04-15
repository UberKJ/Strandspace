function ruleSummary(rule) {
  if (!rule) {
    return null;
  }

  return {
    id: rule.id,
    label: rule.label,
    description: rule.description,
    layer: rule.layer
  };
}

const INTENT_RULES = [
  {
    id: "compare-objects",
    label: "Compare objects",
    description: "Opens a comparison path so multiple answer candidates can stay visible.",
    layer: "intent",
    intent: "compare"
  },
  {
    id: "list-by-trait",
    label: "List by trait",
    description: "Allows a field of related constructs to express together instead of forcing one winner.",
    layer: "intent",
    intent: "list"
  },
  {
    id: "yesno-check",
    label: "Yes or no check",
    description: "Narrows retrieval to evidence that can support or reject a direct claim.",
    layer: "intent",
    intent: "yesno"
  },
  {
    id: "lookup-construct",
    label: "Lookup construct",
    description: "Uses a single construct lookup path and stabilizes the strongest local answer.",
    layer: "intent",
    intent: "lookup"
  }
];

const ATTRIBUTE_RULES = [
  {
    id: "what-color",
    label: "What color",
    description: "Prioritizes visible color anchors and flower-color composites.",
    layer: "attribute",
    attribute: "primary_color",
    anchorNames: ["primary_color", "secondary_color"],
    exactCompositeNames: ["pink_yellow_flower_profile"]
  },
  {
    id: "what-soil",
    label: "What soil",
    description: "Prioritizes soil, pH, and moisture anchors with soil composites.",
    layer: "attribute",
    attribute: "soil_type",
    anchorNames: ["soil_type", "pH", "moisture"],
    compositeTerms: ["soil"]
  },
  {
    id: "light-check",
    label: "Light check",
    description: "Prioritizes light, moisture, and structure anchors with shade and sun composites.",
    layer: "attribute",
    attribute: "sunlight",
    anchorNames: ["sunlight", "moisture", "growth_habit"],
    compositeTerms: ["shade", "sun"]
  },
  {
    id: "height-check",
    label: "Height check",
    description: "Prioritizes mature height anchors and tall-growth composites.",
    layer: "attribute",
    attribute: "height",
    anchorNames: ["height"],
    compositeTerms: ["tall"]
  },
  {
    id: "fragrance-check",
    label: "Fragrance check",
    description: "Prioritizes scent-related anchors and aromatic signature composites.",
    layer: "attribute",
    attribute: "fragrance",
    anchorNames: ["fragrance", "bloom_type", "season"],
    compositeTerms: ["aromatic", "signature"]
  },
  {
    id: "season-check",
    label: "Season check",
    description: "Prioritizes bloom-season anchors and seasonal pollinator composites.",
    layer: "attribute",
    attribute: "season",
    anchorNames: ["season", "bloom_type", "sunlight"],
    compositeTerms: ["pollinator", "season"]
  },
  {
    id: "wildlife-check",
    label: "Wildlife check",
    description: "Prioritizes wildlife anchors and native-pollinator composites.",
    layer: "attribute",
    attribute: "wildlife",
    anchorNames: ["wildlife", "bloom_type", "season"],
    compositeTerms: ["pollinator", "native"]
  },
  {
    id: "companion-check",
    label: "Companion check",
    description: "Prioritizes companion anchors and cooperative planting composites.",
    layer: "attribute",
    attribute: "companions",
    anchorNames: ["companions", "growth_habit", "moisture"],
    compositeTerms: ["herb", "rose", "pollinator"]
  },
  {
    id: "maintenance-check",
    label: "Maintenance check",
    description: "Prioritizes care anchors and reusable maintenance profiles.",
    layer: "attribute",
    attribute: "maintenance",
    anchorNames: ["maintenance", "growth_habit", "season"],
    compositeTerms: ["profile"]
  },
  {
    id: "edible-check",
    label: "Edible check",
    description: "Prioritizes edible anchors and culinary-use composites.",
    layer: "attribute",
    attribute: "edible",
    anchorNames: ["plant_type", "companions", "maintenance", "edible"],
    compositeTerms: ["culinary"]
  }
];

const DEFAULT_ATTRIBUTE_RULE = {
  id: "general-lookup",
  label: "General lookup",
  description: "Keeps the field broad enough to stabilize a general plant answer.",
  layer: "attribute",
  attribute: null,
  anchorNames: ["plant_type", "primary_color", "secondary_color", "sunlight", "fragrance", "season"],
  compositeTerms: [],
  useAllComposites: true
};

const DEFAULT_LIST_RULE = {
  id: "list-environment-fit",
  label: "List environment fit",
  description: "Uses broad environmental anchors to surface a field of related plants.",
  layer: "attribute",
  attribute: null,
  anchorNames: ["sunlight"],
  compositeTerms: ["shade", "sun"]
};

function matchesComposite(rule, strand) {
  if (!rule) {
    return false;
  }

  if (rule.useAllComposites) {
    return true;
  }

  if (Array.isArray(rule.exactCompositeNames) && rule.exactCompositeNames.includes(strand.name)) {
    return true;
  }

  return Array.isArray(rule.compositeTerms)
    ? rule.compositeTerms.some((term) => strand.name.includes(term))
    : false;
}

export function resolveControllerState(parsed) {
  const resolvedIntentRule = INTENT_RULES.find((rule) => rule.intent === (parsed.intent ?? "lookup")) ?? INTENT_RULES.find((rule) => rule.intent === "lookup");
  const attributeRule =
    parsed.intent === "list"
      ? (ATTRIBUTE_RULES.find((rule) => rule.attribute === parsed.attribute) ?? DEFAULT_LIST_RULE)
      : (ATTRIBUTE_RULES.find((rule) => rule.attribute === parsed.attribute) ?? DEFAULT_ATTRIBUTE_RULE);

  return {
    primary: ruleSummary(attributeRule),
    active: [ruleSummary(resolvedIntentRule), ruleSummary(attributeRule)].filter(Boolean),
    intentRule: resolvedIntentRule,
    attributeRule,
    notes: [
      resolvedIntentRule?.description,
      attributeRule?.description
    ].filter(Boolean)
  };
}

export function buildActivationPlan(parsed) {
  const state = resolveControllerState(parsed);
  const attributeRule = state.attributeRule ?? DEFAULT_ATTRIBUTE_RULE;

  return {
    controllerIds: state.active.map((rule) => rule.id),
    anchors: attributeRule.anchorNames ?? [],
    useAllComposites: Boolean(attributeRule.useAllComposites),
    exactCompositeNames: attributeRule.exactCompositeNames ?? [],
    compositeTerms: attributeRule.compositeTerms ?? [],
    includeTaxonomy: true,
    notes: state.notes
  };
}

export function filterActivatedStrands({ parsed, anchors = [], composites = [], taxonomy = [] }) {
  const plan = buildActivationPlan(parsed);
  const selectedAnchors = anchors.filter((strand) => plan.anchors.includes(strand.name));
  const selectedComposites = composites.filter((strand) => matchesComposite({
    useAllComposites: plan.useAllComposites,
    exactCompositeNames: plan.exactCompositeNames,
    compositeTerms: plan.compositeTerms
  }, strand));

  return {
    plan,
    anchors: selectedAnchors,
    composites: selectedComposites,
    activated: [...selectedAnchors, ...selectedComposites, ...taxonomy]
  };
}
