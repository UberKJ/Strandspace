const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "do",
  "does",
  "for",
  "from",
  "get",
  "has",
  "have",
  "how",
  "i",
  "is",
  "like",
  "me",
  "of",
  "plant",
  "plants",
  "please",
  "tell",
  "the",
  "to",
  "what",
  "which",
  "with"
]);

const ATTRIBUTE_PATTERNS = [
  { attribute: "primary_color", regex: /\bwhat (?:color|colour)\b/ },
  { attribute: "soil_type", regex: /\bwhat soil\b|\bsoil\b/ },
  { attribute: "sunlight", regex: /\bfull sun\b|\bsunlight\b|\bsun\b|\bshade\b/ },
  { attribute: "height", regex: /\bhow tall\b|\bheight\b/ },
  { attribute: "moisture", regex: /\bmoisture\b|\bwater\b|\bdry\b/ },
  { attribute: "pH", regex: /\bp\.?h\b/ },
  { attribute: "fragrance", regex: /\bsmell\b|\bfragrance\b|\bscent\b/ },
  { attribute: "season", regex: /\bseason\b|\bbloom\b|\bwhen\b/ },
  { attribute: "wildlife", regex: /\bpollinator\b|\bbee\b|\bbutterfly\b|\bbird\b/ },
  { attribute: "companions", regex: /\bcompanions?\b|\bgrow with\b|\bplant with\b/ },
  { attribute: "maintenance", regex: /\bmaintenance\b|\bcare\b|\bprune\b|\btrim\b/ },
  { attribute: "edible", regex: /\bedible\b|\beat\b|\bculinary\b/ }
];

const INTENT_PATTERNS = [
  { intent: "compare", regex: /\bcompare\b|\bdifference\b/ },
  { intent: "list", regex: /\bwhich plants\b|\bwhat plants\b/ },
  { intent: "yesno", regex: /\bdoes\b|\bdo\b|\bis\b|\bare\b|\bcan\b/ }
];

const AUDIENCE_PATTERNS = [
  { audience: "child", regex: /\b(child|kid|kids|children|young|student)\b/ },
  { audience: "gardener", regex: /\b(gardener|garden|gardening|grower)\b/ },
  { audience: "scientist", regex: /\b(scientist|science|scientific|botanist|researcher)\b/ }
];

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalized) {
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function guessIntent(normalized) {
  for (const pattern of INTENT_PATTERNS) {
    if (pattern.intent === "yesno" && !/^(?:does|do|is|are|can)\b/.test(normalized)) {
      continue;
    }

    if (pattern.regex.test(normalized)) {
      return pattern.intent;
    }
  }
  return "lookup";
}

function guessAttribute(normalized) {
  for (const pattern of ATTRIBUTE_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      return pattern.attribute;
    }
  }
  return null;
}

function guessAudience(normalized) {
  for (const pattern of AUDIENCE_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      return pattern.audience;
    }
  }

  return null;
}

function extractPlantPhrase(normalized) {
  let stripped = normalized
    .replace(
      /^\s*(?:what|which|how|does|do|is|are|can|tell me about|show me|compare)\s+/,
      ""
    )
    .replace(/\b(?:like|prefer|need|want|grow|get|reach|have|has)\b.*$/, "")
    .replace(
      /\b(?:what (?:color|colour|soil)|how tall|full sun|shade|sunlight|moisture|water|p\.?h)\b.*$/,
      ""
    )
    .trim();

  stripped = stripped.replace(
    /^(?:color|colour|soil|height|fragrance|smell|scent)\s+(?:is|does|do|like|need)?\s*/i,
    ""
  );
  stripped = stripped.replace(/\b(?:smell|scent|fragrance)\b.*$/i, "");

  const tokens = tokenize(stripped)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => token !== "tall");
  return tokens.join(" ").trim();
}

function extractTrait(normalized, attribute) {
  if (!normalized) return "";

  const afterLike = normalized.match(
    /\b(?:like|prefer|need|want|grow in|grow with|do better in)\s+(.+)$/
  );
  if (afterLike) {
    return afterLike[1].trim();
  }

  const byAttribute = {
    primary_color: normalized.replace(/\bwhat (?:color|colour)\b.*?\b(?:is|are|does|do)\b\s*/i, ""),
    soil_type: normalized.replace(/\bwhat soil\b.*?\b(?:is|does|do|like|need)\b\s*/i, ""),
    sunlight: normalized.replace(/\b(?:does|do|is|are|can)\b.*?\b(?:like|prefer|need|want)\b\s*/i, ""),
    height: normalized.replace(/\bhow tall\b.*?\b(?:does|do|is|are|can)\b\s*/i, "")
  };

  const value = attribute ? byAttribute[attribute] : "";
  return (value ?? "").replace(/^(?:a|an|the)\s+/, "").trim();
}

export function parseQuestion(question = "") {
  const raw = String(question ?? "");
  const normalized = normalizeText(raw);
  const tokens = tokenize(normalized);
  const keywords = tokens.filter((token) => !STOPWORDS.has(token));
  const intent = guessIntent(normalized);
  const attribute = guessAttribute(normalized);
  const audienceHint = guessAudience(normalized);
  const plantPhrase = extractPlantPhrase(normalized);
  const trait = extractTrait(normalized, attribute);

  return {
    raw,
    normalized,
    tokens,
    keywords,
    intent,
    attribute,
    audienceHint,
    plantPhrase,
    trait
  };
}

export { normalizeText };
