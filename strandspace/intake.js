import { listTopicConstructs, recallTopicspace, TOPIC_CONSTRUCT_TYPES } from "./topicspace.js";
import { getOpenAiAssistStatus, generateOpenAiTopicIntakeInference } from "./openai-assist.js";

function normalizeTopic(topic = "") {
  return String(topic ?? "").trim().replace(/\s+/g, " ");
}

function clampList(list, limit) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, limit);
}

function inferConstructTypeHeuristic(topic = "") {
  const t = String(topic ?? "").toLowerCase();
  if (/\b(color\s*codes?|lookup|mapping|map|reference|codes?)\b/.test(t)) return "reference_lookup";
  if (/\b(how\s*to|steps?|checklist|workflow|process)\b/.test(t)) return "procedure";
  if (/\b(setup|configure|configuration|install|deployment|env|environment|settings?)\b/.test(t)) return "configuration";
  if (/\b(profile|preferences?|persona|bio)\b/.test(t)) return "profile";
  if (/\b(compare|comparison|vs\.?|versus|tradeoffs?)\b/.test(t)) return "comparison";
  if (/\b(troubleshoot|debug|diagnos|error|fails?|issue)\b/.test(t)) return "diagnostic";
  if (/\b(spec|specification|measure|measurement|dimensions?|tolerance|limits?)\b/.test(t)) return "specification";
  if (/\b(timeline|roadmap|milestones?|schedule|dates?)\b/.test(t)) return "timeline";
  if (/\b(classif|categor|taxonomy|label)\b/.test(t)) return "classification";
  return "hybrid";
}

function inferPurposeHeuristic(topic = "", constructType = "hybrid") {
  const cleanTopic = normalizeTopic(topic);
  const type = TOPIC_CONSTRUCT_TYPES.includes(constructType) ? constructType : "hybrid";

  const templates = {
    reference_lookup: `Look up ${cleanTopic} values and translate them into an answer quickly.`,
    procedure: `Provide a repeatable, step-by-step process for ${cleanTopic}.`,
    configuration: `Capture the key settings and steps needed to set up ${cleanTopic}.`,
    profile: `Store a stable profile for ${cleanTopic} so it can be recalled consistently.`,
    comparison: `Compare options within ${cleanTopic} using a consistent rubric.`,
    diagnostic: `Troubleshoot ${cleanTopic} with symptoms, checks, and likely causes.`,
    specification: `Capture the measurements, constraints, and specs for ${cleanTopic}.`,
    timeline: `Track key milestones and dates for ${cleanTopic}.`,
    classification: `Classify ${cleanTopic} inputs into an output category using stable rules.`,
    hybrid: `Capture the essential structure for ${cleanTopic} so Strandspace can answer locally.`
  };

  return templates[type] ?? templates.hybrid;
}

function inferCoreEntitiesHeuristic(topic = "") {
  const tokens = normalizeTopic(topic).split(/[\s/,-]+/g).filter(Boolean);
  const filtered = tokens
    .map((token) => token.replace(/[^\p{L}\p{N}_]+/gu, "").trim())
    .filter((token) => token.length >= 3)
    .slice(0, 6);
  return [...new Set(filtered)];
}

function detectProfile(topic = "", draft = {}) {
  const haystack = [
    topic,
    draft?.title,
    draft?.purpose,
    ...(Array.isArray(draft?.tags) ? draft.tags : []),
    ...(Array.isArray(draft?.core_entities) ? draft.core_entities : [])
  ].join(" ").toLowerCase();
  if (/\bingredients?\b|\bingredient\s+library\b|\braw\s+ingredients?\b/.test(haystack) && !/\b(recipe|meal)\b/.test(haystack)) {
    return "ingredient-library";
  }
  if (/\b(recipe|meal|diabetic|ingredients?)\b/.test(haystack)) {
    return "recipe";
  }
  return "";
}

function listIngredientCandidates(db) {
  return listTopicConstructs(db).filter((construct) => {
    const haystack = [
      construct?.topic,
      construct?.title,
      construct?.purpose,
      ...(Array.isArray(construct?.tags) ? construct.tags : []),
      ...(Array.isArray(construct?.core_entities) ? construct.core_entities : [])
    ].join(" ").toLowerCase();
    return /\bingredients?\b|carb|nutrition|substitution|serving/.test(haystack);
  }).slice(0, 8);
}

