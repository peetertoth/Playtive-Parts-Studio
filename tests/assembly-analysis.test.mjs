import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PARTS } from "../src/domain/catalog.ts";
import { analyzeAssembly, checkGeneratedDocument, withinGenerationLimits } from "../src/lib/assembly-analysis.ts";
import {
  DEFAULT_INVENTORY, ORIENTATIONS, getPartDefinition, makeEmptyDocument,
  rotateVector, validateDocument, worldPorts,
} from "../src/lib/assembly-engine.ts";

const cube = JSON.parse(readFileSync(new URL("../examples/cube.json", import.meta.url), "utf8"));
const options = (mode = "new", limits = {}) => ({ mode, limits, seed: 123 });
const add = (a, b) => a.map((value, axis) => value + b[axis]);
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const sameVector = (a, b) => a.every((value, axis) => value === b[axis]);
function orientationFor(partId, desired) {
  const orientation = ORIENTATIONS.findIndex((_, index) => {
    const actual = getPartDefinition(partId).ports.map(({ direction }) => rotateVector(direction, index));
    return desired.length === actual.length && desired.every((direction) => actual.some((value) => sameVector(direction, value)));
  });
  assert.ok(orientation >= 0, `${partId} must have a matching cube rotation`);
  return orientation;
}
function connector(id, partId, hub, desired) {
  const orientation = orientationFor(partId, desired);
  const first = getPartDefinition(partId).ports[0];
  const localHub = first.positionMm.map((value, axis) => value - first.direction[axis] * 75);
  return { id, partId, orientation, positionMm: subtract(hub, rotateVector(localHub, orientation)) };
}
function square() {
  const hubs = [[0, 34, 0], [400, 34, 0], [400, 34, 400], [0, 34, 400]];
  const directions = [
    [[1, 0, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 0, -1]], [[1, 0, 0], [0, 0, -1]],
  ];
  const corners = hubs.map((hub, index) => connector(`c${index}`, "elbow", hub, directions[index]));
  const tube = (id, positionMm, direction) => ({
    id, partId: "tube", positionMm,
    orientation: ORIENTATIONS.findIndex((_, index) => sameVector(rotateVector([0, 1, 0], index), direction)),
  });
  return validateDocument({
    ...makeEmptyDocument(),
    parts: [...corners,
      tube("x0", [200, 34, 0], [1, 0, 0]), tube("z1", [400, 34, 200], [0, 0, 1]),
      tube("x1", [200, 34, 400], [1, 0, 0]), tube("z0", [0, 34, 200], [0, 0, 1]),
    ],
  });
}
function shifted(document, offset, prefix = "") {
  return { ...structuredClone(document), parts: document.parts.map((part) => ({
    ...part, id: prefix + part.id, positionMm: add(part.positionMm, offset),
  })) };
}

test("closed square and reference cube audit every endpoint and physical outer bounds", () => {
  for (const [document, tubes, connectors, connections, bounds] of [
    [square(), 4, 4, 8, { min: [-34, 0, -34], max: [434, 68, 434], widthMm: 468, heightMm: 68, depthMm: 468 }],
    [validateDocument(cube), 12, 8, 24, { min: [-34, 0, -34], max: [434, 468, 434], widthMm: 468, heightMm: 468, depthMm: 468 }],
  ]) {
    const analysis = analyzeAssembly(document.parts);
    assert.deepEqual(analysis, { bounds, freePorts: [], connected: true, connections, tubes, connectors });
    assert.equal(checkGeneratedDocument(makeEmptyDocument(document.inventory), document, options()), true);
  }
});

test("a connected loop with an unused multiport socket fails even when every tube end is occupied", () => {
  const document = square();
  document.parts[0] = connector("c0", "tee", [0, 34, 0], [[1, 0, 0], [-1, 0, 0], [0, 0, 1]]);
  assert.doesNotThrow(() => validateDocument(document));
  const analysis = analyzeAssembly(document.parts);
  assert.equal(analysis.connected, true);
  assert.equal(analysis.connections, 8);
  assert.equal(analysis.freePorts.length, 1);
  assert.equal(analysis.freePorts[0].instanceId, "c0");
  const free = worldPorts(document.parts[0]).find((port) => port.portId === analysis.freePorts[0].portId);
  assert.deepEqual(free.direction, [-1, 0, 0]);
  assert.equal(checkGeneratedDocument(makeEmptyDocument(), document, options()), false);
});

