import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, isAbsolute, join, normalize } from "node:path";
import { access, readFile, readdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import {
  ensureSoundspaceTables,
  listSoundConstructs,
  recallSoundspace,
  seedSoundspace,
  upsertSoundConstruct
} from "./strandspace/soundspace.js";
import { buildSoundConstructFromQuestion } from "./strandspace/sound-llm.js";
import {
  ensureSubjectspaceTables,
  listSubjectConstructs,
  listSubjectSpaces,
  recallSubjectSpace,
  seedSubjectspace,
  upsertSubjectConstruct
} from "./strandspace/subjectspace.js";
import {
  buildSuggestedConstructFromAssist,
  generateOpenAiSubjectAssist,
  getOpenAiAssistStatus
} from "./strandspace/openai-assist.js";
import {
  initDiabeticDb,
  recallDiabeticRecipe,
  saveDiabeticRecipe,
  listDiabeticRecipes,
  getDiabeticRecipeById,
  seedDiabeticRecipes,
  saveDiabeticBuilderSession,
  getDiabeticBuilderSession,
  deleteDiabeticBuilderSession
} from "./strandspace/diabeticspace.js";
import {
  adaptDiabeticRecipe,
  generateDiabeticRecipe,
  generateFromBuilderSession
} from "./strandspace/diabetic-assist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const configuredDatabasePath = String(process.env.STRANDSPACE_DB_PATH ?? "").trim();
const dataDir = join(__dirname, "data");
const preferredDatabasePath = join(__dirname, "data", "strandspace.sqlite");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

let database = null;
let databasePath = "";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function toLatencyMs(value) {
  return Number(Math.max(Number(value) || 0, 0.001).toFixed(3));
}

function measureSync(task) {
  const started = performance.now();
  const result = task();
  return {
    result,
    latencyMs: toLatencyMs(performance.now() - started)
  };
}

function readSubjectspaceParams(source = null) {
  if (source instanceof URL) {
    return {
      question: String(source.searchParams.get("q") ?? "").trim(),
      subjectId: String(source.searchParams.get("subjectId") ?? source.searchParams.get("subject") ?? "").trim()
    };
  }

  return {
    question: String(source?.question ?? source?.q ?? "").trim(),
    subjectId: String(source?.subjectId ?? source?.subject ?? "").trim()
  };
}

function buildSubjectspaceAnswerPayload(recall, { question = "", subjectId = "" } = {}) {
  return {
    ok: true,
    source: recall.ready ? "strandspace" : "unresolved",
    question,
    subjectId: recall.matched?.subjectId ?? subjectId,
    answer: recall.answer,
    construct: recall.matched,
    recall
  };
}

function resolveSubjectspaceLabel(db, subjectId, recall, subjects = null) {
  const subjectList = Array.isArray(subjects) ? subjects : listSubjectSpaces(db);
  return recall?.matched?.subjectLabel
    ?? subjectList.find((item) => item.subjectId === subjectId)?.subjectLabel
    ?? "General Recall";
}

function buildSubjectspaceBenchmark(localLatencyMs, llm = {}) {
  if (!llm.enabled) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: null,
      summary: `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. ${llm.reason}`
    };
  }

  if (llm.error) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: Number.isFinite(llm.latencyMs) ? toLatencyMs(Math.abs(Number(llm.latencyMs) - localLatencyMs)) : null,
      summary: Number.isFinite(llm.latencyMs)
        ? `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM path failed after ${Number(llm.latencyMs).toFixed(3)} ms: ${llm.error}`
        : `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM benchmark failed: ${llm.error}`
    };
  }

  if (!Number.isFinite(llm.latencyMs)) {
    return {
      available: false,
      faster: "strandbase",
      speedup: null,
      deltaMs: null,
      summary: `Strandbase recall answered in ${localLatencyMs.toFixed(3)} ms. The LLM benchmark failed${llm.error ? `: ${llm.error}` : "."}`
    };
  }

  const faster = localLatencyMs <= llm.latencyMs ? "strandbase" : "llm";
  const fasterLatency = faster === "strandbase" ? localLatencyMs : llm.latencyMs;
  const slowerLatency = faster === "strandbase" ? llm.latencyMs : localLatencyMs;
  const speedup = Number((slowerLatency / Math.max(fasterLatency, 0.001)).toFixed(1));
  const deltaMs = toLatencyMs(slowerLatency - fasterLatency);

  return {
    available: true,
    faster,
    speedup,
    deltaMs,
    summary: faster === "strandbase"
      ? `Strandbase recall was ${speedup}x faster than the LLM assist round-trip for this prompt.`
      : `The LLM assist round-trip was ${speedup}x faster than Strandbase recall for this prompt.`
  };
}

