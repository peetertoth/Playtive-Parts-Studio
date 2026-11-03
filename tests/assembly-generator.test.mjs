import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { generateAssembly } from "../src/lib/assembly-generator.ts";
import { analyzeAssembly, checkGeneratedDocument, withinGenerationLimits } from "../src/lib/assembly-analysis.ts";
import { analyzeAssemblySupport } from "../src/lib/assembly-support.ts";
import {
  DEFAULT_INVENTORY, ORIENTATIONS, getPartDefinition, rotateVector, worldPorts,
  deriveConnections, inventoryUsage, makeEmptyDocument, validateDocument,
} from "../src/lib/assembly-engine.ts";

const structural = ["tube", "elbow", "tee", "corner3", "corner4", "cross", "connector5"];
const defaults = { mode: "new", limits: {}, seed: 42 };
const add = (a, b) => a.map((v, i) => v + b[i]);
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, n) => a.map((v) => v * n);
const equalVector = (a, b) => a.every((v, i) => v === b[i]);
function connector(id, partId, hub, desired) {
  const definition = getPartDefinition(partId);
  const orientation = desired ? ORIENTATIONS.findIndex((_, o) => {
    const actual = definition.ports.map((port) => rotateVector(port.direction, o));
    return actual.length === desired.length && desired.every((d) => actual.some((v) => equalVector(d, v)));
  }) : 0;
  assert.ok(orientation >= 0);
  const port = definition.ports[0];
  const localHub = subtract(port.positionMm, scale(port.direction, 75));
  return { id, partId, orientation, positionMm: subtract(hub, rotateVector(localHub, orientation)) };
}
function tube(id, center, direction) {
  return { id, partId: "tube", positionMm: center,
    orientation: ORIENTATIONS.findIndex((_, o) => equalVector(rotateVector([0, 1, 0], o), direction)) };
}
function orientedConnector(id, partId, hub, orientation) {
  const first = getPartDefinition(partId).ports[0];
  const localHub = subtract(first.positionMm, scale(first.direction, 75));
  return { id, partId, orientation, positionMm: subtract(hub, rotateVector(localHub, orientation)) };
}
function withParts(parts, inventory = DEFAULT_INVENTORY) {
  return validateDocument({ ...makeEmptyDocument(inventory), parts });
}
function onlyInventory(counts) {
  return Object.fromEntries(Object.keys(DEFAULT_INVENTORY).map((kind) => [kind, counts[kind] ?? 0]));
}
function assertSuccess(base, result, options) {
  assert.equal(result.status, "success", JSON.stringify(result));
  assert.ok(checkGeneratedDocument(base, result.document, options));
  assert.deepEqual(validateDocument(result.document), result.document);
  const analysis = analyzeAssembly(result.document.parts);
  assert.ok(result.document.parts.length > 0);
  assert.equal(analysis.connected, true);
  assert.equal(analysis.freePorts.length, 0, "Every tube end and every socket must be occupied.");
  assert.equal(analysis.connections, analysis.tubes * 2, "Both ends of every tube must have a join.");
  const connections = deriveConnections(result.document.parts);
  const occupied = new Set(connections.flatMap(({ a, b }) => [JSON.stringify(a), JSON.stringify(b)]));
  for (const part of result.document.parts) {
    assert.ok(structural.includes(part.partId));
    assert.ok(Number.isInteger(part.orientation) && part.orientation >= 0 && part.orientation < 24);
    for (const port of worldPorts(part)) assert.ok(occupied.has(JSON.stringify({ instanceId: part.id, portId: port.portId })));
  }
  const usage = inventoryUsage(result.document);
  for (const [kind, count] of Object.entries(usage)) assert.ok(count <= base.inventory[kind], `${kind} stock exceeded`);
  assert.equal(usage.screw, analysis.connections);
  assert.deepEqual(result.document.inventory, base.inventory);
  assert.ok(withinGenerationLimits(analysis.bounds, options.limits));
  if (options.allowFloating !== true) assert.deepEqual(analyzeAssemblySupport(result.document.parts), { supported: true, unsupportedPartIds: [] });
  assert.deepEqual(result.stats, {
    attempts: result.stats.attempts,
    usedParts: result.document.parts.length,
    addedParts: result.document.parts.length - (options.mode === "continue" ? base.parts.length : 0),
    remainingParts: structural.reduce((sum, kind) => sum + base.inventory[kind], 0) - result.document.parts.length,
    connections: analysis.connections, bounds: analysis.bounds,
  });
  assert.ok(result.stats.attempts >= 1 && result.stats.attempts <= Math.max(1, Math.min(options.maxAttempts ?? 2000, 20000)));
  return result.document;
}
function closedCube() {
  const parts = [];
  for (let x = 0; x <= 1; x++) for (let y = 0; y <= 1; y++) for (let z = 0; z <= 1; z++) {
    parts.push(connector(`cube-c-${x}${y}${z}`, "corner3", [x * 400, y * 400 + 34, z * 400],
      [[x ? -1 : 1, 0, 0], [0, y ? -1 : 1, 0], [0, 0, z ? -1 : 1]]));
    for (let axis = 0; axis < 3; axis++) {
      if ([x, y, z][axis] !== 0) continue;
      const p = [x * 400, y * 400 + 34, z * 400];
      p[axis] += 200;
      const direction = [0, 0, 0]; direction[axis] = 1;
      parts.push(tube(`cube-t-${x}${y}${z}-${axis}`, p, direction));
    }
  }
  return withParts(parts);
}
function deepFreeze(value) {
  for (const nested of Object.values(value)) if (nested && typeof nested === "object") deepFreeze(nested);
  return Object.freeze(value);
}