test("disconnected closed cubes are rejected despite zero free endpoints", () => {
  const inventory = { ...DEFAULT_INVENTORY, corner3: 16 };
  const document = validateDocument({ version: 1, inventory, parts: [...cube.parts, ...shifted(cube, [1000, 0, 0], "second-").parts] });
  const analysis = analyzeAssembly(document.parts);
  assert.equal(analysis.freePorts.length, 0);
  assert.equal(analysis.connections, 48);
  assert.equal(analysis.connected, false);
  assert.equal(checkGeneratedDocument(makeEmptyDocument(inventory), document, options()), false);
});

test("empty and dangling assemblies never count as completed", () => {
  assert.deepEqual(analyzeAssembly([]), {
    bounds: { min: [0, 0, 0], max: [0, 0, 0], widthMm: 0, heightMm: 0, depthMm: 0 },
    freePorts: [], connected: false, connections: 0, tubes: 0, connectors: 0,
  });
  const document = square();
  document.parts.pop();
  const analysis = analyzeAssembly(document.parts);
  assert.equal(analysis.connected, true);
  assert.equal(analysis.freePorts.length, 2);
  assert.deepEqual(new Set(analysis.freePorts.map((port) => port.instanceId)), new Set(["c0", "c3"]));
  assert.equal(checkGeneratedDocument(makeEmptyDocument(), document, options()), false);
  assert.equal(checkGeneratedDocument(makeEmptyDocument(), makeEmptyDocument(), options()), false);
});

test("all 24 orientations use rotated catalog body corners for every structural kind", () => {
  const positionMm = [100.125, 1000.25, -80.375];
  for (const definition of PARTS.filter((part) => part.category !== "accessory")) {
    const { length, height, width } = definition.dimensionsMm;
    for (let orientation = 0; orientation < 24; orientation++) {
      const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => {
        const local = [x * length / 2, y * height / 2, z * width / 2];
        const matrix = ORIENTATIONS[orientation];
        return [0, 1, 2].map((axis) => positionMm[axis] + local.reduce((sum, value, component) => sum + matrix[axis * 3 + component] * value, 0));
      })));
      const min = [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis])));
      const max = [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis])));
      const analysis = analyzeAssembly([{ id: "rotated", partId: definition.id, positionMm, orientation }]);
      assert.deepEqual(analysis.bounds, { min, max, widthMm: max[0] - min[0], heightMm: max[1] - min[1], depthMm: max[2] - min[2] }, `${definition.id}, orientation ${orientation}`);
    }
  }
});

test("limits include connector bodies rather than the hub grid or tube endpoints", () => {
  const document = square();
  const base = makeEmptyDocument();
  assert.equal(checkGeneratedDocument(base, document, options("new", { widthMm: 400 })), false);
  assert.equal(checkGeneratedDocument(base, document, options("new", { heightMm: 50 })), false);
  assert.equal(checkGeneratedDocument(base, document, options("new", { widthMm: 468, heightMm: 68, depthMm: 468 })), true);
  const moved = shifted(document, [1730, 400, -290]);
  assert.equal(checkGeneratedDocument(base, moved, options("new", { widthMm: 468, heightMm: 68, depthMm: 468 })), true);
});

test("optional caps act independently with inclusive thresholds and a 1e-6 mm tolerance", () => {
  const bounds = { min: [0, 0, 0], max: [468, 68, 868], widthMm: 468, heightMm: 68, depthMm: 868 };
  assert.equal(withinGenerationLimits(bounds, {}), true);
  for (const [axis, maximum] of [["widthMm", 468], ["heightMm", 68], ["depthMm", 868]]) {
    assert.equal(withinGenerationLimits(bounds, { [axis]: maximum }), true);
    assert.equal(withinGenerationLimits(bounds, { [axis]: maximum - 0.5e-6 }), true);
    assert.equal(withinGenerationLimits(bounds, { [axis]: maximum - 2e-6 }), false);
  }
  assert.equal(withinGenerationLimits(bounds, { widthMm: 468, heightMm: 68, depthMm: 867 }), false);
});

test("candidate inventory must exactly match every baseline supply count", () => {
  const document = square();
  const base = makeEmptyDocument();
  for (const kind of Object.keys(base.inventory)) {
    const changed = structuredClone(document);
    changed.inventory[kind]++;
    assert.equal(checkGeneratedDocument(base, changed, options()), false, kind);
  }
  const reordered = { ...document, inventory: Object.fromEntries(Object.entries(document.inventory).reverse()) };
  assert.equal(checkGeneratedDocument(base, reordered, options()), true);
});

