import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createPartInstanceId } from "../src/lib/instance-id.ts";
import { commitPlacement, makeEmptyDocument, validateDocument } from "../src/lib/assembly-engine.ts";

const partIdPattern = /^part-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function useCrypto(t, crypto) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: crypto });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else delete globalThis.crypto;
  });
}

function useInsecureContextCrypto(t) {
  // HTTP LAN browsers expose this method while omitting randomUUID.
  useCrypto(t, { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
  assert.equal(globalThis.crypto.randomUUID, undefined);
}

test("secure-context IDs retain the existing part-UUID format", (t) => {
  useCrypto(t, webcrypto);
  assert.match(createPartInstanceId(), partIdPattern);
});

test("HTTP LAN contexts can generate many distinct UUID-shaped part IDs without randomUUID", (t) => {
  useInsecureContextCrypto(t);
  const ids = Array.from({ length: 1000 }, () => createPartInstanceId());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, partIdPattern);
});

test("fallback IDs support multiple placed parts, moving an existing part and saved-plan round trips", (t) => {
  useInsecureContextCrypto(t);
  let document = makeEmptyDocument();
  const ids = Array.from({ length: 3 }, () => createPartInstanceId());

  for (const [index, id] of ids.entries()) {
    const committed = commitPlacement(document, {
      id, partId: "tube", orientation: 0, positionMm: [index * 500, 175, 0],
    }, { magnetic: false });
    assert.equal(committed.result.valid, true, committed.result.reason);
    document = committed.document;
  }
  assert.deepEqual(document.parts.map((part) => part.id), ids);

  const moved = commitPlacement(document, {
    ...document.parts[1], positionMm: [500, 175, 500],
  }, { magnetic: false });
  assert.equal(moved.result.valid, true, moved.result.reason);
  assert.equal(moved.document.parts.length, 3);
  assert.deepEqual(new Set(moved.document.parts.map((part) => part.id)), new Set(ids));
  assert.deepEqual(moved.document.parts.find((part) => part.id === ids[1]).positionMm, [500, 175, 500]);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(moved.document))), moved.document);
});