function buildLocalFieldSuggestion(db, { topic = "", draft = {}, fieldKey = "", attempt = 0 } = {}) {
  const normalizedTopic = normalizeTopic(topic);
  const profile = detectProfile(normalizedTopic, draft);
  const entities = inferCoreEntitiesHeuristic(normalizedTopic);
  const nudge = attempt > 1 ? "Alternative suggestion: " : "";

  if (fieldKey === "title") {
    const value = profile === "ingredient-library"
      ? `${normalizedTopic} ingredient facts`
      : profile === "recipe"
        ? (/\brecipe\b/i.test(normalizedTopic) ? normalizedTopic : `${normalizedTopic} recipe`)
        : `${normalizedTopic} - ${inferConstructTypeHeuristic(normalizedTopic).replaceAll("_", " ")}`;
    return {
      fieldKey,
      value,
      reason: "Generated from the committed topic without overwriting a manual title.",
      alternatives: [`${normalizedTopic} quick reference`, `${normalizedTopic} reusable construct`]
    };
  }

  if (fieldKey === "purpose") {
    const value = profile === "recipe"
      ? `${nudge}Build a diabetic-friendly recipe with clear ingredient quantities, serving/yield notes, steps, and carb-aware constraints.`
      : profile === "ingredient-library"
        ? `${nudge}Store reusable ingredient facts such as serving size, carbs, substitutions, and source notes for local recipe recall.`
        : inferPurposeHeuristic(normalizedTopic, inferConstructTypeHeuristic(normalizedTopic));
    return { fieldKey, value, reason: "Purpose inferred from the topic profile.", alternatives: [] };
  }

  if (fieldKey === "core_entities") {
    const value = profile === "recipe"
      ? [...new Set([...entities, "recipe", "ingredients", "servings", "carbohydrates"])].slice(0, 10)
      : profile === "ingredient-library"
        ? [...new Set([...entities, "serving unit", "carbs", "net carbs", "substitution"])].slice(0, 10)
        : entities;
    return { fieldKey, value, reason: "Entity list inferred from topic terms and profile cues.", alternatives: [] };
  }

  if (fieldKey === "attributes") {
    const value = profile === "recipe"
      ? {
          dietary_goal: "diabetic-friendly",
          servings_or_yield: "",
          carb_target_or_notes: "",
          nutrition_notes: ""
        }
      : profile === "ingredient-library"
        ? {
            ingredient_name: entities[0] || normalizedTopic,
            serving_unit: "",
            total_carbs: "",
            net_carbs: "",
            nutrition_notes: "",
            source_notes: ""
          }
        : { profile: normalizedTopic, notes: "" };
    return { fieldKey, value, reason: "Structured fields match the active subject profile.", alternatives: [] };
  }

  if (fieldKey === "linked_construct_ids") {
    const candidates = listIngredientCandidates(db);
    return {
      fieldKey,
      value: candidates.map((construct) => construct.id).filter(Boolean).slice(0, 5),
      reason: candidates.length
        ? "Local ingredient constructs are available to link into this recipe."
        : "No local ingredient constructs found yet; save ingredient facts first.",
      alternatives: candidates.map((construct) => ({ id: construct.id, title: construct.title || construct.topic })).slice(0, 5)
    };
  }

  if (fieldKey === "steps") {
    const value = profile === "recipe"
      ? [
          "Confirm the ingredient list and serving/yield target.",
          "Measure ingredients by the linked ingredient facts.",
          "Prepare, cook, or assemble in the safest order for the recipe.",
          "Review carb notes and substitutions before saving."
        ]
      : ["Capture the setup inputs.", "Apply the stored rules.", "Verify the output locally."];
    return { fieldKey, value, reason: "Starter steps are intentionally generic until the user accepts or edits them.", alternatives: [] };
  }

  if (fieldKey === "rules") {
    const value = profile === "recipe"
      ? [
          "Do not treat AI nutrition values as medical advice.",
          "Prefer linked ingredient facts over guessed nutrition values.",
          "Keep substitutions explicit so recall does not swap ingredients silently."
        ]
      : ["Prefer exact local facts over inferred suggestions.", "Ask for more detail when required fields are missing."];
    return { fieldKey, value, reason: "Rules protect recall from overgeneralizing the construct.", alternatives: [] };
  }

  if (fieldKey === "tags") {
    const value = profile === "recipe"
      ? ["recipe", "diabetic", "ingredients", "nutrition"]
      : profile === "ingredient-library"
        ? ["ingredient-library", "diabetic", "nutrition", "carbs"]
        : [inferConstructTypeHeuristic(normalizedTopic), ...entities.slice(0, 3)];
    return { fieldKey, value, reason: "Tags are based on subject profile and topic tokens.", alternatives: [] };
  }

  if (fieldKey === "retrieval_keys" || fieldKey === "trigger_phrases") {
    const value = [
      normalizedTopic,
      `recall ${normalizedTopic}`,
      profile === "recipe" ? `${normalizedTopic} ingredients` : `${normalizedTopic} facts`
    ];
    return { fieldKey, value, reason: "Retrieval phrases are generated from the committed topic.", alternatives: [] };
  }

  return {
    fieldKey,
    value: "",
    reason: "No local field suggestion is available for this field yet.",
    alternatives: []
  };
}

function summarizeCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).slice(0, 5).map((c) => ({
    id: String(c?.id ?? ""),
    topic: String(c?.topic ?? ""),
    title: String(c?.title ?? ""),
    construct_type: String(c?.construct_type ?? ""),
    purpose: String(c?.purpose ?? ""),
    core_entities: clampList(c?.core_entities, 10),
    score: Number(c?.score ?? 0) || 0,
    confidence: Number(c?.confidence ?? 0) || 0
  }));
}