test("default search uses mixed fittings and substantially more stock than one box", () => {
  const base = makeEmptyDocument();
  const result = generateAssembly(base, defaults);
  const generated = assertSuccess(base, result, defaults);
  assert.ok(result.stats.usedParts >= 80, "The default search must grow beyond a single 20-part cube.");
  const usage = inventoryUsage(generated);
  for (const kind of ["elbow", "tee", "corner3", "corner4", "cross", "connector5"]) assert.ok(usage[kind] > 0, `${kind} should participate`);
  assert.equal(usage.connector5, 3);
  const socket5 = generated.parts.filter((part) => part.partId === "connector5");
  assert.equal(socket5.length, 3);
  for (const part of socket5) assert.equal(deriveConnections(generated.parts).filter((join) => join.a.instanceId === part.id || join.b.instanceId === part.id).length, 5);
});

test("seeded generation is repeatable, varied, immutable, and can use the complete default stock", () => {
  const base = deepFreeze(makeEmptyDocument());
  const options = deepFreeze({ ...defaults, seed: 3, allowFloating: true });
  const before = JSON.stringify({ base, options });
  const first = generateAssembly(base, options);
  assertSuccess(base, first, options);
  assert.deepEqual(generateAssembly(base, options), first);
  assert.equal(JSON.stringify({ base, options }), before);
  assert.equal(first.stats.usedParts, 103);
  const differentOptions = { ...defaults, seed: 4, allowFloating: true };
  const different = generateAssembly(base, differentOptions);
  assertSuccess(base, different, differentOptions);
  const geometry = (result) => result.document.parts.map(({ id, ...part }) => part);
  assert.notDeepEqual(geometry(different), geometry(first));
});

test("each dimension cap is independent and includes complete connector outer bodies", () => {
  const base = makeEmptyDocument();
  for (const limits of [{ heightMm: 68 }, { widthMm: 68 }, { depthMm: 68 }]) {
    const options = { ...defaults, seed: 17, limits };
    assertSuccess(base, generateAssembly(base, options), options);
  }
  const options = { ...defaults, limits: { widthMm: 468, heightMm: 68, depthMm: 468 } };
  const result = generateAssembly(base, options);
  assertSuccess(base, result, options);
  assert.equal(result.stats.usedParts, 8);
  assert.equal(result.stats.bounds.widthMm, 468);
  assert.equal(result.stats.bounds.heightMm, 68);
  assert.equal(result.stats.bounds.depthMm, 468);
  const nearBoundary = { ...defaults, limits: { widthMm: 468 - 5e-7, heightMm: 68 - 5e-7, depthMm: 468 - 5e-7 } };
  assertSuccess(base, generateAssembly(base, nearBoundary), nearBoundary);
  const impossible = generateAssembly(base, { ...defaults, limits: { widthMm: 467, heightMm: 67, depthMm: 467 } });
  assert.equal(impossible.status, "no-solution");
  assert.equal(impossible.reason, "no-closed-solution");
});

