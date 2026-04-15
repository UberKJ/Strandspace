import { normalizeText, parseQuestion } from "./parser.js";
import { buildKeyHolderStrand } from "./matcher.js";
import { normalizeAudience, rankStrandsWithLearning } from "./v2.js";
import { performance } from "node:perf_hooks";

const WIKIPEDIA_SEARCH_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const WIKIPEDIA_SUMMARY_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const COMMONS_SEARCH_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const DUCKDUCKGO_ENDPOINT = "https://api.duckduckgo.com/";

const ATTRIBUTE_TERMS = {
  primary_color: ["color", "colour", "hue", "pink", "red", "yellow", "purple", "blue", "white", "green"],
  soil_type: ["soil", "loam", "drainage", "sandy", "clay", "rich"],
  sunlight: ["sun", "shade", "light", "partial"],
  height: ["tall", "height", "high", "short"],
  moisture: ["moisture", "water", "dry", "wet"],
  pH: ["ph", "acidic", "alkaline"],
  fragrance: ["fragrance", "scent", "smell", "aromatic"],
  season: ["season", "bloom", "flowering", "spring", "summer", "fall"],
  wildlife: ["pollinator", "bee", "butterfly", "bird", "wildlife"],
  companions: ["companion", "pair", "grow with"],
  maintenance: ["care", "prune", "trim", "maintain", "deadhead"],
  edible: ["edible", "culinary", "eat", "kitchen"]
};

function stripWikiMarkup(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/\([^)]*\)/g, "")
    .trim();
}

function chooseSentence(text = "") {
  const match = String(text).match(/[^.!?]+[.!?]/);
  return stripWikiMarkup(match ? match[0] : text);
}

function encodeQuery(value) {
  return encodeURIComponent(String(value)).replaceAll("%20", "+");
}

function normalizeProvider(provider = "wikipedia") {
  const normalized = String(provider).toLowerCase().trim();
  if (normalized === "auto" || normalized === "combined") {
    return "auto";
  }

  if (normalized === "duckduckgo" || normalized === "ddg") {
    return "duckduckgo";
  }

  return "wikipedia";
}

function gatherMemoryHints(state, audience, parsed) {
  const normalizedAudience = normalizeAudience(audience);
  const terms = new Set([
    ...(ATTRIBUTE_TERMS[parsed.attribute] ?? []),
    ...parsed.keywords,
    ...(parsed.plantPhrase ? parsed.plantPhrase.split(" ") : [])
  ]);

  let score = 0;
  for (const [key, value] of Object.entries(state?.strandUsage ?? {})) {
    if (!key.startsWith(`${normalizedAudience}:`)) {
      continue;
    }

    for (const term of terms) {
      if (term.length < 3) continue;
      if (key.includes(term)) {
        score += Number(value) || 0;
      }
    }
  }

  for (const [key, value] of Object.entries(state?.edgeWeights ?? {})) {
    const [source, target, edgeAudience] = key.split("|");
    if (edgeAudience !== "any" && edgeAudience !== normalizedAudience) {
      continue;
    }

    for (const term of terms) {
      if (source.includes(term) || target.includes(term)) {
        score += (Number(value?.weight) || 0) * 0.5;
      }
    }
  }

  score += Number(state?.audienceBias?.[normalizedAudience]?.anchor ?? 0) * 0.5;
  score += Number(state?.audienceBias?.[normalizedAudience]?.composite ?? 0) * 0.5;
  return score;
}

export function scoreExternalResult(parsed, result, state, audience = "gardener") {
  const normalizedAudience = normalizeAudience(audience);
  const haystack = normalizeText(
    [
      result.title,
      result.description,
      result.extract,
      ...(result.categories ?? [])
    ]
      .filter(Boolean)
      .join(" ")
  );
  const tokens = parsed.keywords.filter((token) => token.length >= 3);
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 5;
    }
  }

  if (parsed.plantPhrase && haystack.includes(normalizeText(parsed.plantPhrase))) {
    score += 25;
  }

  if (parsed.attribute && ATTRIBUTE_TERMS[parsed.attribute]) {
    for (const term of ATTRIBUTE_TERMS[parsed.attribute]) {
      if (haystack.includes(term)) {
        score += 10;
      }
    }
  }

  if (haystack.includes("plant")) {
    score += 5;
  }

  score += gatherMemoryHints(state, normalizedAudience, parsed) * 0.25;
  return score;
}

