import assert from "node:assert/strict";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { loadPlants, loadFlowers, saveFlowers, answerWithStrandspace, answerWithHybrid, compareModes, inspectStrands } from "../strandspace/recall.js";
import { parseQuestion, normalizeText } from "../strandspace/parser.js";
import { createApp } from "../server.mjs";
import { once } from "node:events";

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
    assert.ok(payload[0].careTemplate);
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
    assert.ok(Array.isArray(payload.matchedPlant.regionFits));
    assert.ok(payload.matchedPlant.regionFits.some((fit) => fit.region === "temperate"));
    assert.ok(payload.matchedPlant.elevationStartFt !== undefined);
    assert.ok(payload.matchedPlant.elevationEndFt !== undefined);
  } finally {
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