test("continue preserves every existing ID, kind, exact position and orientation", () => {
  const complete = square();
  const partial = { ...structuredClone(complete), parts: complete.parts.slice(0, 3) };
  const before = JSON.stringify(partial);
  assert.equal(checkGeneratedDocument(partial, complete, options("continue")), true);
  assert.equal(checkGeneratedDocument(complete, { ...complete, parts: [...complete.parts].reverse() }, options("continue")), true);
  const changedId = structuredClone(complete);
  changedId.parts[0].id = "replacement";
  assert.equal(checkGeneratedDocument(partial, changedId, options("continue")), false);
  assert.equal(checkGeneratedDocument(partial, shifted(complete, [1000, 0, 0]), options("continue")), false);
  assert.equal(checkGeneratedDocument(partial, shifted(complete, [1000, 0, 0]), options("new")), true);
  const tinyShift = shifted(complete, [1e-7, 0, 0]);
  assert.equal(checkGeneratedDocument(partial, tinyShift, options("new")), true);
  assert.equal(checkGeneratedDocument(partial, tinyShift, options("continue")), false);
  const changedKind = structuredClone(complete);
  [changedKind.parts[0].id, changedKind.parts[4].id] = [changedKind.parts[4].id, changedKind.parts[0].id];
  assert.equal(checkGeneratedDocument(partial, changedKind, options("new")), true);
  assert.equal(checkGeneratedDocument(partial, changedKind, options("continue")), false);
  // An axially symmetric tube has identical world ports after an axial rotation,
  // but continue must still preserve the original saved orientation exactly.
  const tube = complete.parts.find((part) => part.partId === "tube");
  const equivalent = ORIENTATIONS.findIndex((_, orientation) => orientation !== tube.orientation
    && sameVector(rotateVector([0, 1, 0], orientation), rotateVector([0, 1, 0], tube.orientation)));
  assert.ok(equivalent >= 0);
  const changedOrientation = structuredClone(complete);
  changedOrientation.parts.find((part) => part.id === tube.id).orientation = equivalent;
  assert.equal(checkGeneratedDocument(complete, changedOrientation, options("new")), true);
  assert.equal(checkGeneratedDocument(complete, changedOrientation, options("continue")), false);
  // A translated closed replacement is valid in new mode even when it removes
  // every baseline ID, which exercises the mode distinction independently.
  const replacement = shifted(complete, [1000, 0, 0], "replacement-");
  assert.equal(checkGeneratedDocument(partial, replacement, options("new")), true);
  assert.equal(checkGeneratedDocument(partial, replacement, options("continue")), false);
  assert.equal(JSON.stringify(partial), before);
});

test("the result guard rejects schema, floor, stock and collision errors without throwing", () => {
  const document = square();
  const base = makeEmptyDocument();
  const malformed = [null, {}, { ...document, version: 2 }, { ...document, parts: [{ ...document.parts[0], orientation: 24 }] }];
  const belowGround = shifted(document, [0, -1, 0]);
  const insufficientStock = { ...document, inventory: { ...document.inventory, screw: 7 } };
  const crossing = { ...document.parts[4], id: "collision", orientation: document.parts[5].orientation };
  const overlapping = { ...document, parts: [...document.parts, crossing] };
  assert.throws(() => validateDocument(overlapping), (error) => error.issue.code === "collision");
  assert.throws(() => validateDocument(insufficientStock), (error) => error.issue.code === "screwStock");
  for (const candidate of [...malformed, belowGround, overlapping]) {
    assert.doesNotThrow(() => assert.equal(checkGeneratedDocument(base, candidate, options()), false));
  }
  assert.equal(checkGeneratedDocument(makeEmptyDocument(insufficientStock.inventory), insufficientStock, options()), false);
  assert.equal(checkGeneratedDocument(null, document, options()), false);
});

test("analysis and guards leave caller-owned document data unchanged", () => {
  const document = structuredClone(cube);
  const before = JSON.stringify(document);
  const analysis = analyzeAssembly(document.parts);
  analysis.bounds.min[0] = 10000;
  analysis.bounds.max[1] = 10000;
  assert.equal(checkGeneratedDocument(document, document, options("continue")), true);
  assert.equal(JSON.stringify(document), before);
});
