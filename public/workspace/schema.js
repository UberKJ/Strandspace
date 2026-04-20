export const CONSTRUCT_TYPES = [
  "reference_lookup",
  "procedure",
  "configuration",
  "profile",
  "comparison",
  "diagnostic",
  "specification",
  "timeline",
  "classification",
  "hybrid"
];

export const TYPE_LABELS = {
  reference_lookup: "Reference / lookup",
  procedure: "Procedure / how-to",
  configuration: "Setup / configuration",
  profile: "Profile / entity",
  comparison: "Comparison",
  diagnostic: "Diagnostic",
  specification: "Specification / measurement",
  timeline: "Timeline",
  classification: "Classification",
  hybrid: "Hybrid"
};

export const TYPE_HINTS = {
  reference_lookup: "Best for tables, mappings, codes, and lookups you want answered locally.",
  procedure: "Best for ordered steps, checklists, and repeatable flows.",
  configuration: "Best for settings grids and environment-specific setups.",
  profile: "Best for a person/entity profile and preferences.",
  comparison: "Best for comparing options with a stable rubric.",
  diagnostic: "Best for symptoms, causes, checks, and decision rules.",
  specification: "Best for measurements, constraints, and spec grids.",
  timeline: "Best for milestones, dates, and ordered events.",
  classification: "Best for categories and rules to assign a label.",
  hybrid: "Mix-and-match fields when the topic spans multiple types."
};

export const STEP_DEFS = {
  topic: { label: "Topic", prompt: "What is the topic?", hint: "Example: resistor color codes, onboarding checklist, lens selection." },
  construct_type: { label: "Type", prompt: "What type of construct is this?", hint: "Pick the closest match. You can change it later." },
  purpose: { label: "Purpose", prompt: "What is the purpose?", hint: "What this construct helps you do or return." },
  core_entities: { label: "Core entities", prompt: "What are the core entities?", hint: "One per line (device, system, person, nouns)." },
  attributes: { label: "Attributes", prompt: "What attributes/settings matter?", hint: "Capture stable key/value context for local reconstruction." },
  steps: { label: "Steps", prompt: "What are the steps?", hint: "Ordered steps or checklist items." },
  rules: { label: "Rules", prompt: "What are the rules?", hint: "Decision rules, constraints, or guidance." },
  lookup_table: { label: "Lookup table", prompt: "What is the lookup table?", hint: "Paste JSON mapping (supports nested objects)." },
  examples: { label: "Examples", prompt: "Examples (optional)", hint: "One per line. Keep them short and realistic." },
  diagnostic: { label: "Diagnostic", prompt: "Capture symptoms, causes, and checks", hint: "Keep it explainable and local-first." },
  specification: { label: "Specifications", prompt: "Capture measurements/specs", hint: "Key/value measurements, limits, or units." },
  tags: { label: "Tags", prompt: "Tags (optional)", hint: "Comma-separated." },
  title: { label: "Title", prompt: "Title (optional)", hint: "Suggested only after you have enough structure." },
  retrieval_keys: { label: "Retrieval keys", prompt: "Retrieval keys (optional)", hint: "Words/phrases that should retrieve this construct." },
  trigger_phrases: { label: "Trigger phrases", prompt: "Trigger phrases (optional)", hint: "Phrases that should strongly match this construct." }
};

export function typeLabel(type = "") {
  return TYPE_LABELS[String(type ?? "").trim()] ?? "Hybrid";
}

export function buildStepSequence(constructType = "") {
  const type = String(constructType ?? "").trim();
  const base = ["topic", "construct_type"];

  const byType = {
    reference_lookup: ["purpose", "core_entities", "lookup_table", "rules", "examples", "tags", "title"],
    procedure: ["purpose", "core_entities", "steps", "rules", "tags", "title"],
    configuration: ["purpose", "core_entities", "attributes", "rules", "tags", "title"],
    profile: ["purpose", "core_entities", "attributes", "tags", "title"],
    comparison: ["purpose", "core_entities", "attributes", "rules", "examples", "tags", "title"],
    diagnostic: ["purpose", "core_entities", "diagnostic", "rules", "tags", "title"],
    specification: ["purpose", "core_entities", "specification", "rules", "tags", "title"],
    timeline: ["purpose", "core_entities", "steps", "attributes", "tags", "title"],
    classification: ["purpose", "core_entities", "lookup_table", "rules", "tags", "title"],
    hybrid: ["purpose", "core_entities", "attributes", "steps", "rules", "tags", "title"]
  };

  const rest = byType[type] ?? byType.hybrid;
  return [...base, ...rest, "retrieval_keys", "trigger_phrases"];
}

