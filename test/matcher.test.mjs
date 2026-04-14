import test from "node:test";
import assert from "node:assert/strict";
import { loadPlants, answerWithStrandspace, inspectStrands } from "../strandspace/recall.js";

test("strandspace answers color questions from linked strands", async () => {
  const plants = await loadPlants();
  const result = await answerWithStrandspace("What color is a Peace rose?", plants);

  assert.equal(result.mode, "strandspace");
  assert.equal(result.matchedPlant?.name, "Peace rose");
  assert.match(result.answer, /pink/);
  assert.ok(result.activatedStrands.some((strand) => strand.kind === "anchor"));
});

test("strandspace caches repeated questions", async () => {
  const plants = await loadPlants();
  const first = await answerWithStrandspace("Does lavender like full sun?", plants);
  const second = await answerWithStrandspace("Does lavender like full sun?", plants);

  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.reused, true);
});

test("inspectStrands returns a strand trace for shade questions", async () => {
  const plants = await loadPlants();
  const result = inspectStrands("Which plants like shade?", plants);

  assert.equal(result.parsed.intent, "list");
  assert.ok(result.relatedPlants.length > 0);
  assert.ok(result.activatedStrands.length > 0);
});
