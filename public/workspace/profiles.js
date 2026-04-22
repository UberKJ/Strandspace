import { typeLabel } from "./schema.js";

export const SUBJECT_PROFILES = {
  recipe: {
    id: "recipe",
    label: "Recipe builder",
    required: [
      "title",
      "purpose",
      "core_entities",
      "attributes",
      "linked_construct_ids",
      "steps",
      "rules",
      "tags",
      "retrieval_keys"
    ],
    questions: {
      title: "What should this recipe be called?",
      purpose: "What dietary goal, health constraint, or eating situation should this recipe satisfy?",
      core_entities: "What are the main ingredients, meal type, and nutrition cues?",
      attributes: "Capture servings, yield, carb target, net-carb notes, and any dietary constraints.",
      linked_construct_ids: "Which saved ingredient facts should this recipe link to?",
      steps: "What are the recipe steps, in order?",
      rules: "What substitutions, safety rules, or diabetic constraints should retrieval preserve?",
      tags: "What tags should make this recipe easy to find later?",
      retrieval_keys: "What phrases should recall this recipe?"
    }
  },
  "ingredient-library": {
    id: "ingredient-library",
    label: "Ingredient library",
    required: [
      "title",
      "core_entities",
      "attributes",
      "rules",
      "tags",
      "retrieval_keys"
    ],
    questions: {
      title: "What ingredient fact should this construct store?",
      core_entities: "What ingredient names, brands, or serving units belong here?",
      attributes: "Store serving unit, carbs, net carbs, nutrition notes, substitutions, and source notes.",
      rules: "What retrieval rules should prevent misleading substitutions or bad nutrition matches?",
      tags: "What tags should group this with the right ingredient library?",
      retrieval_keys: "What phrases should recall this ingredient fact?"
    }
  }
};

export function detectSubjectProfile(draft = {}) {
  const haystack = [
    draft?.topic,
    draft?.title,
    draft?.purpose,
    ...(Array.isArray(draft?.tags) ? draft.tags : []),
    ...(Array.isArray(draft?.core_entities) ? draft.core_entities : [])
  ].join(" ").toLowerCase();

  if (!haystack.trim()) return null;
  if (/\bingredients?\b|\bingredient\s+library\b|\braw\s+ingredients?\b/.test(haystack) && !/\b(recipe|meal)\b/.test(haystack)) {
    return SUBJECT_PROFILES["ingredient-library"];
  }
  if (/\b(recipe|meal|diabetic|ingredients?)\b/.test(haystack)) {
    return SUBJECT_PROFILES.recipe;
  }
  return null;
}

export function profileLabel(profile) {
  return profile?.label || "";
}

export function profileQuestion(profile, key, fallback = "") {
  return profile?.questions?.[key] || fallback;
}

export function fieldHasValue(draft = {}, key = "") {
  const nulls = new Set(Array.isArray(draft.null_fields) ? draft.null_fields : []);
  if (nulls.has(key)) return true;
  const value = draft[key];
  if (value === null) return true;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean).length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

export function missingProfileFields(draft = {}) {
  const profile = detectSubjectProfile(draft);
  if (!profile) {
    const missing = [];
    if (!fieldHasValue(draft, "topic")) missing.push("topic");
    if (!fieldHasValue(draft, "construct_type")) missing.push("construct_type");
    return missing;
  }
  return profile.required.filter((key) => !fieldHasValue(draft, key));
}

export function isProfileDraftComplete(draft = {}) {
  return missingProfileFields(draft).length === 0 && fieldHasValue(draft, "topic") && fieldHasValue(draft, "construct_type");
}

export function fieldDisplayName(key = "") {
  const names = {
    construct_type: "type",
    core_entities: "entities",
    lookup_table: "lookup",
    retrieval_keys: "retrieval phrases",
    trigger_phrases: "trigger phrases",
    linked_construct_ids: "linked ingredients"
  };
  return names[key] || key.replaceAll("_", " ");
}

export function titleForProfile(draft = {}) {
  const topic = String(draft.topic ?? "").trim();
  if (!topic) return "";
  const profile = detectSubjectProfile(draft);
  if (profile?.id === "recipe") {
    return /\brecipe\b/i.test(topic) ? topic : `${topic} recipe`;
  }
  if (profile?.id === "ingredient-library") {
    return /\bingredient/i.test(topic) ? topic : `${topic} ingredient facts`;
  }
  return `${topic} - ${typeLabel(String(draft.construct_type ?? "").trim() || "hybrid")}`;
}