test("continue an isolated T with its immutable pose, exact stock and all three original sockets occupied", () => {
  const inventory = onlyInventory({ tube: 7, elbow: 4, tee: 2, screw: 14, wrench: 2, anchor: 4 });
  const original = connector("existing-T", "tee", [12.5, 34, -28.75]);
  const base = deepFreeze(withParts([original], inventory));
  const options = { ...defaults, mode: "continue", limits: { heightMm: 468 }, seed: 2 };
  const result = generateAssembly(base, options);
  const generated = assertSuccess(base, result, options);
  assert.deepEqual(generated.parts.find((part) => part.id === original.id), original);
  assert.equal(generated.parts.length, 13);
  assert.equal(result.stats.addedParts, 12);
});

test("compact repair seeds close all six connector kinds in all 24 orientations before stock maximization", () => {
  // The previous growth-first schedule missed 14 of these 144 ordinary cases at
  // the default 2000 attempts. A much smaller cap now exercises the guaranteed
  // compact completion seeds, while the later search can keep improving usage.
  const options = { ...defaults, mode: "continue", maxAttempts: 64, allowFloating: true };
  for (const kind of structural.slice(1)) for (let orientation = 0; orientation < 24; orientation++) {
    const original = orientedConnector("fixed", kind, [123.25, 834.125, -300.5], orientation);
    const base = withParts([original]);
    const result = generateAssembly(base, options);
    assert.equal(result.status, "success", `${kind} orientation ${orientation}: ${JSON.stringify(result)}`);
    const generated = assertSuccess(base, result, options);
    assert.deepEqual(generated.parts.find((part) => part.id === original.id), original);
  }
});

test("all grounded connector orientations without a downward socket have a closed completion", () => {
  const options = { ...defaults, mode: "continue", maxAttempts: 64 };
  let checked = 0;
  for (const kind of structural.slice(1)) for (let orientation = 0; orientation < 24; orientation++) {
    const original = orientedConnector("fixed-grounded", kind, [123.25, 34, -300.5], orientation);
    if (worldPorts(original).some((port) => port.direction[1] < 0)) continue;
    const base = withParts([original]);
    const result = generateAssembly(base, options);
    assert.equal(result.status, "success", `${kind} grounded orientation ${orientation}: ${JSON.stringify(result)}`);
    const generated = assertSuccess(base, result, options);
    assert.deepEqual(generated.parts.find((part) => part.id === original.id), original);
    checked++;
  }
  assert.ok(checked >= 40);
});

test("continue a partly built cube preserves all existing identifiers, types, positions and rotations", () => {
  const complete = closedCube();
  const base = deepFreeze(withParts(complete.parts.filter((part) => !["cube-c-111", "cube-c-011", "cube-t-000-0", "cube-t-100-1"].includes(part.id))));
  const options = { ...defaults, mode: "continue", limits: { widthMm: 468, heightMm: 468, depthMm: 468 }, seed: 9 };
  const result = generateAssembly(base, options);
  const generated = assertSuccess(base, result, options);
  for (const original of base.parts) assert.deepEqual(generated.parts.find((part) => part.id === original.id), original);
  assert.equal(generated.parts.length, 20);
});

test("continue uses actual fixed connector bottoms near both floor-tolerance boundaries", () => {
  for (const sign of [1, -1]) {
    const parts = closedCube().parts.map((part) => ({ ...part,
      positionMm: part.positionMm.map((value, axis) => value + (axis === 1 ? sign * 0.125 : 0)) }));
    const anchorIndex = parts.findIndex((part) => part.id === "cube-c-010");
    const anchor = parts.splice(anchorIndex, 1)[0];
    anchor.positionMm[1] += sign * 0.5;
    parts.unshift(anchor);
    const complete = withParts(parts);
    const base = deepFreeze(withParts(parts.filter((part) => part.id !== "cube-t-000-0")));
    const snapshot = JSON.stringify(base);
    const options = { ...defaults, mode: "continue", seed: 19, maxAttempts: 128,
      limits: { widthMm: 468, heightMm: 468.5, depthMm: 468 } };
    assert.equal(checkGeneratedDocument(base, complete, options), true);
    const floatingOptions = { ...options, allowFloating: true };
    const floating = generateAssembly(base, floatingOptions);
    assertSuccess(base, floating, floatingOptions);
    assert.equal(checkGeneratedDocument(base, floating.document, options), true,
      "A real supported completion exists despite the first hub's nominal floor offset.");
    for (const allowFloating of [undefined, false]) {
      const strictOptions = { ...options, ...(allowFloating === undefined ? {} : { allowFloating }) };
      const result = generateAssembly(base, strictOptions);
      const generated = assertSuccess(base, result, strictOptions);
      assert.equal(generated.parts.length, 20);
      for (const original of base.parts) assert.deepEqual(generated.parts.find((part) => part.id === original.id), original);
      assert.equal(result.stats.bounds.min[1], sign * 0.125);
    }
    assert.equal(JSON.stringify(base), snapshot);
  }
});

