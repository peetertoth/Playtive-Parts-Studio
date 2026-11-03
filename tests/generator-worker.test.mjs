import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { makeEmptyDocument } from "../src/lib/assembly-engine.ts";
import { checkGeneratedDocument } from "../src/lib/assembly-analysis.ts";
import { analyzeAssemblySupport } from "../src/lib/assembly-support.ts";

async function startWorker(t) {
  const worker = new Worker(new URL("./fixtures/generator-worker.mjs", import.meta.url));
  t.after(() => worker.terminate());
  const [ready] = await once(worker, "message");
  assert.equal(ready.type, "ready");
  return worker;
}
async function request(worker, data) {
  const response = once(worker, "message");
  worker.postMessage(data);
  return (await response)[0];
}

test("background worker creates a fully closed bounded plan without mutating its input", { timeout: 15000 }, async (t) => {
  const worker = await startWorker(t);
  const document = makeEmptyDocument();
  const inventory = Object.fromEntries(Object.keys(document.inventory).map((key) => [key, 0]));
  Object.assign(inventory, { tube: 4, elbow: 4, screw: 8 });
  document.inventory = inventory;
  const options = { mode: "new", limits: { widthMm: 468, heightMm: 68, depthMm: 468 }, seed: 103, maxAttempts: 100 };
  const before = JSON.stringify(document);
  const response = await request(worker, { type: "generate", document, options });
  assert.equal(response.type, "result");
  assert.equal(response.result.status, "success", JSON.stringify(response));
  assert.equal(response.result.stats.usedParts, 8);
  assert.equal(checkGeneratedDocument(document, response.result.document, options), true);
  assert.equal(JSON.stringify(document), before);
});

test("worker reports impossible limits and malformed messages without sending a partial plan", { timeout: 15000 }, async (t) => {
  const worker = await startWorker(t);
  assert.deepEqual(await request(worker, { type: "unsupported" }), { type: "error" });
  const response = await request(worker, { type: "generate", document: makeEmptyDocument(), options: {
    mode: "new", limits: { widthMm: 1, heightMm: 1, depthMm: 1 }, seed: 1, maxAttempts: 10,
  } });
  assert.equal(response.type, "result");
  assert.equal(response.result.status, "no-solution");
  assert.equal("document" in response.result, false);
});

test("worker carries the floating checkbox through generation and independent final validation", { timeout: 15000 }, async (t) => {
  const worker = await startWorker(t);
  const inventory = Object.fromEntries(Object.keys(makeEmptyDocument().inventory).map((key) => [key, 0]));
  Object.assign(inventory, { tube: 7, elbow: 4, tee: 2, screw: 14 });
  // This T has no downward socket, so its elevated pose cannot gain its own leg.
  const document = { ...makeEmptyDocument(inventory), parts: [
    { id: "elevated-tee", partId: "tee", orientation: 0, positionMm: [0, 454.5, 0] },
  ] };
  const options = { mode: "continue", limits: {}, seed: 42, maxAttempts: 200 };
  const before = JSON.stringify(document);
  for (const allowFloating of [undefined, false]) {
    const response = await request(worker, { type: "generate", document, options: { ...options, ...(allowFloating === undefined ? {} : { allowFloating }) } });
    assert.equal(response.type, "result");
    assert.equal(response.result.status, "no-solution");
    assert.equal("document" in response.result, false);
  }
  const permitted = { ...options, allowFloating: true };
  const response = await request(worker, { type: "generate", document, options: permitted });
  assert.equal(response.type, "result");
  assert.equal(response.result.status, "success", JSON.stringify(response));
  assert.equal(checkGeneratedDocument(document, response.result.document, permitted), true);
  assert.equal(analyzeAssemblySupport(response.result.document.parts).supported, false);
  assert.equal(checkGeneratedDocument(document, response.result.document, options), false);
  assert.deepEqual(response.result.document.parts.find((part) => part.id === "elevated-tee"), document.parts[0]);
  assert.equal(JSON.stringify(document), before);
});