async function searchWikipedia(query, fetchImpl) {
  const searchUrl = new URL(WIKIPEDIA_SEARCH_ENDPOINT);
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("srlimit", "5");

  const response = await fetchImpl(searchUrl);
  if (!response.ok) {
    throw new Error(`Wikipedia search failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload?.query?.search ?? [];
}

async function searchDuckDuckGo(query, fetchImpl) {
  const url = new URL(DUCKDUCKGO_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("no_redirect", "1");
  url.searchParams.set("skip_disambig", "1");
  url.searchParams.set("pretty", "1");

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with ${response.status}`);
  }

  const payload = await response.json();
  const results = [];

  if (payload?.Heading || payload?.AbstractText) {
    results.push({
      title: payload.Heading || query,
      description: payload.AbstractSource || payload.AbstractURL || "DuckDuckGo instant answer",
      extract: payload.AbstractText || payload.Answer || payload.Heading || "",
      url: payload.AbstractURL || payload.Redirect || null,
      thumbnail: null,
      source: "duckduckgo"
    });
  }

  for (const item of payload?.Results ?? []) {
    if (!item?.Text && !item?.FirstURL) continue;
    results.push({
      title: item.Text || query,
      description: item.Result ? stripWikiMarkup(item.Result) : "DuckDuckGo result",
      extract: item.Text || item.Result || "",
      url: item.FirstURL ?? null,
      thumbnail: null,
      source: "duckduckgo"
    });
  }

  for (const item of payload?.RelatedTopics ?? []) {
    if (item?.Text) {
      results.push({
        title: item.Text,
        description: item.Result ? stripWikiMarkup(item.Result) : "DuckDuckGo related topic",
        extract: item.Text,
        url: item.FirstURL ?? null,
        thumbnail: null,
        source: "duckduckgo"
      });
    }

    if (Array.isArray(item?.Topics)) {
      for (const topic of item.Topics) {
        if (!topic?.Text) continue;
        results.push({
          title: topic.Text,
          description: topic.Result ? stripWikiMarkup(topic.Result) : "DuckDuckGo related topic",
          extract: topic.Text,
          url: topic.FirstURL ?? null,
          thumbnail: null,
          source: "duckduckgo"
        });
      }
    }
  }

  return results;
}

async function fetchSummary(title, fetchImpl) {
  const summaryUrl = `${WIKIPEDIA_SUMMARY_ENDPOINT}${encodeURIComponent(title)}`;
  const response = await fetchImpl(summaryUrl, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return null;
  }

  const summary = await response.json();
  return {
    title: summary.title ?? title,
    description: summary.description ?? "",
    extract: summary.extract ?? "",
    url: summary?.content_urls?.desktop?.page ?? summary?.content_urls?.mobile?.page ?? summary?.content_urls?.web?.page ?? null,
    thumbnail: summary?.thumbnail?.source ?? null,
    source: "wikipedia"
  };
}

async function searchCommonsImages(query, fetchImpl) {
  const commonsUrl = new URL(COMMONS_SEARCH_ENDPOINT);
  commonsUrl.searchParams.set("action", "query");
  commonsUrl.searchParams.set("generator", "search");
  commonsUrl.searchParams.set("gsrsearch", query);
  commonsUrl.searchParams.set("gsrnamespace", "6");
  commonsUrl.searchParams.set("gsrlimit", "5");
  commonsUrl.searchParams.set("prop", "imageinfo");
  commonsUrl.searchParams.set("iiprop", "url|extmetadata");
  commonsUrl.searchParams.set("iiurlwidth", "480");
  commonsUrl.searchParams.set("format", "json");
  commonsUrl.searchParams.set("origin", "*");

  const response = await fetchImpl(commonsUrl);
  if (!response.ok) {
    throw new Error(`Wikimedia Commons search failed with ${response.status}`);
  }

  const payload = await response.json();
  const pages = Object.values(payload?.query?.pages ?? {});
  return pages
    .map((page) => {
      const imageInfo = page?.imageinfo?.[0] ?? null;
      const title = String(page?.title ?? "").replace(/^File:/, "") || query;
      return {
        title,
        description:
          imageInfo?.extmetadata?.ImageDescription?.value ??
          imageInfo?.extmetadata?.ObjectName?.value ??
          "Wikimedia Commons image",
        extract:
          imageInfo?.extmetadata?.ImageDescription?.value ??
          imageInfo?.extmetadata?.ObjectName?.value ??
          title,
        url: imageInfo?.descriptionurl ?? imageInfo?.url ?? null,
        thumbnail: imageInfo?.thumburl ?? imageInfo?.url ?? null,
        source: "wikimedia-commons"
      };
    })
    .filter((item) => item.title || item.url || item.thumbnail);
}