test("both free ends of an existing tube acquire real connectors and a closed connected cycle", () => {
  const inventory = onlyInventory({ tube: 4, elbow: 4, screw: 8 });
  const original = tube("existing-tube", [200, 34, 0], [1, 0, 0]);
  const base = withParts([original], inventory);
  const options = { ...defaults, mode: "continue", limits: { heightMm: 68 } };
  const result = generateAssembly(base, options);
  assertSuccess(base, result, options);
  assert.deepEqual(result.document.parts.find((part) => part.id === original.id), original);
  assert.equal(deriveConnections(result.document.parts).filter(({ a, b }) => a.instanceId === original.id || b.instanceId === original.id).length, 2);
});

test("continue connects distinct starting pieces, while a closed starting assembly has no usable socket", () => {
  const inventory = onlyInventory({ tube: 4, elbow: 4, screw: 8 });
  const base = withParts([
    connector("separate-a", "elbow", [0, 34, 0], [[1, 0, 0], [0, 0, 1]]),
    connector("separate-b", "elbow", [400, 34, 400], [[-1, 0, 0], [0, 0, -1]]),
  ], inventory);
  assert.equal(analyzeAssembly(base.parts).connected, false);
  const options = { ...defaults, mode: "continue", limits: { heightMm: 68 } };
  assertSuccess(base, generateAssembly(base, options), options);
  const closed = closedCube();
  assert.deepEqual(generateAssembly(closed, { ...defaults, mode: "continue" }), { status: "no-solution", reason: "already-closed", attempts: 0 });
});

test("new mode replaces all existing pieces and avoids identifiers from the replaced document", () => {
  const base = withParts([tube("generated-16-0", [200, 34, 0], [1, 0, 0])]);
  const snapshot = JSON.stringify(base);
  const result = generateAssembly(base, defaults);
  assertSuccess(base, result, defaults);
  assert.ok(!result.document.parts.some((part) => part.id === "generated-16-0"));
  assert.equal(JSON.stringify(base), snapshot);
});

test("impossible stock, screws, lattice and downward continuation return no partial document", () => {
  const cases = [
    [makeEmptyDocument(onlyInventory({ tube: 3, elbow: 4, screw: 8 })), defaults],
    [makeEmptyDocument(onlyInventory({ tube: 4, elbow: 4, screw: 7 })), defaults],
    [makeEmptyDocument(onlyInventory({ tube: 20, tee: 20, screw: 40 })), defaults],
    [withParts([tube("a", [200, 34, 0], [1, 0, 0]), tube("b", [1000.75, 34, 0], [1, 0, 0])]), { ...defaults, mode: "continue" }],
    [withParts([connector("down", "elbow", [0, 75, 0], [[1, 0, 0], [0, -1, 0]])]), { ...defaults, mode: "continue" }],
  ];
  for (const [base, options] of cases) {
    const snapshot = JSON.stringify(base);
    const result = generateAssembly(base, options);
    assert.equal(result.status, "no-solution");
    assert.equal(result.reason, "no-closed-solution");
    assert.ok(!("document" in result));
    assert.equal(JSON.stringify(base), snapshot);
  }
});

test("invalid documents/options and existing dimensions outside caps fail with neutral stable reasons", () => {
  const base = makeEmptyDocument();
  for (const options of [null, {}, { ...defaults, mode: "other" }, { ...defaults, seed: NaN }, { ...defaults, seed: 0.5 },
    { ...defaults, limits: null }, { ...defaults, limits: { heightMm: 0 } }, { ...defaults, limits: { depthMm: Infinity } },
    { ...defaults, limits: { widthMm: -1 } }, { ...defaults, maxAttempts: 1.5 }, { ...defaults, unexpected: true },
    ...[null, 0, 1, "false", "true", [], {}].map((allowFloating) => ({ ...defaults, allowFloating }))]) {
    assert.deepEqual(generateAssembly(base, options), { status: "no-solution", reason: "invalid-options", attempts: 0 });
  }
  for (const bad of [null, { ...base, version: 2 }, { ...base, inventory: { ...base.inventory, tube: -1 } },
    { ...base, parts: [tube("duplicate", [200, 34, 0], [1, 0, 0]), tube("duplicate", [1000, 34, 0], [1, 0, 0])] },
    { ...base, parts: [{ id: "bad", partId: "wrench", orientation: 0, positionMm: [0, 100, 0] }] }]) {
    assert.deepEqual(generateAssembly(bad, defaults), { status: "no-solution", reason: "invalid-document", attempts: 0 });
  }
  const existing = withParts([tube("long", [200, 34, 0], [1, 0, 0])]);
  assert.deepEqual(generateAssembly(existing, { ...defaults, mode: "continue", limits: { widthMm: 349 } }),
    { status: "no-solution", reason: "outside-limits", attempts: 0 });
});