async function resolveDatabasePath() {
  if (databasePath) {
    return databasePath;
  }

  if (configuredDatabasePath) {
    databasePath = isAbsolute(configuredDatabasePath)
      ? configuredDatabasePath
      : join(__dirname, configuredDatabasePath);
    return databasePath;
  }

  try {
    await access(preferredDatabasePath);
    databasePath = preferredDatabasePath;
    return databasePath;
  } catch {
    // Fall through.
  }

  try {
    const entries = (await readdir(dataDir))
      .filter((name) => name.endsWith(".sqlite") && name !== "strandspace.sqlite")
      .sort((left, right) => left.localeCompare(right));

    if (entries[0]) {
      databasePath = join(dataDir, entries[0]);
      return databasePath;
    }
  } catch {
    // Fall through to the preferred path.
  }

  databasePath = preferredDatabasePath;
  return databasePath;
}

function openMemoryDatabase() {
  if (database) {
    return database;
  }

  if (!databasePath) {
    throw new Error("Database path has not been resolved yet.");
  }

  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL;");
  ensureSoundspaceTables(database);
  seedSoundspace(database);
  ensureSubjectspaceTables(database);
  seedSubjectspace(database);
  initDiabeticDb(database);
  seedDiabeticRecipes(database);
  return database;
}

async function readStaticFile(urlPath) {
  const cleaned =
    urlPath === "/"
      ? "/index.html"
      : (urlPath === "/soundspace" || urlPath === "/soundspace/" ? "/soundspace/index.html" : urlPath);
  const filePath = join(publicDir, cleaned.replace(/^\/+/, ""));

  if (!normalize(filePath).startsWith(normalize(publicDir))) {
    throw Object.assign(new Error("Invalid path"), { statusCode: 400 });
  }

  return readFile(filePath);
}

async function handleStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const resolvedPath =
    pathname === "/"
      ? "/index.html"
      : (pathname === "/soundspace" || pathname === "/soundspace/" ? "/soundspace/index.html" : pathname);
  const extension = extname(resolvedPath);

  try {
    const data = await readStaticFile(pathname);
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream"
    });
    res.end(data);
  } catch (error) {
    const statusCode = error?.code === "ENOENT" ? 404 : Number(error?.statusCode ?? 500);
    sendText(res, statusCode, statusCode === 404 ? "Not found" : "Internal server error");
  }
}

function soundConstructAnswerPayload(source, question, construct, recall) {
  return {
    ok: true,
    source,
    question,
    answer: recall.answer,
    construct,
    recall
  };
}

