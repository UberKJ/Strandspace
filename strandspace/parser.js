const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "build",
  "compare",
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
  "my",
  "of",
  "please",
  "recall",
  "remember",
  "show",
  "tell",
  "the",
  "to",
  "what",
  "which",
  "with"
]);

const AUDIENCE_PATTERNS = [
  { audience: "child", regex: /\b(child|kid|kids|children|young|student)\b/ },
  { audience: "operator", regex: /\b(operator|engineer|technician|mix engineer)\b/ },
  { audience: "expert", regex: /\b(expert|specialist|researcher|advanced)\b/ }
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
  if (/\bcompare\b|\bvs\b|\bversus\b/.test(normalized)) {
    return "compare";
  }
  if (/^(?:does|do|is|are|can)\b/.test(normalized)) {
    return "yesno";
  }
  return "recall";
}

function guessAudience(normalized) {
  for (const pattern of AUDIENCE_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      return pattern.audience;
    }
  }

  return null;
}

export function parseQuestion(question = "") {
  const raw = String(question ?? "");
  const normalized = normalizeText(raw);
  const tokens = tokenize(normalized);
  const keywords = tokens.filter((token) => !STOPWORDS.has(token));

  return {
    raw,
    normalized,
    tokens,
    keywords,
    intent: guessIntent(normalized),
    audienceHint: guessAudience(normalized)
  };
}

export { normalizeText };