function buildDefaultInference({ topic, recall }) {
  const matched = recall?.matched ?? null;
  const constructType = matched?.construct_type && TOPIC_CONSTRUCT_TYPES.includes(matched.construct_type)
    ? matched.construct_type
    : inferConstructTypeHeuristic(topic);

  const purpose = String(matched?.purpose ?? "").trim() || inferPurposeHeuristic(topic, constructType);
  const coreEntities = clampList(matched?.core_entities, 10);
  const entities = coreEntities.length ? coreEntities : inferCoreEntitiesHeuristic(topic);

  if (recall?.ready && matched) {
    return {
      source: "local",
      construct_type: constructType,
      purpose,
      core_entities: entities,
      confidence: Number(recall.confidence ?? 0.55) || 0.55,
      next_question_kind: "offer_match",
      next_question: "I found a saved construct that looks like a match. Do you want to reuse it, merge it, or start a new one?",
      suggested_options: ["Reuse", "Merge", "Start new"],
      matched_construct_id: String(matched.id ?? "").trim() || null
    };
  }

  return {
    source: "heuristic",
    construct_type: constructType,
    purpose,
    core_entities: entities,
    confidence: Math.max(0.25, Number(recall?.confidence ?? 0.35) || 0.35),
    next_question_kind: "confirm_type",
    next_question: `This topic seems like a ${constructType.replaceAll("_", " ")}. Is that right?`,
    suggested_options: ["Yes", "Change it"]
  };
}

function mergeInference(base, override) {
  if (!override || typeof override !== "object") return base;
  const constructType = TOPIC_CONSTRUCT_TYPES.includes(String(override.construct_type ?? "").trim())
    ? String(override.construct_type).trim()
    : base.construct_type;

  const purpose = String(override.purpose ?? "").trim() || base.purpose;
  const coreEntities = clampList(override.core_entities, 10);
  const nextQuestion = String(override.next_question ?? "").trim() || base.next_question;
  const nextKind = String(override.next_question_kind ?? "").trim() || base.next_question_kind;
  const suggestedOptions = clampList(override.suggested_options, 6);

  return {
    ...base,
    source: String(override.source ?? base.source),
    construct_type: constructType,
    purpose,
    core_entities: coreEntities.length ? coreEntities : base.core_entities,
    confidence: Number.isFinite(Number(override.confidence))
      ? Math.max(0, Math.min(1, Number(override.confidence)))
      : base.confidence,
    next_question: nextQuestion,
    next_question_kind: nextKind,
    suggested_options: suggestedOptions.length ? suggestedOptions : base.suggested_options,
    matched_construct_id: String(override.matched_construct_id ?? base.matched_construct_id ?? "").trim() || base.matched_construct_id || null
  };
}

export async function analyzeTopicIntake(db, { topic = "", draft = null, mode = "", fieldKey = "", attempt = 0 } = {}) {
  const normalizedTopic = normalizeTopic(topic);
  if (!normalizedTopic) {
    return {
      ok: true,
      topic: "",
      recall: { question: "", topic: null, matched: null, candidates: [], confidence: 0, ready: false },
      inference: null
    };
  }

  const recall = recallTopicspace(db, { question: normalizedTopic, topic: "" });
  const candidates = summarizeCandidates(recall.candidates);

  const base = buildDefaultInference({ topic: normalizedTopic, recall: { ...recall, candidates } });
  const normalizedDraft = draft && typeof draft === "object" ? draft : {};

  if (String(mode ?? "").trim() === "suggest_field") {
    const suggestion = buildLocalFieldSuggestion(db, {
      topic: normalizedTopic,
      draft: normalizedDraft,
      fieldKey: String(fieldKey ?? "").trim(),
      attempt
    });

    return {
      ok: true,
      topic: normalizedTopic,
      recall: { ...recall, candidates },
      inference: base,
      fieldSuggestion: suggestion
    };
  }

  const assistStatus = getOpenAiAssistStatus();
  const allowAssist = Boolean(assistStatus?.enabled);
  const shouldAssist = allowAssist && (!recall.ready || Number(recall.confidence ?? 0) < 0.6);

  if (!shouldAssist) {
    return { ok: true, topic: normalizedTopic, recall: { ...recall, candidates }, inference: base };
  }

  try {
    const assist = await generateOpenAiTopicIntakeInference({
      topic: normalizedTopic,
      localMatches: candidates.slice(0, 3),
      draft: normalizedDraft,
      model: assistStatus.model
    });
    const merged = mergeInference(base, { ...assist?.inference, source: "openai" });
    return {
      ok: true,
      topic: normalizedTopic,
      recall: { ...recall, candidates },
      inference: merged,
      assist: {
        responseId: assist?.responseId ?? null,
        model: assist?.model ?? assistStatus.model ?? null,
        usage: assist?.usage ?? null
      }
    };
  } catch (error) {
    return {
      ok: true,
      topic: normalizedTopic,
      recall: { ...recall, candidates },
      inference: base,
      assist: {
        error: String(error?.message ?? "OpenAI inference failed")
      }
    };
  }
}
