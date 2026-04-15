import assert from "node:assert/strict";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { loadPlants, loadFlowers, saveFlowers, answerWithStrandspace, answerWithHybrid, compareModes, inspectStrands } from "../strandspace/recall.js";
import { parseQuestion, normalizeText } from "../strandspace/parser.js";
import { createApp } from "../server.mjs";
import { once } from "node:events";
import { __setOpenAiAssistMock } from "../strandspace/openai-assist.js";

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

await check("parseQuestion extracts color intent", () => {
  const parsed = parseQuestion("What color is a Peace rose?");
  assert.equal(parsed.intent, "lookup");
  assert.equal(parsed.attribute, "primary_color");
  assert.equal(parsed.plantPhrase, "peace rose");
});

await check("parseQuestion extracts list and trait intent", () => {
  const parsed = parseQuestion("Which plants like shade?");
  assert.equal(parsed.intent, "list");
  assert.equal(parsed.trait, "shade");
});

await check("parseQuestion extracts height intent", () => {
  const parsed = parseQuestion("How tall does a sunflower get?");
  assert.equal(parsed.attribute, "height");
  assert.equal(parsed.plantPhrase, "sunflower");
});

await check("parseQuestion extracts fragrance intent", () => {
  const parsed = parseQuestion("What does lavender smell like?");
  assert.equal(parsed.attribute, "fragrance");
  assert.equal(parsed.plantPhrase, "lavender");
});

await check("parseQuestion extracts audience hint", () => {
  const parsed = parseQuestion("Explain this like I'm a child");
  assert.equal(parsed.audienceHint, "child");
});

await check("experimental plants were removed from the catalog", async () => {
  const plants = await loadPlants();
  const experiments = plants.filter((plant) => String(plant.id).startsWith("exp-"));
  const generated = plants.filter((plant) => String(plant.id).startsWith("gen-"));
  const flowerExperiments = plants.filter((plant) => String(plant.id).startsWith("flower-exp-"));

  assert.equal(experiments.length, 0);
  assert.equal(generated.length, 0);
  assert.equal(flowerExperiments.length, 0);
});

await check("sqlite catalog seeds extra region plants", async () => {
  const plants = await loadPlants();

  assert.ok(plants.length >= 50);
  assert.ok(plants.some((plant) => plant.name === "Daylily"));
  assert.ok(plants.some((plant) => plant.regionHint === "woodland"));
});

await check("flower explorer dataset contains 100 local flower records", async () => {
  const flowers = await loadFlowers();
  assert.equal(flowers.length, 100);
  assert.ok(flowers.every((plant) => plant.anchors?.plant_type === "flower"));
});

await check("flower picture library contains strand-named files", async () => {
  const pictures = await readdir(new URL("../public/pictures", import.meta.url), { withFileTypes: true });
  const strandFiles = pictures.filter((entry) => entry.isFile() && entry.name.endsWith(".jpg"));

  assert.equal(strandFiles.length, 100);
  assert.ok(strandFiles.some((entry) => entry.name === "saffron_aster.jpg"));
  assert.ok(strandFiles.some((entry) => entry.name === "amethyst_violet.jpg"));
});

await check("strandspace answers color questions from linked strands", async () => {
  const plants = await loadPlants();
  const result = await answerWithStrandspace("What color is a Peace rose?", plants);

  assert.equal(result.mode, "strandspace");
  assert.equal(result.matchedPlant?.name, "Peace rose");
  assert.match(result.answer, /pink/);
  assert.equal(result.keyHolder?.kind, "key_holder");
  assert.equal(result.activatedStrands[0]?.kind, "key_holder");
  assert.equal(result.keyHolder?.canRelate, true);
  assert.ok(result.activatedStrands.some((strand) => strand.kind === "anchor"));
});

await check("strandspace supports audience-aware answers", async () => {
  const plants = await loadPlants();
  const child = await answerWithStrandspace("What color is a Peace rose?", plants, { audience: "child" });
  const scientist = await answerWithStrandspace("What color is a Peace rose?", plants, { audience: "scientist" });

  assert.equal(child.audience, "child");
  assert.equal(scientist.audience, "scientist");
  assert.notEqual(child.answer, scientist.answer);
});

await check("strandspace lists plants for bare color strands", async () => {
  const plants = await loadPlants();
  const result = await answerWithStrandspace("yellow", plants);

  assert.equal(result.parsed.intent, "list");
  assert.ok(result.relatedPlants.length > 0);
  assert.ok(result.answer.toLowerCase().includes("yellow") || result.answer.toLowerCase().includes("plants"));
});