function buildSearchQuery(question, parsed) {
  const base = parsed.plantPhrase || parsed.trait || parsed.normalized || question;
  const attributeBoost = parsed.attribute ? ATTRIBUTE_TERMS[parsed.attribute]?.slice(0, 3).join(" ") : "";
  return [base, attributeBoost].filter(Boolean).join(" ").trim();
}

export async function searchExternalKnowledge(question, options = {}) {
  const parsed = options.parsed ?? parseQuestion(question);
  const fetchImpl = options.fetchImpl ?? fetch;
  const query = buildSearchQuery(question, parsed);
  const memoryState = options.learningState ?? null;
  const provider = normalizeProvider(options.provider);
  const providers = provider === "auto" ? ["wikipedia", "duckduckgo"] : [provider];
  const searchResults = [];

  for (const selectedProvider of providers) {
    const providerResults =
      selectedProvider === "duckduckgo"
        ? await searchDuckDuckGo(query, fetchImpl)
        : await searchWikipedia(query, fetchImpl);

    searchResults.push(...providerResults.map((item) => ({ ...item, provider: selectedProvider })));
  }

  const enriched = [];
  for (const item of searchResults.slice(0, options.limit ?? 3)) {
    const summary =
      item.provider === "duckduckgo"
        ? item
        : await fetchSummary(item.title, fetchImpl);

    if (!summary) continue;

    enriched.push({
      ...summary,
      provider: item.provider ?? summary.source ?? "wikipedia",
      searchScore: scoreExternalResult(parsed, summary, memoryState, options.audience),
      pageid: item.pageid ?? null
    });
  }

  enriched.sort((a, b) => b.searchScore - a.searchScore || a.title.localeCompare(b.title));

  return {
    query,
    parsed,
    results: enriched
  };
}

export async function resolveFlowerThumbnail(flower, options = {}) {
  const title = String(flower?.title ?? flower?.name ?? options.query ?? "flower").trim();
  const query = String(options.query ?? [title, "flower"].filter(Boolean).join(" ")).trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = performance.now();
  const search = await searchExternalKnowledge(query, {
    provider: options.provider ?? "wikipedia",
    limit: options.limit ?? 3,
    fetchImpl: options.fetchImpl,
    audience: options.audience,
    learningState: options.learningState
  });
  const searchMs = performance.now() - started;
  let bestResult = search.results.find((item) => item.thumbnail) ?? search.results[0] ?? null;

  if (!bestResult?.thumbnail) {
    try {
      const commonsResults = await searchCommonsImages(query, fetchImpl);
      const bestCommons = commonsResults.find((item) => item.thumbnail) ?? commonsResults[0] ?? null;
      if (bestCommons) {
        bestResult = {
          ...bestCommons,
          provider: "wikimedia-commons",
          searchScore: bestCommons.thumbnail ? 10 : 0
        };
      }
    } catch {
      // Keep the Wikipedia result or fall back to a link-only record.
    }
  }

  return {
    query: search.query,
    searchMs,
    title,
    provider: bestResult?.provider ?? options.provider ?? "wikipedia",
    bestResult: bestResult
      ? {
          title: bestResult.title,
          description: bestResult.description,
          extract: bestResult.extract,
          url: bestResult.url,
          thumbnail: bestResult.thumbnail,
          provider: bestResult.provider,
          searchScore: bestResult.searchScore
        }
      : null,
    results: search.results
  };
}