async function handleApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const db = openMemoryDatabase();

  if (url.pathname === "/api/diabetic/recipes") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const mealType = String(url.searchParams.get("meal_type") ?? "").trim();
    sendJson(res, 200, {
      ok: true,
      recipes: listDiabeticRecipes(db, mealType)
    });
    return;
  }

  if (url.pathname === "/api/diabetic/recipe") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const recipeId = String(url.searchParams.get("recipe_id") ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return;
    }

    const recipe = getDiabeticRecipeById(db, recipeId);
    if (!recipe) {
      sendJson(res, 404, { error: "Recipe not found" });
      return;
    }

    sendJson(res, 200, { ok: true, recipe });
    return;
  }

  if (url.pathname === "/api/diabetic/chat") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const message = String(payload.message ?? "").trim();
    if (!message) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }

    const started = performance.now();
    const recalled = recallDiabeticRecipe(db, message);
    const latency_ms = toLatencyMs(performance.now() - started);

    if (recalled) {
      const recall_count = Number(recalled.recall_count ?? 0);
      if (recall_count >= 2) {
        sendJson(res, 200, {
          route: "local_recall",
          recipe: recalled,
          recall_count,
          latency_ms
        });
        return;
      }

      try {
        const generated = await generateDiabeticRecipe(message, recalled);
        const saved = saveDiabeticRecipe(db, { ...generated, source: "ai" });
        sendJson(res, 200, {
          route: "api_validate",
          recipe: saved,
          recall_count: Number(saved?.recall_count ?? recall_count),
          latency_ms
        });
        return;
      } catch (error) {
        if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
          sendJson(res, 503, { error: "OPENAI_API_KEY not configured", route: "api_unavailable" });
          return;
        }

        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    try {
      const generated = await generateDiabeticRecipe(message, null);
      const saved = saveDiabeticRecipe(db, { ...generated, source: "ai" });
      sendJson(res, 200, {
        route: "api_expand",
        recipe: saved,
        recall_count: Number(saved?.recall_count ?? 0),
        latency_ms
      });
      return;
    } catch (error) {
      if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
        sendJson(res, 503, { error: "OPENAI_API_KEY not configured", route: "api_unavailable" });
        return;
      }

      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }

  if (url.pathname === "/api/diabetic/save") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const saved = saveDiabeticRecipe(db, payload);
    sendJson(res, 200, { saved: true, recipe_id: saved?.recipe_id ?? null });
    return;
  }

  if (url.pathname === "/api/diabetic/adapt") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const recipeId = String(payload.recipe_id ?? "").trim();
    const change = String(payload.change ?? "").trim();
    if (!recipeId) {
      sendJson(res, 400, { error: "recipe_id is required" });
      return;
    }
    if (!change) {
      sendJson(res, 400, { error: "change is required" });
      return;
    }

    const original = getDiabeticRecipeById(db, recipeId);
    if (!original) {
      sendJson(res, 404, { error: "Recipe not found" });
      return;
    }

    let adapted;
    try {
      adapted = await adaptDiabeticRecipe(change, original);
    } catch (error) {
      if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
        sendJson(res, 503, { error: "OPENAI_API_KEY not configured", route: "api_unavailable" });
        return;
      }
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      return;
    }

    let candidateId = `${original.recipe_id}-adapted`;
    let suffix = 1;
    while (getDiabeticRecipeById(db, candidateId)) {
      suffix += 1;
      candidateId = `${original.recipe_id}-adapted-${suffix}`;
      if (suffix > 25) {
        sendJson(res, 409, { error: "Unable to allocate unique adapted recipe_id" });
        return;
      }
    }

    const saved = saveDiabeticRecipe(db, { ...adapted, recipe_id: candidateId, source: "ai" });
    sendJson(res, 200, { route: "api_expand", recipe: saved, saved: true });
    return;
  }

  if (url.pathname === "/api/diabetic/builder/start") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const requestedSessionId = String(payload.session_id ?? "").trim();
    const existing = requestedSessionId ? getDiabeticBuilderSession(db, requestedSessionId) : null;
    const session_id = existing?.session_id ?? `diabetic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const stage = existing?.stage ?? "meal_type";

    const session = existing ?? saveDiabeticBuilderSession(db, {
      session_id,
      stage,
      original_query: ""
    });

    const prompt = "What kind of meal do you want to build? Breakfast, lunch, dinner, dessert, or snack?";
    sendJson(res, 200, { session_id, stage, prompt, session });
    return;
  }

  if (url.pathname === "/api/diabetic/builder/next") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const session_id = String(payload.session_id ?? "").trim();
    const answer = String(payload.answer ?? "").trim();
    if (!session_id) {
      sendJson(res, 400, { error: "session_id is required" });
      return;
    }
    if (!answer) {
      sendJson(res, 400, { error: "answer is required" });
      return;
    }

    const session = getDiabeticBuilderSession(db, session_id);
    if (!session) {
      sendJson(res, 404, { error: "Session not found" });
      return;
    }

    const promptsByStage = {
      meal_type: "What kind of meal do you want to build? Breakfast, lunch, dinner, dessert, or snack?",
      goal: "What is the main goal for this recipe? Examples: low-carb, high-protein, lower calorie, gluten-free, budget-friendly.",
      include_items: "What ingredients do you want to include? You can list several separated by commas.",
      avoid_items: "What ingredients or limits should I avoid? Examples: sugar, white flour, rice, potatoes, dairy, gluten.",
      servings: "How many servings do you want?",
      extra_notes: "Any extra notes? Examples: quick meal, one-pan, air fryer, no seafood, more flavor, kid-friendly."
    };

    const stageOrder = ["meal_type", "goal", "include_items", "avoid_items", "servings", "extra_notes", "review"];
    const currentStage = session.stage;

    if (currentStage === "review") {
      const normalized = answer.toLowerCase();
      if (normalized === "confirm") {
        sendJson(res, 200, {
          session_id,
          stage: "review",
          summary: {
            meal_type: session.meal_type,
            goal: session.goal,
            include_items: session.include_items,
            avoid_items: session.avoid_items,
            servings: session.servings,
            extra_notes: session.extra_notes
          },
          prompt: "Confirmed. Now call /api/diabetic/builder/complete to build the recipe."
        });
        return;
      }

      if (normalized.startsWith("edit ")) {
        const field = normalized.slice(5).trim();
        const allowed = new Set(["meal_type", "goal", "include_items", "avoid_items", "servings", "extra_notes"]);
        if (!allowed.has(field)) {
          sendJson(res, 200, {
            session_id,
            stage: "review",
            summary: {
              meal_type: session.meal_type,
              goal: session.goal,
              include_items: session.include_items,
              avoid_items: session.avoid_items,
              servings: session.servings,
              extra_notes: session.extra_notes
            },
            prompt: "Reply 'confirm' to build the recipe, or say 'edit <field>' to change one part."
          });
          return;
        }

        const updated = saveDiabeticBuilderSession(db, {
          ...session,
          stage: field
        });
        sendJson(res, 200, {
          session_id,
          stage: field,
          prompt: promptsByStage[field] ?? "Answer the next question.",
          session: updated
        });
        return;
      }

      sendJson(res, 200, {
        session_id,
        stage: "review",
        summary: {
          meal_type: session.meal_type,
          goal: session.goal,
          include_items: session.include_items,
          avoid_items: session.avoid_items,
          servings: session.servings,
          extra_notes: session.extra_notes
        },
        prompt: "Reply 'confirm' to build the recipe, or say 'edit <field>' to change one part."
      });
      return;
    }

    const nextIndex = Math.max(0, stageOrder.indexOf(currentStage)) + 1;
    const nextStage = stageOrder[nextIndex] ?? "review";

    const patch = { ...session };
    if (currentStage === "meal_type") {
      patch.meal_type = answer.toLowerCase().trim();
    } else if (currentStage === "goal") {
      patch.goal = answer.trim();
    } else if (currentStage === "include_items") {
      patch.include_items = answer.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (currentStage === "avoid_items") {
      patch.avoid_items = answer.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (currentStage === "servings") {
      const parsed = Number(answer);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        sendJson(res, 200, {
          session_id,
          stage: currentStage,
          prompt: promptsByStage.servings,
          session
        });
        return;
      }
      patch.servings = Math.round(parsed);
    } else if (currentStage === "extra_notes") {
      patch.extra_notes = answer.trim();
    }

    patch.stage = nextStage;
    const saved = saveDiabeticBuilderSession(db, patch);

    if (nextStage === "review") {
      sendJson(res, 200, {
        session_id,
        stage: "review",
        summary: {
          meal_type: saved.meal_type,
          goal: saved.goal,
          include_items: saved.include_items,
          avoid_items: saved.avoid_items,
          servings: saved.servings,
          extra_notes: saved.extra_notes
        },
        prompt: "Reply 'confirm' to build the recipe, or say 'edit <field>' to change one part."
      });
      return;
    }

    sendJson(res, 200, {
      session_id,
      stage: nextStage,
      prompt: promptsByStage[nextStage] ?? "Answer the next question.",
      session: saved
    });
    return;
  }

  if (url.pathname === "/api/diabetic/builder/complete") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const session_id = String(payload.session_id ?? "").trim();
    if (!session_id) {
      sendJson(res, 400, { error: "session_id is required" });
      return;
    }

    const session = getDiabeticBuilderSession(db, session_id);
    if (!session) {
      sendJson(res, 404, { error: "Session not found" });
      return;
    }

    const query = [
      session.meal_type ? `meal:${session.meal_type}` : "",
      session.goal ? `goal:${session.goal}` : "",
      Array.isArray(session.include_items) && session.include_items.length ? `include:${session.include_items.join(", ")}` : "",
      Array.isArray(session.avoid_items) && session.avoid_items.length ? `avoid:${session.avoid_items.join(", ")}` : "",
      session.servings ? `servings:${session.servings}` : "",
      session.extra_notes ? `notes:${session.extra_notes}` : ""
    ].filter(Boolean).join(" | ");

    const recalled = recallDiabeticRecipe(db, query);
    if (recalled) {
      const recall_count = Number(recalled.recall_count ?? 0);
      if (recall_count >= 2) {
        deleteDiabeticBuilderSession(db, session_id);
        sendJson(res, 200, {
          route: "local_recall",
          recipe: recalled,
          recall_count,
          session_id,
          completed: true
        });
        return;
      }

      try {
        const generated = await generateFromBuilderSession(session, recalled);
        const saved = saveDiabeticRecipe(db, { ...generated, source: "ai" });
        deleteDiabeticBuilderSession(db, session_id);
        sendJson(res, 200, {
          route: "api_validate",
          recipe: saved,
          recall_count: Number(saved?.recall_count ?? recall_count),
          session_id,
          completed: true
        });
        return;
      } catch (error) {
        if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
          sendJson(res, 503, { error: "OPENAI_API_KEY not configured", route: "api_unavailable" });
          return;
        }
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    try {
      const generated = await generateFromBuilderSession(session, null);
      const saved = saveDiabeticRecipe(db, { ...generated, source: "ai" });
      deleteDiabeticBuilderSession(db, session_id);
      sendJson(res, 200, {
        route: "api_expand",
        recipe: saved,
        recall_count: Number(saved?.recall_count ?? 0),
        session_id,
        completed: true
      });
      return;
    } catch (error) {
      if (String(error?.code ?? "") === "OPENAI_API_KEY_MISSING") {
        sendJson(res, 503, { error: "OPENAI_API_KEY not configured", route: "api_unavailable" });
        return;
      }
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }

  if (url.pathname === "/api/subjectspace/subjects") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjects = listSubjectSpaces(db);
    const defaultSubjectId = subjects.find((item) => item.subjectId === "music-engineering")?.subjectId
      ?? subjects[0]?.subjectId
      ?? "";

    sendJson(res, 200, {
      ok: true,
      defaultSubjectId,
      subjects
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/library") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const subjectId = url.searchParams.get("subjectId") ?? url.searchParams.get("subject") ?? "";
    const constructs = listSubjectConstructs(db, subjectId);

    sendJson(res, 200, {
      ok: true,
      subjectId,
      count: constructs.length,
      constructs
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/assist/status") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    sendJson(res, 200, {
      ok: true,
      ...getOpenAiAssistStatus()
    });
    return;
  }

  if (url.pathname === "/api/subjectspace" || url.pathname === "/api/subjectspace/recall") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(url);
    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });

    sendJson(res, 200, buildSubjectspaceAnswerPayload(recall, { question, subjectId }));
    return;
  }

  if (url.pathname === "/api/subjectspace/learn") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const subjectLabel = String(payload.subjectLabel ?? payload.subject ?? "").trim();
    const constructLabel = String(payload.constructLabel ?? payload.name ?? "").trim();

    if (!subjectLabel) {
      sendJson(res, 400, { error: "subjectLabel is required" });
      return;
    }

    if (!constructLabel && !String(payload.target ?? "").trim()) {
      sendJson(res, 400, { error: "constructLabel or target is required" });
      return;
    }

    const saved = upsertSubjectConstruct(db, {
      ...payload,
      provenance: {
        source: payload.provenance?.source ?? "manual",
        learnedFromQuestion: payload.provenance?.learnedFromQuestion ?? payload.question ?? null
      }
    });

    sendJson(res, 200, {
      ok: true,
      construct: saved,
      subjects: listSubjectSpaces(db),
      count: listSubjectConstructs(db, saved.subjectId).length
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/assist") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const config = getOpenAiAssistStatus();
    if (!config.enabled) {
      sendJson(res, 503, {
        error: config.reason,
        config
      });
      return;
    }

    const subjects = listSubjectSpaces(db);
    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall, subjects);

    let assistResult;
    try {
      assistResult = await generateOpenAiSubjectAssist({
        question,
        subjectId,
        subjectLabel,
        recall
      });
    } catch (error) {
      sendJson(res, 502, {
        error: error instanceof Error ? error.message : String(error),
        config,
        recall
      });
      return;
    }

    const suggestedConstruct = buildSuggestedConstructFromAssist({
      subjectId: subjectId || recall.matched?.subjectId || undefined,
      subjectLabel,
      assist: assistResult.assist,
      question,
      routingMode: recall.routing?.mode ?? ""
    });

    let savedConstruct = null;
    if (payload.save === true) {
      savedConstruct = upsertSubjectConstruct(db, suggestedConstruct);
    }

    sendJson(res, 200, {
      ok: true,
      source: "openai",
      config: {
        ...config,
        model: assistResult.model ?? config.model
      },
      recall,
      assist: assistResult.assist,
      suggestedConstruct,
      savedConstruct,
      responseId: assistResult.responseId
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/compare") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const subjects = listSubjectSpaces(db);
    const local = measureSync(() => recallSubjectSpace(db, {
      question,
      subjectId
    }));
    const recall = local.result;
    const subjectLabel = resolveSubjectspaceLabel(db, subjectId, recall, subjects);
    const config = getOpenAiAssistStatus();
    let llm = {
      label: "LLM assist round-trip",
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      mode: "assist_round_trip",
      latencyMs: null,
      apiAction: null,
      constructLabel: null,
      reason: config.reason,
      error: null
    };

    if (config.enabled) {
      const started = performance.now();
      try {
        const assistResult = await generateOpenAiSubjectAssist({
          question,
          subjectId,
          subjectLabel,
          recall
        });

        llm = {
          ...llm,
          model: assistResult.model ?? llm.model,
          latencyMs: toLatencyMs(performance.now() - started),
          apiAction: assistResult.assist?.apiAction ?? null,
          constructLabel: assistResult.assist?.constructLabel ?? null
        };
      } catch (error) {
        llm = {
          ...llm,
          latencyMs: toLatencyMs(performance.now() - started),
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    sendJson(res, 200, {
      ok: true,
      question,
      subjectLabel,
      subjectId: recall.matched?.subjectId ?? subjectId,
      local: {
        label: "Strandbase recall",
        latencyMs: local.latencyMs,
        ready: recall.ready,
        route: recall.routing?.mode ?? null,
        confidence: Number(recall.readiness?.confidence ?? 0),
        candidateCount: Number(recall.candidates?.length ?? 0),
        constructLabel: recall.matched?.constructLabel ?? null
      },
      llm,
      comparison: buildSubjectspaceBenchmark(local.latencyMs, llm),
      recall
    });
    return;
  }

  if (url.pathname === "/api/subjectspace/answer") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { question, subjectId } = readSubjectspaceParams(payload);
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const recall = recallSubjectSpace(db, {
      question,
      subjectId
    });

    sendJson(res, 200, buildSubjectspaceAnswerPayload(recall, { question, subjectId }));
    return;
  }

  if (url.pathname === "/api/soundspace" || url.pathname === "/api/soundspace/recall") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const question = String(url.searchParams.get("q") ?? "").trim();
    const recall = recallSoundspace(db, question);

    sendJson(res, 200, {
      ok: true,
      ...recall,
      libraryCount: listSoundConstructs(db).length
    });
    return;
  }

  if (url.pathname === "/api/soundspace/library") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    const constructs = listSoundConstructs(db);
    sendJson(res, 200, {
      ok: true,
      count: constructs.length,
      constructs
    });
    return;
  }

  if (url.pathname === "/api/soundspace/learn") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const saved = upsertSoundConstruct(db, {
      ...payload,
      provenance: {
        source: payload.provenance?.source ?? "manual-or-llm",
        learnedFromQuestion: payload.provenance?.learnedFromQuestion ?? payload.question ?? null
      }
    });

    sendJson(res, 200, {
      ok: true,
      construct: saved,
      count: listSoundConstructs(db).length
    });
    return;
  }

  if (url.pathname === "/api/soundspace/answer") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const question = String(payload.question ?? payload.q ?? "").trim();
    if (!question) {
      sendJson(res, 400, { error: "question is required" });
      return;
    }

    const recalled = recallSoundspace(db, question);
    if (!payload.forceGenerate && recalled.ready && recalled.matched) {
      sendJson(res, 200, soundConstructAnswerPayload("strandspace", question, recalled.matched, recalled));
      return;
    }

    let generated;
    try {
      generated = buildSoundConstructFromQuestion(question, {
        provider: payload.provider ?? "heuristic-llm",
        model: payload.model ?? "soundspace-template-v1"
      });
    } catch (error) {
      sendJson(res, 422, {
        error: error instanceof Error ? error.message : String(error),
        recall: recalled
      });
      return;
    }

    const saved = upsertSoundConstruct(db, generated);
    const refreshed = recallSoundspace(db, question);
    sendJson(res, 200, soundConstructAnswerPayload("generated-and-stored", question, saved, refreshed));
    return;
  }

  sendText(res, 404, "Not found");
}

export async function createApp() {
  await resolveDatabasePath();
  openMemoryDatabase();

  return http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendText(res, 400, "Missing request URL");
        return;
      }

      const url = new URL(req.url, "http://localhost");

      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res);
        return;
      }

      if (req.method === "GET") {
        await handleStatic(req, res);
        return;
      }

      res.writeHead(405, {
        Allow: "GET",
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end("Method not allowed");
    } catch (error) {
      sendJson(res, 500, {
        error: "Internal server error",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await createApp();

  server.listen(port, () => {
    console.log(`Strandspace Studio running at http://localhost:${port}`);
  });
}
