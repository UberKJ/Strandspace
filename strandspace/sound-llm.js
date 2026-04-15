import { parseSoundQuestion } from "./soundspace.js";

function toSlug(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferGoal(parsed) {
  if (parsed.eventType === "karaoke") {
    return "karaoke vocal support";
  }
  if (parsed.eventType === "music bingo") {
    return "clear host mic";
  }
  if (parsed.sourceType === "microphone") {
    return parsed.eventType === "speech" ? "clear spoken voice" : "live vocal clarity";
  }
  if (parsed.sourceType === "acoustic guitar") {
    return "clear acoustic instrument";
  }
  if (parsed.sourceType === "keyboard") {
    return "balanced keyboard input";
  }
  return "general live setup";
}

function inferSpeakerConfig(parsed) {
  if (parsed.eventType === "karaoke") {
    return "portable powered speakers";
  }
  if (parsed.eventType === "music bingo") {
    return "two mains plus host monitor";
  }
  if (parsed.venueSize === "large") {
    return "two mains with sub support";
  }
  if (parsed.venueSize === "medium") {
    return "two mains on stands";
  }
  return "compact powered mains";
}

function buildSetup({ parsed, goal }) {
  const voiceLike = parsed.sourceType === "microphone" || !parsed.sourceType;
  const karaoke = parsed.eventType === "karaoke";
  const musicBingo = parsed.eventType === "music bingo";
  const largeRoom = parsed.venueSize === "large";

  return {
    gain: voiceLike
      ? (largeRoom
          ? "Set preamp for strong vocal peaks with clear headroom before feedback starts to build."
          : "Raise input gain until strong speech or singing peaks cleanly without clipping.")
      : "Bring the channel up until the source is present and clean, then leave a little headroom.",
    eq: musicBingo
      ? "Prioritize intelligibility: cut mud first, keep the low end tidy, and add only enough presence for clear clue calls."
      : karaoke
        ? "Keep EQ simple: trim lows, cut mud before boosting highs, and leave enough body so singers do not sound thin."
        : "Roll off rumble, trim muddy low mids, and add a touch of presence only if the source sounds dull.",
    fx: musicBingo
      ? "Keep effects nearly dry so every announcement stays easy to understand."
      : karaoke
        ? "Use a short vocal reverb or delay for support, but keep it controlled so lyrics stay clear."
        : "Start with light reverb only, then add more only if the room and performers need it.",
    monitor: largeRoom
      ? "Keep speakers forward of the microphone and solve feedback with position and cuts before reaching for more gain."
      : "Keep the mic behind the mains, use speaker placement first, and notch feedback gently before adding level.",
    notes: [
      `Goal: ${goal}.`,
      parsed.deviceBrand || parsed.deviceModel ? `Built for ${[parsed.deviceBrand, parsed.deviceModel].filter(Boolean).join(" ")}.` : null,
      parsed.eventType ? `Context: ${parsed.eventType}.` : null,
      parsed.venueSize ? `Venue: ${parsed.venueSize}.` : null
    ].filter(Boolean).join(" ")
  };
}

function buildStrands({ parsed, goal }) {
  return [
    parsed.deviceBrand ? `brand:${toSlug(parsed.deviceBrand)}` : null,
    parsed.deviceModel ? `device:${toSlug(parsed.deviceModel)}` : null,
    parsed.sourceType ? `source:${toSlug(parsed.sourceType)}` : null,
    parsed.eventType ? `event:${toSlug(parsed.eventType)}` : null,
    parsed.venueSize ? `venue:${toSlug(parsed.venueSize)}` : null,
    `goal:${toSlug(goal)}`,
    "setup:gain_staging",
    "setup:eq_shaping",
    "setup:feedback_control"
  ].filter(Boolean);
}

export function buildSoundConstructFromQuestion(question = "", options = {}) {
  const parsed = parseSoundQuestion(question);
  if (!parsed.deviceModel) {
    throw new Error("A recognizable device model is required before building a sound construct.");
  }

  const goal = inferGoal(parsed);
  const eventType = parsed.eventType ?? "general";
  const venueSize = parsed.venueSize ?? "small";
  const speakerConfig = inferSpeakerConfig(parsed);
  const sourceType = parsed.sourceType ?? "microphone";
  const name = `${parsed.deviceBrand ?? ""} ${parsed.deviceModel} ${eventType} ${sourceType} ${venueSize} setup`
    .replace(/\s+/g, " ")
    .trim();
  const id = [
    parsed.deviceBrand,
    parsed.deviceModel,
    eventType,
    sourceType,
    venueSize
  ]
    .filter(Boolean)
    .map((part) => toSlug(part))
    .join("-");

  return {
    id,
    name,
    deviceBrand: parsed.deviceBrand ?? null,
    deviceModel: parsed.deviceModel ?? null,
    deviceType: options.deviceType ?? "mixer",
    sourceType,
    goal,
    venueSize,
    eventType,
    speakerConfig,
    setup: buildSetup({ parsed, goal }),
    tags: [sourceType, goal, eventType, venueSize, speakerConfig].filter(Boolean),
    strands: buildStrands({ parsed, goal }),
    llmSummary: `Generated setup for ${name}. This stands in for an LLM-authored construct until a live model is attached.`,
    provenance: {
      source: options.provider ?? "heuristic-llm",
      model: options.model ?? "soundspace-template-v1",
      learnedFromQuestion: question
    }
  };
}