function buildPlantThumbnailQuery(plant = {}) {
  const anchors = plant.anchors ?? {};
  const bits = [
    plant.name,
    plant.title,
    plant.constructStrand,
    anchors.primary_color,
    anchors.secondary_color,
    anchors.plant_type,
    anchors.growth_habit
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  const query = bits.length > 0 ? bits.slice(0, 4).join(" ") : "plant";
  return `${query} plant`.trim();
}

export async function resolvePlantThumbnail(plant, options = {}) {
  const title = String(plant?.title ?? plant?.name ?? options.query ?? "plant").trim();
  const query = String(options.query ?? buildPlantThumbnailQuery(plant)).trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = performance.now();
  const search = await searchExternalKnowledge(query, {
    provider: options.provider ?? "wikipedia",
    limit: options.limit ?? 5,
    fetchImpl,
    audience: options.audience,
    learningState: options.learningState
  });
  const searchMs = performance.now() - started;
  let bestResult = search.results.find((item) => item.thumbnail) ?? search.results[0] ?? null;

  if (!bestResult?.thumbnail) {
    try {
      const commonsResults = await searchCommonsImages(query, fetchImpl);
      const bestCommons = commonsResults.find((item) => item.thumbnail) ?? commonsResults[0] ?? null;
      if (bestCommons) {
        bestResult = {
          ...bestCommons,
          provider: "wikimedia-commons",
          searchScore: bestCommons.thumbnail ? 10 : 0
        };
      }
    } catch {
      // Keep the Wikipedia result or fall back to a link-only record.
    }
  }

  return {
    query: search.query,
    searchMs,
    title,
    provider: bestResult?.provider ?? options.provider ?? "wikipedia",
    bestResult: bestResult
      ? {
          title: bestResult.title,
          description: bestResult.description,
          extract: bestResult.extract,
          url: bestResult.url,
          thumbnail: bestResult.thumbnail,
          provider: bestResult.provider,
          searchScore: bestResult.searchScore
        }
      : null,
    results: search.results
  };
}

function baseExternalTrace(parsed, result) {
  const keyHolder = buildKeyHolderStrand(null, parsed, {
    source: result.provider ?? result.source ?? "outside",
    identifier: result.title,
    label: result.title,
    canRelate: Number(result.searchScore ?? 0) > 20,
    reason: Number(result.searchScore ?? 0) > 20
      ? "outside result shape matches the question"
      : "round peg in a square hole: the outside result only loosely fits the question"
  });
  const activated = [
    keyHolder,
    {
      kind: "anchor",
      name: "external_source",
      value: result.source ?? "web",
      plant: result.title
    },
    {
      kind: "anchor",
      name: "external_topic",
      value: result.title,
      plant: result.title
    },
    {
      kind: "composite",
      name: "external_knowledge_profile",
      value: chooseSentence(result.extract || result.description || result.title),
      plant: result.title
    }
  ];

  if (parsed.attribute) {
    activated.push({
      kind: "anchor",
      name: parsed.attribute,
      value: parsed.trait || result.title,
      plant: result.title
    });
  }

  return {
    keyHolder,
    anchors: activated.filter((item) => item.kind === "anchor"),
    composites: activated.filter((item) => item.kind === "composite"),
    activated
  };
}

export function buildExternalTrace(parsed, result, audience = "gardener", learningState) {
  const trace = baseExternalTrace(parsed, result);
  return {
    ...trace,
    activated: rankStrandsWithLearning(trace.activated, audience, learningState)
  };
}

export function buildExternalAnswer(question, parsed, result, audience = "gardener", learningState) {
  const normalizedAudience = normalizeAudience(audience);
  const snippet = chooseSentence(result.extract || result.description || result.title || question);
  const sourceLabel = result.source ?? "outside source";

  if (normalizedAudience === "child") {
    return `I looked outside too. ${result.title} is a simple match for this question: ${snippet}`;
  }

  if (normalizedAudience === "scientist") {
    return `External search found ${result.title}. ${snippet} Source: ${sourceLabel}.`;
  }

  const memoryHint = learningState?.updatedAt ? " The learned strand memory also helped rank this result." : "";
  return `Outside search found ${result.title}. ${snippet}.${memoryHint}`;
}

export { searchCommonsImages };
