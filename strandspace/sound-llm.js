import { parseSoundQuestion } from "./soundspace.js";

function toSlug(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferGoal(parsed) {
  if (parsed.sourceType === "speaker system") {
    return "front of house coverage";
  }
  if (parsed.eventType === "karaoke") {
    return "karaoke vocal support";
  }
  if (parsed.eventType === "music bingo") {
    return "clear host mic";
  }
  if (parsed.sourceType === "playback") {
    return "clean playback support";
  }
  if (parsed.sourceType === "microphone") {
    return parsed.eventType === "speech" ? "clear spoken voice" : "live vocal clarity";
  }
  if (parsed.sourceType === "acoustic guitar") {
    return "clear acoustic instrument";
  }
  if (parsed.sourceType === "electric guitar") {
    return "controlled guitar amp capture";
  }
  if (parsed.sourceType === "bass guitar") {
    return "solid bass foundation";
  }
  if (parsed.sourceType === "keyboard") {
    return "balanced keyboard input";
  }
  if (parsed.sourceType === "percussion") {
    return "controlled percussion impact";
  }
  return "general live setup";
}

function inferSpeakerConfig(parsed) {
  if (Array.isArray(parsed.deviceMatches) && parsed.deviceMatches.length >= 2) {
    const models = parsed.deviceMatches.map((entry) => entry.model);
    if (models.includes("L1 Pro8") && models.includes("ZLX-8P-G2")) {
      return "two Bose L1 Pro8 mains with two EV ZLX-8P-G2 stage monitors";
    }
    if (models.includes("L1 Pro8")) {
      return "two Bose L1 Pro8 mains";
    }
  }
  if (parsed.sourceType === "speaker system") {
    if (/\b(two|pair|stereo)\b/.test(String(parsed.raw ?? "").toLowerCase())) {
      return "two column arrays as front of house";
    }
    return "single column array front of house";
  }
  if (parsed.sourceType === "playback") {
    return "stereo mains for playback";
  }
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

function inferToneMatchPreset(parsed) {
  if (parsed.sourceType === "speaker system") {
    return null;
  }

  if (parsed.presetCategory || parsed.presetName) {
    return {
      system: "ToneMatch",
      category: parsed.presetCategory ?? null,
      name: parsed.presetName ?? null
    };
  }

  if (parsed.sourceType === "playback") {
    return {
      system: "ToneMatch",
      category: "DJ/Playback",
      name: "Flat, zEQ Controls"
    };
  }

  if (parsed.sourceType === "microphone") {
    if (parsed.sourceModel === "Headworn") {
      return {
        system: "ToneMatch",
        category: "Vocal Mics",
        name: "Headworn Mics"
      };
    }

    return {
      system: "ToneMatch",
      category: "Vocal Mics",
      name: "Handheld Mics"
    };
  }

  if (parsed.sourceType === "acoustic guitar") {
    return {
      system: "ToneMatch",
      category: "Acoustic Guitars",
      name: "Steel String w/ piezo"
    };
  }

  if (parsed.sourceType === "electric guitar") {
    return {
      system: "ToneMatch",
      category: "Electric Guitars",
      name: "Mic'd Amp w/ SM57"
    };
  }

  if (parsed.sourceType === "bass guitar") {
    return {
      system: "ToneMatch",
      category: "Basses",
      name: "Active Bass 1"
    };
  }

  if (parsed.sourceType === "keyboard") {
    return {
      system: "ToneMatch",
      category: "Keyboards",
      name: "General Keys"
    };
  }

  if (parsed.sourceType === "percussion") {
    return {
      system: "ToneMatch",
      category: "Percussion",
      name: parsed.raw?.toLowerCase().includes("overhead") ? "General Overhead" : "Kick, General"
    };
  }

  return {
    system: "ToneMatch",
    category: "Utility",
    name: "Flat"
  };
}

function inferMicProfile(parsed) {
  if (parsed.sourceBrand !== "Shure" || !parsed.sourceModel) {
    return null;
  }

  if (parsed.sourceModel === "SM58") {
    return {
      gain: "Use the general vocal gain structure, but expect the SM58 to stay comfortable with strong handheld singing before feedback when placement is solid.",
      eq: "Keep the low end tidy, cut muddy low mids first, and use only a light presence lift because the SM58 already carries familiar vocal presence.",
      monitor: "The SM58 is forgiving for handheld vocals, but keep wedges off-axis and watch for cupping that can wake up feedback.",
      notes: "SM58 strand: reliable general vocal starting point for rotating singers and spoken announcements."
    };
  }

  if (parsed.sourceModel === "Beta 58A") {
    return {
      gain: "Set gain with a little extra care because the Beta 58A can feel more forward and present once the singer leans in.",
      eq: "Start flatter in the presence range than you would on an SM58, then trim harshness before adding more brightness.",
      monitor: "Use the tighter pattern to your advantage, but keep monitor placement disciplined because singers will notice the hotter top end quickly.",
      notes: "Beta 58A strand: more focused pattern and brighter vocal edge than a general handheld dynamic."
    };
  }

  if (parsed.sourceModel === "SM57") {
    return {
      gain: "Plan for a little more gain than a typical vocal mic and make sure the performer stays on-axis if this is doing vocal duty.",
      eq: "Shape upper mids carefully so speech stays clear without getting nasal, and do not overboost highs to compensate.",
      monitor: "Keep the mic position consistent because tone and gain shift more quickly when a singer drifts off-axis on an SM57.",
      notes: "SM57 strand: workable vocal profile when needed, but less forgiving than a dedicated handheld vocal mic."
    };
  }

  return null;
}

function buildSetup({ parsed, goal, baseConstruct = null }) {
  const voiceLike = parsed.sourceType === "microphone" || !parsed.sourceType;
  const karaoke = parsed.eventType === "karaoke";
  const musicBingo = parsed.eventType === "music bingo";
  const largeRoom = parsed.venueSize === "large";
  const baseSetup = baseConstruct?.setup ?? {};
  const micProfile = inferMicProfile(parsed);
  const toneMatch = inferToneMatchPreset(parsed);
  const gearChain = parsed.gearChain ?? null;
  const systemResetNote = parsed.wantsSystemReset
    ? "System reset request: cover the signal path from microphone capsules through receivers, dynamics, mixer, mains, and monitors."
    : null;
  const detailNote = parsed.wantsDetailedWalkthrough
    ? "User asked for step-by-step, exact-value starting points, so each section should be explicit enough to follow during a reset."
    : null;

  if (parsed.sourceType === "speaker system") {
    return {
      toneMatch: baseSetup.toneMatch ?? null,
      system: baseSetup.system ?? "Run the pair as the main front of house system and keep source EQ flat before reshaping the speakers themselves.",
      gain: baseSetup.gain ?? "Bring the system up until speech and music cover the room cleanly without pushing the speaker limiters.",
      eq: baseSetup.eq ?? "Start flat, trim harsh upper mids only if the room gets edgy, and avoid heavy low boosts until boundary buildup is checked.",
      fx: baseSetup.fx ?? null,
      monitor: baseSetup.monitor ?? "If performers need more level, use a dedicated monitor path instead of pushing the FOH columns harder.",
      placement: baseSetup.placement ?? "Place the columns slightly ahead of the microphones, keep them wide enough for even coverage, and aim for coverage before loudness.",
      notes: [
        baseSetup.notes,
        `Goal: ${goal}.`,
        parsed.deviceBrand || parsed.deviceModel ? `Built for ${[parsed.deviceBrand, parsed.deviceModel].filter(Boolean).join(" ")}.` : null,
        `Speaker role: ${parsed.sourceType}.`,
        parsed.eventType ? `Context: ${parsed.eventType}.` : null,
        parsed.venueSize ? `Venue: ${parsed.venueSize}.` : null,
        gearChain ? `Recognized gear chain: ${gearChain}.` : null,
        systemResetNote,
        detailNote
      ].filter(Boolean).join(" ")
    };
  }

  const defaultSetup = {
    toneMatch: toneMatch?.name
      ? `${toneMatch.system ?? "ToneMatch"} preset ${[toneMatch.category, toneMatch.name].filter(Boolean).join(" > ")}`
      : null,
    system: null,
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
      : "Keep the mic behind the mains, use speaker placement first, and notch feedback gently before adding level."
  };

  return {
    toneMatch: baseSetup.toneMatch ?? defaultSetup.toneMatch,
    system: baseSetup.system ?? defaultSetup.system,
    gain: micProfile?.gain ?? baseSetup.gain ?? defaultSetup.gain,
    eq: micProfile?.eq ?? baseSetup.eq ?? defaultSetup.eq,
    fx: micProfile?.fx ?? baseSetup.fx ?? defaultSetup.fx,
    monitor: micProfile?.monitor ?? baseSetup.monitor ?? defaultSetup.monitor,
    placement: baseSetup.placement ?? null,
    notes: [
      baseSetup.notes,
      micProfile?.notes,
      `Goal: ${goal}.`,
      parsed.deviceBrand || parsed.deviceModel ? `Built for ${[parsed.deviceBrand, parsed.deviceModel].filter(Boolean).join(" ")}.` : null,
      parsed.sourceBrand || parsed.sourceModel
        ? `Source: ${[parsed.sourceBrand, parsed.sourceModel, parsed.sourceType].filter(Boolean).join(" ")}.`
        : null,
      toneMatch?.name ? `Preset: ${[toneMatch.category, toneMatch.name].filter(Boolean).join(" > ")}.` : null,
      parsed.eventType ? `Context: ${parsed.eventType}.` : null,
      parsed.venueSize ? `Venue: ${parsed.venueSize}.` : null,
      gearChain ? `Recognized gear chain: ${gearChain}.` : null,
      systemResetNote,
      detailNote
    ].filter(Boolean).join(" ")
  };
}

function buildStrands({ parsed, goal, baseConstruct = null }) {
  return Array.from(new Set([
    ...(baseConstruct?.strands ?? []),
    parsed.deviceBrand ? `brand:${toSlug(parsed.deviceBrand)}` : null,
    parsed.deviceModel ? `device:${toSlug(parsed.deviceModel)}` : null,
    parsed.sourceType ? `source:${toSlug(parsed.sourceType)}` : null,
    parsed.sourceBrand ? `source-brand:${toSlug(parsed.sourceBrand)}` : null,
    parsed.sourceModel ? `mic:${toSlug(`${parsed.sourceBrand ?? "unknown"} ${parsed.sourceModel}`)}` : null,
    parsed.presetCategory ? `preset-category:${toSlug(parsed.presetCategory)}` : null,
    parsed.presetName ? `preset:${toSlug(parsed.presetName)}` : null,
    parsed.eventType ? `event:${toSlug(parsed.eventType)}` : null,
    parsed.venueSize ? `venue:${toSlug(parsed.venueSize)}` : null,
    `goal:${toSlug(goal)}`,
    "setup:gain_staging",
    "setup:eq_shaping",
    "setup:feedback_control",
    parsed.sourceType === "speaker system" ? "system:front_of_house" : null
  ].filter(Boolean)));
}

export function buildSoundConstructFromQuestion(question = "", options = {}) {
  const parsed = parseSoundQuestion(question);
  const baseConstruct = options.baseConstruct && typeof options.baseConstruct === "object"
    ? options.baseConstruct
    : null;
  const inferredPreset = inferToneMatchPreset({
    ...parsed,
    raw: question
  });
  const resolved = {
    ...parsed,
    deviceBrand: parsed.deviceBrand ?? baseConstruct?.deviceBrand ?? null,
    deviceModel: parsed.deviceModel ?? baseConstruct?.deviceModel ?? null,
    deviceType: parsed.deviceType ?? baseConstruct?.deviceType ?? null,
    sourceType: parsed.sourceType ?? baseConstruct?.sourceType ?? (parsed.deviceType === "speaker_system" ? "speaker system" : "microphone"),
    sourceBrand: parsed.sourceBrand ?? baseConstruct?.sourceBrand ?? null,
    sourceModel: parsed.sourceModel ?? baseConstruct?.sourceModel ?? null,
    presetSystem: parsed.presetSystem ?? baseConstruct?.presetSystem ?? inferredPreset?.system ?? null,
    presetCategory: parsed.presetCategory ?? baseConstruct?.presetCategory ?? inferredPreset?.category ?? null,
    presetName: parsed.presetName ?? baseConstruct?.presetName ?? inferredPreset?.name ?? null,
    eventType: parsed.eventType ?? baseConstruct?.eventType ?? "general",
    venueSize: parsed.venueSize ?? baseConstruct?.venueSize ?? "small"
  };

  if (!resolved.deviceModel) {
    throw new Error("A recognizable device model is required before building a sound construct.");
  }

  const goal = inferGoal(resolved);
  const eventType = resolved.eventType ?? "general";
  const venueSize = resolved.venueSize ?? "small";
  const speakerConfig = baseConstruct?.speakerConfig ?? inferSpeakerConfig(resolved);
  const sourceType = resolved.sourceType ?? "microphone";
  const sourceDescriptor = [resolved.sourceBrand, resolved.sourceModel, sourceType].filter(Boolean).join(" ");
  const presetDescriptor = [resolved.presetCategory, resolved.presetName].filter(Boolean).join(" ");
  const name = `${resolved.deviceBrand ?? ""} ${resolved.deviceModel} ${eventType} ${sourceDescriptor || sourceType} ${presetDescriptor} ${venueSize} setup`
    .replace(/\s+/g, " ")
    .trim();
  const id = [
    resolved.deviceBrand,
    resolved.deviceModel,
    eventType,
    resolved.sourceBrand,
    resolved.sourceModel,
    resolved.presetCategory,
    resolved.presetName,
    sourceType,
    venueSize
  ]
    .filter(Boolean)
    .map((part) => toSlug(part))
    .join("-");

  return {
    id,
    name,
    deviceBrand: resolved.deviceBrand ?? null,
    deviceModel: resolved.deviceModel ?? null,
    deviceType: options.deviceType ?? resolved.deviceType ?? baseConstruct?.deviceType ?? "mixer",
    sourceType,
    sourceBrand: resolved.sourceBrand ?? null,
    sourceModel: resolved.sourceModel ?? null,
    presetSystem: resolved.presetSystem ?? null,
    presetCategory: resolved.presetCategory ?? null,
    presetName: resolved.presetName ?? null,
    goal,
    venueSize,
    eventType,
    speakerConfig,
    setup: buildSetup({ parsed: resolved, goal, baseConstruct }),
    tags: Array.from(new Set([
      ...(baseConstruct?.tags ?? []),
      sourceType,
      resolved.sourceBrand,
      resolved.sourceModel,
      resolved.presetSystem,
      resolved.presetCategory,
      resolved.presetName,
      goal,
      eventType,
      venueSize,
      speakerConfig,
      presetDescriptor
    ].filter(Boolean))),
    strands: buildStrands({ parsed: resolved, goal, baseConstruct }),
    llmSummary: `Generated setup for ${name}. This stands in for an LLM-authored construct until a live model is attached.`,
    provenance: {
      source: options.provider ?? "heuristic-llm",
      model: options.model ?? "soundspace-template-v1",
      derivedFromConstructId: baseConstruct?.id ?? null,
      learnedFromQuestion: question
    }
  };
}
