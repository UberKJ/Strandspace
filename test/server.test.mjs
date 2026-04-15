import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../server.mjs";

test("GET /api/answer compares both modes", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/answer?q=What%20color%20is%20a%20Peace%20rose?`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.llm);
    assert.ok(payload.strandspace);
    assert.equal(payload.llm.mode, "llm");
    assert.equal(payload.strandspace.mode, "strandspace");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("GET /api/benchmark reports repeated question metrics", async () => {
  const server = await createApp();
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/benchmark?q=Does%20lavender%20like%20full%20sun?&runs=5`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.runs, 5);
    assert.ok(payload.strandspace.cacheHits >= 4);
  } finally {
    server.close();
    await once(server, "close");
  }
});