await check("strandspace lists plants for mixed color and moisture strands", async () => {
  const plants = await loadPlants();
  const result = await answerWithStrandspace("yellow flower moist", plants);

  assert.equal(result.parsed.intent, "list");
  assert.ok(result.relatedPlants.length > 0);
  assert.ok(result.answer.toLowerCase().includes("yellow") || result.answer.toLowerCase().includes("plants"));
});

await check("compare mode offers clickable follow-up suggestions for color hints", async () => {
  const plants = await loadPlants();
  const result = await compareModes("yellow", plants);

  assert.ok(result.suggestions.length > 0);
  assert.equal(result.suggestions[0].kind, "broad");
  assert.match(result.suggestions[0].question, /yellow/i);
  assert.equal(result.strandspace.parsed.intent, "list");
  assert.ok(result.strandspace.relatedPlants.length > 0);
});

await check("substring overlap does not create a false plant match", async () => {
  const plants = await loadPlants();
  const result = await compareModes("covered wagon", plants);

  assert.equal(result.llm.matchStatus, "no_match");
  assert.equal(result.strandspace.matchStatus, "no_match");
  assert.equal(result.llm.matchedPlant, null);
  assert.equal(result.strandspace.matchedPlant, null);
});

await check("hybrid mode can fall back to outside search", async () => {
  const plants = await loadPlants();
  const fetchImpl = async (url) => {
    const href = String(url);

    if (href.includes("action=query") && href.includes("list=search")) {
      return new Response(
        JSON.stringify({
          query: {
            search: [{ title: "Calendula", pageid: 42 }]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (href.includes("/api/rest_v1/page/summary/Calendula")) {
      return new Response(
        JSON.stringify({
          title: "Calendula",
          description: "flowering plant",
          extract: "Calendula is a genus of annual and perennial herbs.",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Calendula" } }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("not found", { status: 404 });
  };

  const result = await answerWithHybrid("Tell me about calendula for a scientist", plants, {
    scope: "outside",
    audience: "scientist",
    fetchImpl
  });

  assert.equal(result.mode, "hybrid");
  assert.equal(result.source, "outside");
  assert.equal(result.external?.title, "Calendula");
  assert.match(result.answer, /Calendula/i);
});

await check("hybrid mode can use a configurable outside provider", async () => {
  const plants = await loadPlants();
  const fetchImpl = async (url) => {
    const href = String(url);

    if (href.includes("api.duckduckgo.com")) {
      return new Response(
        JSON.stringify({
          Heading: "Lavandula",
          AbstractText: "Lavandula is a genus of flowering plants in the mint family.",
          AbstractURL: "https://duckduckgo.com/?q=lavandula",
          AbstractSource: "DuckDuckGo"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("not found", { status: 404 });
  };

  const result = await answerWithHybrid("Tell me about lavandula", plants, {
    scope: "outside",
    audience: "gardener",
    provider: "duckduckgo",
    fetchImpl
  });

  assert.equal(result.mode, "hybrid");
  assert.equal(result.source, "outside");
  assert.equal(result.external?.provider, "duckduckgo");
  assert.equal(result.external?.title, "Lavandula");
});

await check("strandspace caches repeated questions", async () => {
  const plants = await loadPlants();
  const first = await answerWithStrandspace("Does lavender like full sun?", plants);
  const second = await answerWithStrandspace("Does lavender like full sun?", plants);

  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.reused, true);
});

await check("inspectStrands returns a strand trace for shade questions", async () => {
  const plants = await loadPlants();
  const result = inspectStrands("Which plants like shade?", plants);

  assert.equal(result.parsed.intent, "list");
  assert.ok(result.relatedPlants.length > 0);
  assert.ok(result.activatedStrands.length > 0);
  assert.ok(result.expressionField);
  assert.ok(Array.isArray(result.expressionField.bindings?.activated));
  assert.ok(Array.isArray(result.expressionField.controllers));
  assert.ok(result.expressionField.controllers.length > 0);
});

await check("inspectStrands exposes phase 1 layered engine output", async () => {
  const plants = await loadPlants();
  const result = inspectStrands("What color is a Peace rose?", plants);
  const engine = result.expressionField.engine;

  assert.equal(engine.phase, "phase_1_minimal_strand_engine");
  assert.ok(Array.isArray(result.expressionField.layers.primitive));
  assert.ok(result.expressionField.layers.primitive.some((strand) => strand.name === "peace"));
  assert.ok(result.expressionField.layers.trigger.some((strand) => strand.name === "lookup"));
  assert.ok(result.expressionField.layers.anchor.some((strand) => strand.name === "primary_color"));
  assert.ok(result.expressionField.layers.composite.some((strand) => strand.name === "Peace rose" || strand.name === "pink_yellow_flower_profile"));
});

await check("list queries stabilize through layered memory paths", async () => {
  const plants = await loadPlants();
  const result = inspectStrands("Which plants like shade?", plants);
  const memory = result.expressionField.layers.stabilizedMemory ?? [];

  assert.ok(memory.length > 0);
  assert.ok(memory.some((strand) => strand.role === "list_cluster"));
  assert.ok(memory.some((strand) => strand.role === "audience_bias"));
});

await check("expression field assembles slots and candidate competition", async () => {
  const plants = await loadPlants();
  const result = inspectStrands("What color is a Peace rose?", plants);
  const assembly = result.expressionField.assembly;

  assert.ok(Array.isArray(assembly.slots));
  assert.ok(assembly.slots.some((slot) => slot.slot === "identity" && slot.value === "Peace rose"));
  assert.ok(assembly.slots.some((slot) => slot.slot === "property" && slot.value === "primary_color"));
  assert.ok(Array.isArray(assembly.candidates));
  assert.ok(assembly.candidates.length > 0);
  assert.equal(assembly.candidates[0].status, "winner");
  assert.ok(assembly.stabilization.accepted);
  assert.ok(assembly.stabilization.confidence > 0);
});

await check("list expression field builds a multi-plant emission", async () => {
  const plants = await loadPlants();
  const result = inspectStrands("Which plants like shade?", plants);
  const assembly = result.expressionField.assembly;

  assert.equal(assembly.emission.outputType, "list");
  assert.ok(assembly.slots.some((slot) => slot.slot === "identity" && String(slot.value).includes("related plants")));
  assert.ok(assembly.candidates.length > 0);
});

await check("GET /api/answer compares both modes", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/answer?q=What%20color%20is%20a%20Peace%20rose?&region=temperate`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.llm);
    assert.ok(payload.strandspace);
    assert.ok(payload.comparison);
    assert.ok(payload.tokenizedComparison);
    assert.equal(payload.llm.mode, "llm");
    assert.equal(payload.strandspace.mode, "strandspace");
    assert.equal(payload.region, "temperate");
    assert.equal(payload.regionProfile.label, "Temperate");
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/atlas returns region-fit plant guidance", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/atlas?region=woodland`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.region, "woodland");
    assert.equal(payload.profile.label, "Woodland");
    assert.ok(Array.isArray(payload.results));
    assert.ok(payload.results.length > 0);
    assert.ok(payload.results[0].regionSummary);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/catalog returns searchable plant summaries", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/catalog`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload));
    assert.ok(payload[0].questionIdeas);
    assert.ok(payload[0].audienceNotes);
    assert.ok(Array.isArray(payload[0].quickStrands));
    assert.ok(Array.isArray(payload[0].regionFits));
    assert.ok(payload[0].regionFits.some((fit) => fit.elevationStartFt !== null && fit.elevationEndFt !== null));
    assert.ok(Array.isArray(payload[0].sources));
    assert.ok("careTemplate" in payload[0]);
    assert.ok(Array.isArray(payload[0].sourceFacts));
    assert.ok(payload[0].sourceMode);
    assert.ok(payload[0].image);
    assert.ok(payload[0].image.pageUrl || payload[0].image.imageUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/plants searches the strand dataset", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plants?region=temperate&q=rose&limit=6`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.region, "temperate");
    assert.equal(payload.query, "rose");
    assert.ok(Array.isArray(payload.results));
    assert.ok(payload.results.length > 0);
    assert.ok(payload.results[0].regionFits);
    assert.ok(payload.results[0].quickStrands);
    assert.ok(payload.results[0].image);
    assert.ok(payload.results[0].image.pageUrl || payload.results[0].image.imageUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/plants keeps simple plant names narrow", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plants?region=temperate&q=basil&limit=12`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.count <= 5);
    assert.ok(payload.results.length <= 5);
    assert.equal(payload.results[0].name, "Basil");
    assert.ok(payload.results.every((plant) => String(plant.name).toLowerCase().includes("basil")));
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/plants returns broad color strand matches", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plants?region=temperate&q=blue&limit=12`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.count > 0);
    assert.ok(payload.results.length > 0);
    assert.ok(
      payload.results.some((plant) =>
        normalizeText([plant.name, plant.constructStrand, JSON.stringify(plant.anchors ?? {})].join(" ")).includes("blue")
      )
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/plants returns a tokenized vs Strandbase comparison", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plants?region=temperate&q=herb%20full%20sun&limit=8`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.comparison);
    assert.ok(Array.isArray(payload.comparison.tokenized.top));
    assert.ok(Array.isArray(payload.comparison.strandbase.top));
    assert.ok(payload.comparison.tokenized.top.length > 0);
    assert.ok(payload.comparison.strandbase.top.length > 0);
    assert.ok(payload.comparison.timings);
    assert.ok(Number.isFinite(payload.comparison.timings.tokenizedMs));
    assert.ok(Number.isFinite(payload.comparison.timings.strandspaceMs));
    assert.ok(Array.isArray(payload.comparison.shared));
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/proof returns a partial-cue proof report", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/proof?region=temperate&plant=salvia-rosmarinus-spenn`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.plant.name, "Rosemary");
    assert.ok(Array.isArray(payload.cues));
    assert.ok(payload.cues.length >= 3);
    assert.ok(payload.cues.some((cue) => cue.label === "Appearance bundle"));
    assert.ok(payload.cues.every((cue) => Array.isArray(cue.strandspace.topMatches)));
    assert.ok(payload.cues.every((cue) => cue.strandspace.expressionField));
    assert.ok(payload.cues.every((cue) => Array.isArray(cue.strandspace.expressionField.controllers)));
    assert.ok(payload.summary.top3Hits >= 1);
    assert.ok(Array.isArray(payload.reuse));
    assert.ok(payload.reuse.length > 0);
    assert.ok(Array.isArray(payload.exemplars));
    assert.ok(payload.exemplars.length > 0);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/regions returns the selector data", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/regions`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.defaultRegion, "temperate");
    assert.ok(Array.isArray(payload.regions));
    assert.ok(payload.regions.some((region) => region.value === "woodland"));
    assert.ok(payload.regions.some((region) => region.elevationRange));
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/atlas returns elevation and natural growing regions", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/atlas?region=alpine`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.profile.elevationRange, "4000-14000 ft");
    assert.ok(Array.isArray(payload.profile.bestNaturalRegions));
    assert.ok(payload.results[0].elevationRange);
    assert.ok(Array.isArray(payload.results[0].bestNaturalRegions));
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/flowers returns the 100 local flower records", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/flowers?scope=local`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.scope, "local");
    assert.equal(payload.count, 100);
    assert.equal(payload.results.length, 100);
    assert.ok(payload.results[0].imagePath);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/flowers/image falls back to an outside thumbnail when the strand image is missing", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  const address = server.address();
  const strandName = "test-missing-rose";
  const pictureUrl = new URL(`../public/pictures/${strandName}.jpg`, import.meta.url);
  const manifestUrl = new URL("../public/pictures/sources.json", import.meta.url);
  const originalFetch = globalThis.fetch;
  const thumbnailUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/example/test-missing-rose.jpg/320px-test-missing-rose.jpg";

  try {
    globalThis.fetch = async (url) => {
      const href = String(url);

      if (href.includes("w/api.php") && href.includes("list=search")) {
        return new Response(
          JSON.stringify({
            query: {
              search: [{ title: "Missing Rose", pageid: 77 }]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (href.includes("/api/rest_v1/page/summary/Missing%20Rose")) {
        return new Response(
          JSON.stringify({
            title: "Missing Rose",
            description: "flower",
            extract: "Missing Rose is a flower used for image fallback testing.",
            content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Missing_Rose" } },
            thumbnail: { source: thumbnailUrl }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (href === thumbnailUrl) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" }
        });
      }

      return new Response("not found", { status: 404 });
    };

    const response = await originalFetch(`http://127.0.0.1:${address.port}/api/flowers/image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        flower: {
          name: "Missing Rose",
          title: "Missing Rose",
          constructStrand: strandName,
          source: "outside"
        }
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.flower.imagePath, `/pictures/${strandName}.jpg`);
    assert.equal(payload.image.imagePath, `/pictures/${strandName}.jpg`);
    assert.ok(payload.image.outsideMs >= 0);
    assert.ok(Number.isFinite(payload.image.deltaMs));

    const imageBytes = await readFile(pictureUrl);
    assert.ok(imageBytes.length > 0);

    const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
    assert.ok(manifest.some((entry) => entry.strand === strandName));
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
    await once(server, "close");

    try {
      await unlink(pictureUrl);
    } catch {}

    try {
      const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
      const filtered = manifest.filter((entry) => entry.strand !== strandName);
      await writeFile(manifestUrl, `${JSON.stringify(filtered, null, 2)}\n`, "utf8");
    } catch {}
  }
});

await check("GET /api/flowers falls back to ranked local flowers for narrow queries", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/flowers?scope=local&q=lavender`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.results.length > 0);
    assert.ok(payload.results[0].name);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/flowers/import adds an outside flower to the current list", async () => {
  const originalFlowers = await loadFlowers();
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");
  const originalFetch = globalThis.fetch;
  const strandName = "imported-test-import-yellow-flower";
  const pictureUrl = new URL(`../public/pictures/${strandName}.jpg`, import.meta.url);
  const manifestUrl = new URL("../public/pictures/sources.json", import.meta.url);
  const thumbnailUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/example/test-import-yellow-flower.jpg/320px-test-import-yellow-flower.jpg";

  try {
    const address = server.address();
    const payload = {
      flower: {
        id: "test-import-yellow-flower",
        title: "Test Import Yellow Flower",
        provider: "duckduckgo",
        extract: "A yellow flower used for import testing.",
        anchors: {
          primary_color: "yellow",
          plant_type: "flower",
          sunlight: "full sun"
        }
      }
    };

    globalThis.fetch = async (url) => {
      const href = String(url);

      if (href.includes("w/api.php") && href.includes("list=search")) {
        return new Response(
          JSON.stringify({
            query: {
              search: [{ title: "Test Import Yellow Flower", pageid: 88 }]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (href.includes("/api/rest_v1/page/summary/Test%20Import%20Yellow%20Flower")) {
        return new Response(
          JSON.stringify({
            title: "Test Import Yellow Flower",
            description: "flower",
            extract: "A yellow flower used for import testing.",
            content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Test_Import_Yellow_Flower" } },
            thumbnail: { source: thumbnailUrl }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (href === thumbnailUrl) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" }
        });
      }

      return originalFetch(url);
    };

    const response = await originalFetch(`http://127.0.0.1:${address.port}/api/flowers/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    assert.equal(response.status, 200);
    const imported = await response.json();
    assert.equal(imported.ok, true);
    assert.equal(imported.flower.name, "Test Import Yellow Flower");
    assert.equal(imported.flower.imagePath, "/pictures/imported-test-import-yellow-flower.jpg");

    const localResponse = await originalFetch(`http://127.0.0.1:${address.port}/api/flowers?scope=local&q=test%20import%20yellow%20flower&limit=101`);
    const localPayload = await localResponse.json();
    assert.ok(localPayload.results.some((flower) => flower.name === "Test Import Yellow Flower"));
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
    await once(server, "close");
    await saveFlowers(originalFlowers);
    try {
      await unlink(pictureUrl);
    } catch {}

    try {
      const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
      const filtered = manifest.filter((entry) => entry.strand !== strandName);
      await writeFile(manifestUrl, `${JSON.stringify(filtered, null, 2)}\n`, "utf8");
    } catch {}
  }
});

await check("POST /api/feedback records a learning event", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: "What color is a Peace rose?",
        audience: "scientist",
        mode: "strandspace",
        rating: "helpful",
        activatedStrands: [
          { kind: "anchor", name: "primary_color", value: "pink", plant: "Peace rose" },
          { kind: "composite", name: "rose_signature_profile", value: "shared", plant: "Peace rose" }
        ]
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.audience, "scientist");
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/garden/note and /api/garden/favorite persist garden memory", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  const plantId = `test-garden-${Date.now()}`;

  try {
    const address = server.address();
    const noteResponse = await fetch(`http://127.0.0.1:${address.port}/api/garden/note`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        plantId,
        plantName: "Garden Test Plant",
        constructStrand: "garden-test-plant",
        region: "temperate",
        note: "Water deeply and mulch yearly."
      })
    });

    assert.equal(noteResponse.status, 200);
    const notePayload = await noteResponse.json();
    assert.equal(notePayload.entry.plantId, plantId);
    assert.equal(notePayload.entry.note, "Water deeply and mulch yearly.");

    const favoriteResponse = await fetch(`http://127.0.0.1:${address.port}/api/garden/favorite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        plantId,
        plantName: "Garden Test Plant",
        constructStrand: "garden-test-plant",
        region: "temperate",
        favorite: true
      })
    });

    assert.equal(favoriteResponse.status, 200);
    const favoritePayload = await favoriteResponse.json();
    assert.equal(favoritePayload.entry.favorite, true);

    const readResponse = await fetch(`http://127.0.0.1:${address.port}/api/garden?plantId=${encodeURIComponent(plantId)}`);
    assert.equal(readResponse.status, 200);
    const readPayload = await readResponse.json();
    assert.equal(readPayload.selected.plantId, plantId);
    assert.equal(readPayload.selected.favorite, true);
    assert.ok(readPayload.entries.some((entry) => entry.plantId === plantId));
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/strand-memory stores click-to-learn plant strands", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  const plants = await loadPlants();
  const basil = plants.find((plant) => plant.name === "Basil");
  assert.ok(basil);

  try {
    const address = server.address();
    const learnResponse = await fetch(`http://127.0.0.1:${address.port}/api/strand-memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        plantId: basil.id,
        plantName: basil.name,
        constructStrand: basil.constructStrand,
        region: basil.regionHint,
        searchQuery: "basil",
        source: "search-click",
        keyHolder: { kind: "key_holder", identifier: basil.id, canRelate: true },
        activatedStrands: [
          { kind: "key_holder", identifier: basil.id, canRelate: true },
          { kind: "anchor", name: "sunlight", value: "full sun" }
        ],
        strandTrace: {
          keyHolder: { kind: "key_holder", identifier: basil.id, canRelate: true },
          activatedStrands: [{ kind: "anchor", name: "sunlight", value: "full sun" }],
          matchedPlant: basil.name
        }
      })
    });

    assert.equal(learnResponse.status, 200);
    const learnPayload = await learnResponse.json();
    assert.equal(learnPayload.ok, true);
    assert.ok(learnPayload.count >= 1);

    const searchResponse = await fetch(`http://127.0.0.1:${address.port}/api/plants?q=basil&region=temperate`);
    assert.equal(searchResponse.status, 200);
    const searchPayload = await searchResponse.json();
    assert.equal(searchPayload.memory.hit, true);
    assert.equal(searchPayload.memory.plantName, "Basil");
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/benchmark reports repeated question metrics", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/benchmark?q=Does%20lavender%20like%20full%20sun?&runs=5`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.runs, 5);
    assert.ok(payload.strandspace.cacheHits >= 4);
    assert.ok(payload.search);
    assert.ok(Number.isFinite(payload.search.tokenized.averageMs));
    assert.ok(Number.isFinite(payload.search.strandspace.averageMs));
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/soundspace recalls a seeded mixer setup", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=What%20is%20a%20good%20setup%20for%20a%20microphone%20on%20a%20Yamaha%20MG10XU%20mixer%20for%20a%20small%20band%20room%3F`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ready, true);
    assert.equal(payload.matched?.deviceModel, "MG10XU");
    assert.equal(payload.recommendation, "use_strandspace");
    assert.match(payload.answer, /Gain:/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /soundspace serves the standalone Soundspace app", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/soundspace`);

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Strandspace Soundspace/);
    assert.match(html, /Build Or Recall/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/soundspace/learn stores a new construct for later recall", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const learnResponse = await fetch(`http://127.0.0.1:${address.port}/api/soundspace/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "yamaha-mg10xu-music-bingo-host",
        name: "Yamaha MG10XU music bingo host setup",
        deviceBrand: "Yamaha",
        deviceModel: "MG10XU",
        deviceType: "mixer",
        sourceType: "microphone",
        goal: "clear host mic",
        venueSize: "medium",
        eventType: "music bingo",
        speakerConfig: "two powered speakers plus host monitor",
        setup: {
          gain: "Set speech gain for strong announcements with clean peaks.",
          eq: "Cut mud and leave enough presence so clue calls stay intelligible.",
          fx: "Keep effects nearly dry for intelligibility.",
          monitor: "Aim mains ahead of the host mic and keep monitor level conservative."
        },
        tags: ["music bingo", "host mic", "speech"],
        strands: [
          "device:yamaha_mg10xu",
          "source:microphone",
          "event:music_bingo",
          "goal:clear_host_mic"
        ],
        llmSummary: "Use this setup for a host-driven music bingo night."
      })
    });

    assert.equal(learnResponse.status, 200);
    const learned = await learnResponse.json();
    assert.equal(learned.construct.eventType, "music bingo");

    const recallResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/soundspace?q=What%20is%20a%20good%20music%20bingo%20mic%20setup%20for%20a%20Yamaha%20MG10XU%20in%20a%20medium%20venue%3F`
    );

    assert.equal(recallResponse.status, 200);
    const recalled = await recallResponse.json();
    assert.equal(recalled.ready, true);
    assert.equal(recalled.matched?.eventType, "music bingo");
    assert.match(recalled.answer, /intelligibility|Gain:/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/soundspace/answer reuses a stored construct when ready", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What is a good setup for a microphone on a Yamaha MG10XU mixer for a small band room?"
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "strandspace");
    assert.equal(payload.construct.deviceModel, "MG10XU");
    assert.match(payload.answer, /Gain:/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/soundspace/answer generates and stores a missing construct", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/soundspace/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What is a good karaoke mic setup for a Yamaha MG10XU in a large venue?",
        forceGenerate: true
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "generated-and-stored");
    assert.equal(payload.construct.deviceModel, "MG10XU");
    assert.equal(payload.construct.eventType, "karaoke");
    assert.equal(payload.construct.venueSize, "large");
    assert.equal(payload.recall.ready, true);
    assert.match(payload.answer, /Gain:/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/answer exposes new strand facts", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/answer?mode=strandspace&q=What%20does%20rosemary%20smell%20like?`
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.answer, /fragrance|aromatic/i);
    assert.ok(payload.factSheet.some((item) => item.label === "Fragrance"));
    assert.ok(payload.llmTiming);
    assert.ok(Number.isFinite(payload.llmTiming.latencyMs));
    assert.ok(Array.isArray(payload.matchedPlant.regionFits));
    assert.ok(payload.matchedPlant.regionFits.some((fit) => fit.region === "temperate"));
    assert.ok(payload.matchedPlant.elevationStartFt !== undefined);
    assert.ok(payload.matchedPlant.elevationEndFt !== undefined);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/subjectspace/subjects exposes music engineering seeds", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/subjects`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.subjects));
    assert.ok(payload.subjects.some((subject) => subject.subjectId === "music-engineering"));
    assert.ok(payload.defaultSubjectId);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/subjectspace/learn stores and recalls a custom subject construct", async () => {
  const subjectLabel = `Portrait Lighting Recall ${Date.now()}`;
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const learnResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectLabel,
        constructLabel: "Gallery interview key light recall",
        target: "Key light for a seated interview",
        objective: "soft face lighting with gentle background separation",
        context: "room: small gallery\ncamera: medium close-up\nkey light: large softbox at 45 degrees",
        steps: "Raise the key until the cheek has shape\nAdd negative fill only if the jaw disappears\nKeep the background about one stop under the face",
        notes: "Use this when speed matters more than dramatic contrast.",
        tags: "lighting, interview, softbox"
      })
    });

    assert.equal(learnResponse.status, 200);
    const learned = await learnResponse.json();
    assert.ok(learned.construct.subjectId);
    assert.equal(learned.construct.subjectLabel, subjectLabel);

    const recallResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: learned.construct.subjectId,
        question: "What is my gallery interview key light setup with the softbox at 45 degrees?"
      })
    });

    assert.equal(recallResponse.status, 200);
    const recalled = await recallResponse.json();
    assert.equal(recalled.source, "strandspace");
    assert.equal(recalled.recall.ready, true);
    assert.equal(recalled.construct.subjectId, learned.construct.subjectId);
    assert.match(recalled.answer, /gallery|soft face lighting|seated interview/i);
    assert.ok((recalled.recall.trace?.triggerStrands?.length ?? 0) > 0);
    assert.ok((recalled.recall.trace?.compositeStrands?.length ?? 0) > 0);
    assert.equal(recalled.recall.routing?.mode, "local_recall");
    assert.equal(recalled.recall.routing?.apiRecommended, false);
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("subjectspace routes narrow-but-ambiguous recall toward API validation", async () => {
  const subjectLabel = `Portrait Lighting Validation ${Date.now()}`;
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const learnResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectLabel,
        constructLabel: "Gallery interview key light recall",
        target: "Key light for a seated interview",
        objective: "soft face lighting with gentle background separation",
        context: "room: small gallery\ncamera: medium close-up\nkey light: large softbox at 45 degrees",
        steps: "Raise the key until the cheek has shape\nAdd negative fill only if the jaw disappears\nKeep the background about one stop under the face",
        notes: "Use this when speed matters more than dramatic contrast.",
        tags: "lighting, interview, softbox"
      })
    });

    assert.equal(learnResponse.status, 200);
    const learned = await learnResponse.json();

    const response = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: learned.construct.subjectId,
        question: "What is my gallery interview tungsten setup?"
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.recall.ready, true);
    assert.equal(payload.recall.routing?.mode, "api_validate");
    assert.equal(payload.recall.routing?.apiRecommended, true);
    assert.ok(String(payload.recall.routing?.promptDraft ?? "").includes("gallery interview tungsten setup"));
  } finally {
    server.close();
    await once(server, "close");
  }
});

await check("GET /api/subjectspace/assist/status reports disabled without an API key", async () => {
  __setOpenAiAssistMock(null);
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalDisableLookup = process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP;
  delete process.env.OPENAI_API_KEY;
  process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP = "1";

  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/assist/status`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.enabled, false);
    assert.ok(String(payload.reason).includes("OPENAI_API_KEY"));
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalDisableLookup === undefined) {
      delete process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP;
    } else {
      process.env.SUBJECTSPACE_DISABLE_USER_ENV_LOOKUP = originalDisableLookup;
    }
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/subjectspace/compare shows Strandbase faster than the mocked LLM round-trip", async () => {
  __setOpenAiAssistMock(async ({ question, subjectLabel }) => {
    await new Promise((resolve) => setTimeout(resolve, 35));

    return {
      responseId: "resp_mock_compare_subjectspace",
      model: "gpt-5.4-mini",
      assist: {
        apiAction: "validate",
        constructLabel: `${subjectLabel} speed benchmark draft`,
        target: `Benchmark answer for ${question}`,
        objective: "Measure round-trip latency against local Strandbase recall",
        contextEntries: [
          { key: "mode", value: "benchmark" }
        ],
        steps: [
          "Run local recall first.",
          "Time the remote assist call.",
          "Report the speed difference."
        ],
        notes: "Synthetic delayed response for timing coverage.",
        tags: ["benchmark"],
        validationFocus: ["latency"],
        rationale: "Mocked latency keeps the benchmark deterministic in tests.",
        shouldLearn: false
      }
    };
  });

  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: "portrait-lighting",
        question: "What is my gallery interview tungsten setup?"
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.local.label, "Strandbase recall");
    assert.ok(Number(payload.local.latencyMs) > 0);
    assert.equal(payload.llm.enabled, true);
    assert.equal(payload.llm.mode, "assist_round_trip");
    assert.ok(Number(payload.llm.latencyMs) >= 30);
    assert.equal(payload.comparison.available, true);
    assert.equal(payload.comparison.faster, "strandbase");
    assert.ok(Number(payload.comparison.speedup) >= 1);
    assert.match(String(payload.comparison.summary), /Strandbase recall was/i);
  } finally {
    __setOpenAiAssistMock(null);
    server.close();
    await once(server, "close");
  }
});

await check("POST /api/subjectspace/assist returns an OpenAI-backed draft and can be saved", async () => {
  __setOpenAiAssistMock(async ({ question, subjectId, subjectLabel }) => ({
    responseId: "resp_mock_subjectspace",
    model: "gpt-5.4-mini",
    assist: {
      apiAction: "validate",
      constructLabel: "Gallery interview tungsten recall",
      target: "Key light for a seated interview under tungsten practicals",
      objective: "keep skin natural while the warm room still feels present",
      contextEntries: [
        { key: "room", value: "small gallery" },
        { key: "key light", value: "softbox with warmer balance" },
        { key: "camera", value: "medium close-up" }
      ],
      steps: [
        "Set the key for natural skin first before matching the background warmth.",
        "Let the room stay warm, but keep the face from drifting orange.",
        "Add negative fill only if the tungsten ambience flattens the jawline."
      ],
      notes: "This validates the local interview setup for warmer practicals.",
      tags: ["lighting", "interview", "tungsten"],
      validationFocus: ["tungsten balance", "skin tone"],
      rationale: `Validated against the missing tungsten cue from: ${question} in ${subjectLabel} (${subjectId}).`,
      shouldLearn: true
    }
  }));

  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const assistResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: "portrait-lighting",
        question: "What is my gallery interview tungsten setup?"
      })
    });

    assert.equal(assistResponse.status, 200);
    const assisted = await assistResponse.json();
    assert.equal(assisted.source, "openai");
    assert.equal(assisted.config.enabled, true);
    assert.equal(assisted.assist.apiAction, "validate");
    assert.equal(assisted.suggestedConstruct.constructLabel, "Gallery interview tungsten recall");

    const saveResponse = await fetch(`http://127.0.0.1:${address.port}/api/subjectspace/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assisted.suggestedConstruct)
    });

    assert.equal(saveResponse.status, 200);
    const saved = await saveResponse.json();
    assert.equal(saved.construct.subjectId, "portrait-lighting");
    assert.match(saved.construct.notes, /warmer practicals/i);
  } finally {
    __setOpenAiAssistMock(null);
    server.close();
    await once(server, "close");
  }
});

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  if (result.ok) {
    console.log(`ok - ${result.name}`);
  } else {
    console.error(`not ok - ${result.name}`);
    console.error(result.error);
  }
}

if (failed.length > 0) {
  process.exitCode = 1;
  console.error(`${failed.length} test(s) failed`);
} else {
  console.log(`${results.length} test(s) passed`);
}