test("attempt budget is clamped, completion stays bounded, and failure does not mutate frozen inputs", () => {
  const base = deepFreeze(makeEmptyDocument(onlyInventory({ tube: 4, elbow: 4, screw: 8 })));
  const started = performance.now();
  for (const requested of [-10, 0, 1, 2, 15, 20001]) {
    const options = deepFreeze({ ...defaults, maxAttempts: requested });
    const result = generateAssembly(base, options);
    const attempts = result.status === "success" ? result.stats.attempts : result.attempts;
    assert.ok(attempts <= Math.max(1, Math.min(20000, requested)));
    if (result.status === "success") assertSuccess(base, result, options);
  }
  assert.ok(performance.now() - started < 10000, "Small-stock search should terminate promptly even with a high requested cap.");
  const emptyContinue = { ...defaults, mode: "continue", maxAttempts: 200 };
  assertSuccess(base, generateAssembly(base, emptyContinue), emptyContinue);
});

test("omitted and false floating options produce the same useful supported multi-level assemblies across seeds", () => {
  const base = deepFreeze(makeEmptyDocument());
  for (const seed of [1, 3, 17, 42]) {
    const options = deepFreeze({ ...defaults, seed });
    const result = generateAssembly(base, options);
    assertSuccess(base, result, options);
    assert.deepEqual(generateAssembly(base, { ...options, allowFloating: false }), result);
    assert.ok(result.stats.usedParts >= 80, `Seed ${seed} should use substantial stock while maintaining every vertical column.`);
    assert.ok(result.stats.bounds.heightMm >= 468, "Supported upper levels must remain available.");
    assert.equal(result.stats.bounds.min[1], 0);
  }
});

test("a larger floating branch cannot hide a smaller supported result", () => {
  const base = makeEmptyDocument();
  const options = { ...defaults, seed: 3 };
  const strict = generateAssembly(base, options);
  const floatingOptions = { ...options, allowFloating: true };
  const floating = generateAssembly(base, floatingOptions);
  assertSuccess(base, strict, options);
  assertSuccess(base, floating, floatingOptions);
  assert.equal(analyzeAssemblySupport(floating.document.parts).supported, false);
  assert.ok(floating.stats.usedParts > strict.stats.usedParts);
});

test("strict small-budget continuation adds real legs below an unsupported existing tube without moving it", () => {
  const inventory = onlyInventory({ tube: 4, elbow: 4, screw: 8 });
  const original = tube("elevated-existing-tube", [200, 434, 0], [1, 0, 0]);
  const base = deepFreeze(withParts([original], inventory));
  const snapshot = JSON.stringify(base);
  assert.equal(analyzeAssemblySupport(base.parts).supported, false);
  for (const seed of [1, 3, 42]) for (const allowFloating of [undefined, false]) {
    const options = { ...defaults, mode: "continue", seed, maxAttempts: 64,
      ...(allowFloating === undefined ? {} : { allowFloating }) };
    const result = generateAssembly(base, options);
    const generated = assertSuccess(base, result, options);
    assert.deepEqual(generated.parts.find((part) => part.id === original.id), original);
    assert.equal(result.stats.bounds.heightMm, 468);
    assert.equal(result.stats.usedParts, 8);
    assert.equal(generated.parts.filter((part) => part.partId === "tube" && worldPorts(part)[0].direction[1] !== 0).length, 2);
  }
  assert.equal(JSON.stringify(base), snapshot);
});

