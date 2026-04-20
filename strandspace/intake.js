import { recallTopicspace, TOPIC_CONSTRUCT_TYPES } from "./topicspace.js";
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

export async function analyzeTopicIntake(db, { topic = "", draft = null } = {}) {
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
      draft: draft && typeof draft === "object" ? draft : {},
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

