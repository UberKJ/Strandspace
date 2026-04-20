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
  reuse_match: { label: "Possible fit", prompt: "I found a saved construct that looks like a match.", hint: "Reuse it, merge it, or start a new one." },
  construct_type: { label: "Type", prompt: "What kind of topic is this?", hint: "Strandspace will suggest a type. You can change it any time." },
  purpose: { label: "Purpose", prompt: "What should this topic help you do?", hint: "One sentence is enough." },
  core_entities: { label: "Key things", prompt: "What are the key things involved?", hint: "A few nouns is enough (device, person, system, options)." },
  attributes: { label: "Details", prompt: "What details matter for reliable answers?", hint: "Add a few key/value details (no code needed)." },
  steps: { label: "Steps", prompt: "What are the steps?", hint: "Short steps are best." },
  rules: { label: "Rules", prompt: "Any rules or constraints?", hint: "Decision rules help local reconstruction." },
  lookup_table: { label: "Lookups", prompt: "What should this topic look up?", hint: "Add a few example mappings (no JSON needed)." },
  examples: { label: "Examples", prompt: "Examples (optional)", hint: "A couple short examples is enough." },
  diagnostic: { label: "Diagnostic", prompt: "What symptoms, causes, and checks matter?", hint: "Keep it explainable and local-first." },
  specification: { label: "Specifications", prompt: "What measurements or constraints matter?", hint: "Capture key/value measurements and units." },
  tags: { label: "Tags", prompt: "Tags (optional)", hint: "Short, comma-separated labels." },
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