test("ground-anchored compact seeds repair 64 elevated downward and through fitting orientations", () => {
  const options = { ...defaults, mode: "continue", maxAttempts: 64, allowFloating: false };
  let checked = 0;
  for (const kind of ["elbow", "tee", "corner3", "corner4", "cross"]) for (let orientation = 0; orientation < 24; orientation++) {
    const original = orientedConnector("elevated-fixed", kind, [123.25, 834.125, -300.5], orientation);
    if (!worldPorts(original).some((port) => port.direction[1] < 0)) continue;
    const base = withParts([original]);
    const result = generateAssembly(base, options);
    assert.equal(result.status, "success", `${kind} downward orientation ${orientation}: ${JSON.stringify(result)}`);
    const generated = assertSuccess(base, result, options);
    assert.deepEqual(generated.parts.find((part) => part.id === original.id), original);
    assert.ok(result.stats.bounds.min[1] <= 0.5);
    assert.ok(result.stats.bounds.heightMm >= 868);
    checked++;
  }
  assert.equal(checked, 64);
});

test("the same elevated fixture needs floating permission when caps or stock prevent vertical columns", () => {
  for (const [hubHeight, limits] of [[434, { heightMm: 68 }], [834, {}]]) {
    const original = tube("capped-floating-tube", [200, hubHeight, 0], [1, 0, 0]);
    const base = deepFreeze(withParts([original], onlyInventory({ tube: 4, elbow: 4, screw: 8 })));
    const snapshot = JSON.stringify(base);
    const options = { ...defaults, mode: "continue", maxAttempts: 64, limits };
    for (const allowFloating of [undefined, false]) {
      const result = generateAssembly(base, { ...options, ...(allowFloating === undefined ? {} : { allowFloating }) });
      assert.equal(result.status, "no-solution");
      assert.equal(result.reason, "no-closed-solution");
      assert.ok(!("document" in result));
    }
    const floatingOptions = { ...options, allowFloating: true };
    const floating = generateAssembly(base, floatingOptions);
    const generated = assertSuccess(base, floating, floatingOptions);
    assert.equal(analyzeAssemblySupport(generated.parts).supported, false);
    assert.deepEqual(generated.parts.find((part) => part.id === original.id), original);
    assert.equal(checkGeneratedDocument(base, generated, options), false);
    assert.equal(JSON.stringify(base), snapshot);
  }
});

test("a closed floating baseline cannot be extended or silently replaced in strict continue mode", () => {
  const inventory = onlyInventory({ tube: 4, elbow: 4, screw: 8 });
  const original = tube("floating-baseline-tube", [200, 434, 0], [1, 0, 0]);
  const options = { ...defaults, mode: "continue", limits: { heightMm: 68 }, maxAttempts: 64, allowFloating: true };
  const initial = withParts([original], inventory);
  const floating = generateAssembly(initial, options);
  const base = deepFreeze(assertSuccess(initial, floating, options));
  const snapshot = JSON.stringify(base);
  for (const allowFloating of [undefined, false]) {
    assert.deepEqual(generateAssembly(base, { ...defaults, mode: "continue", ...(allowFloating === undefined ? {} : { allowFloating }) }),
      { status: "no-solution", reason: "no-closed-solution", attempts: 0 });
  }
  assert.deepEqual(generateAssembly(base, { ...defaults, mode: "continue", allowFloating: true }),
    { status: "no-solution", reason: "already-closed", attempts: 0 });
  assert.equal(JSON.stringify(base), snapshot);
});

test("floating permission preserves all hard stock, closure, collision and dimension constraints", () => {
  const cases = [
    [makeEmptyDocument(onlyInventory({ tube: 3, elbow: 4, screw: 8 })), {}],
    [makeEmptyDocument(onlyInventory({ tube: 4, elbow: 4, screw: 7 })), {}],
    [makeEmptyDocument(onlyInventory({ tube: 20, tee: 20, screw: 40 })), {}],
    [makeEmptyDocument(), { widthMm: 467, heightMm: 67, depthMm: 467 }],
  ];
  for (const [base, limits] of cases) for (const allowFloating of [false, true]) {
    const result = generateAssembly(base, { ...defaults, limits, allowFloating });
    assert.equal(result.status, "no-solution");
    assert.equal(result.reason, "no-closed-solution");
    assert.ok(!("document" in result));
  }
  const colliding = { ...makeEmptyDocument(), parts: [
    tube("collision-a", [200, 34, 0], [1, 0, 0]),
    tube("collision-b", [200, 34, 0], [1, 0, 0]),
  ] };
  for (const allowFloating of [false, true]) assert.deepEqual(generateAssembly(colliding, { ...defaults, allowFloating }),
    { status: "no-solution", reason: "invalid-document", attempts: 0 });
});
