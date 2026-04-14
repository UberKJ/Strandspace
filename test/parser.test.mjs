import test from "node:test";
import assert from "node:assert/strict";
import { parseQuestion } from "../strandspace/parser.js";

test("parseQuestion extracts color intent", () => {
  const parsed = parseQuestion("What color is a Peace rose?");
  assert.equal(parsed.intent, "lookup");
  assert.equal(parsed.attribute, "primary_color");
  assert.equal(parsed.plantPhrase, "peace rose");
});

test("parseQuestion extracts list and trait intent", () => {
  const parsed = parseQuestion("Which plants like shade?");
  assert.equal(parsed.intent, "list");
  assert.equal(parsed.trait, "shade");
});

test("parseQuestion extracts height intent", () => {
  const parsed = parseQuestion("How tall does a sunflower get?");
  assert.equal(parsed.attribute, "height");
  assert.equal(parsed.plantPhrase, "sunflower");
});
