import test from "node:test";
import assert from "node:assert/strict";
import { PARTS } from "../src/domain/catalog.ts";
import { analyzeAssembly, checkGeneratedDocument } from "../src/lib/assembly-analysis.ts";
import { analyzeAssemblySupport } from "../src/lib/assembly-support.ts";
import {
  ORIENTATIONS, makeEmptyDocument, rotateVector, validateDocument,
} from "../src/lib/assembly-engine.ts";

const sameVector = (a, b) => a.every((value, axis) => value === b[axis]);
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const add = (a, b) => a.map((value, axis) => value + b[axis]);
const direction = (a, b) => subtract(b, a).map(Math.sign);

function connector(id, hub, desired) {
  for (const definition of PARTS.filter((part) => part.category === "connector" && part.ports.length === desired.length)) {
    const orientation = ORIENTATIONS.findIndex((_, index) => {
      const actual = definition.ports.map((port) => rotateVector(port.direction, index));
      return desired.every((wanted) => actual.some((value) => sameVector(value, wanted)));
    });
    if (orientation === -1) continue;
    const first = definition.ports[0];
    const localHub = first.positionMm.map((value, axis) => value - first.direction[axis] * 75);
    return { id, partId: definition.id, orientation, positionMm: subtract(hub, rotateVector(localHub, orientation)) };
  }
  assert.fail(`No catalog connector matches ${JSON.stringify(desired)}`);
}

function tube(id, center, desired) {
  return {
    id, partId: "tube", positionMm: center,
    orientation: ORIENTATIONS.findIndex((_, index) => sameVector(rotateVector([0, 1, 0], index), desired)),
  };
}

// Every edge is an actual 400 mm hub-to-hub connection using the catalog's
// 350 mm tube and 50 mm insertion at each 75 mm socket.
function graph(hubs, edges) {
  const connectors = Object.entries(hubs).map(([id, hub]) => connector(id, hub, edges.flatMap(([a, b]) =>
    a === id ? [direction(hub, hubs[b])] : b === id ? [direction(hub, hubs[a])] : [])));
  const tubes = edges.map(([a, b]) => tube(`tube:${a}:${b}`,
    add(hubs[a], hubs[b]).map((value) => value / 2), direction(hubs[a], hubs[b])));
  return validateDocument({ ...makeEmptyDocument(), parts: [...connectors, ...tubes] });
}

function grid(width = 2, levels = 2, omitMiddleLegs = false) {
  const hubs = {};
  const edges = [];
  const id = (x, y, z) => `${x},${y},${z}`;
  for (let x = 0; x < width; x++) for (let y = 0; y < levels; y++) for (let z = 0; z < 2; z++) {
    const current = id(x, y, z);
    hubs[current] = [x * 400, 34 + y * 400, z * 400];
    if (x) edges.push([id(x - 1, y, z), current]);
    if (z) edges.push([id(x, y, z - 1), current]);
    if (y && (!omitMiddleLegs || x === 0 || x === width - 1)) edges.push([id(x, y - 1, z), current]);
  }
  return graph(hubs, edges);
}

function shifted(parts, offset) {
  return parts.map((part) => ({ ...part, positionMm: add(part.positionMm, offset) }));
}

function unsupported(parts) {
  return analyzeAssemblySupport(parts).unsupportedPartIds;
}

test("ground square and ordinary grounded cube have support at every connector and tube", () => {
  for (const document of [grid(2, 1), grid()]) {
    assert.equal(analyzeAssembly(document.parts).freePorts.length, 0);
    assert.deepEqual(analyzeAssemblySupport(document.parts), { supported: true, unsupportedPartIds: [] });
  }
});

test("a closed connected cube above actual ground has no support seeds", () => {
  const parts = shifted(grid().parts, [0, 100, 0]);
  const analysis = analyzeAssembly(parts);
  assert.equal(analysis.connected, true);
  assert.equal(analysis.freePorts.length, 0);
  assert.deepEqual(analyzeAssemblySupport(parts), {
    supported: false, unsupportedPartIds: parts.map((part) => part.id).sort(),
  });
});

test("a closed lateral overhang cannot inherit support through a grounded cube's top beams", () => {
  const document = grid();
  const hubs = {};
  const edges = [];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    const id = `${x},${y},${z}`;
    hubs[id] = [x * 400, 34 + y * 400, z * 400];
    if (x) edges.push([`0,${y},${z}`, id]);
    if (y) edges.push([`${x},0,${z}`, id]);
    if (z) edges.push([`${x},${y},0`, id]);
  }
  hubs.farFront = [800, 434, 0];
  hubs.farBack = [800, 434, 400];
  edges.push(["1,1,0", "farFront"], ["farFront", "farBack"], ["farBack", "1,1,1"]);
  const overhang = graph(hubs, edges);
  assert.equal(analyzeAssembly(overhang.parts).connected, true);
  assert.equal(analyzeAssembly(overhang.parts).freePorts.length, 0);
  assert.deepEqual(unsupported(overhang.parts), [
    "farBack", "farFront", "tube:1,1,0:farFront", "tube:farBack:1,1,1", "tube:farFront:farBack",
  ].sort());
  const options = { mode: "new", limits: {}, seed: 3 };
  assert.equal(checkGeneratedDocument(makeEmptyDocument(), overhang, options), false);
  assert.equal(checkGeneratedDocument(makeEmptyDocument(), overhang, { ...options, allowFloating: true }), true);
  assert.deepEqual(analyzeAssemblySupport(document.parts), { supported: true, unsupportedPartIds: [] });
});

test("middle connectors over a beam need their own columns even with legs at both ends", () => {
  const document = grid(3, 2, true);
  assert.equal(analyzeAssembly(document.parts).connected, true);
  assert.equal(analyzeAssembly(document.parts).freePorts.length, 0);
  assert.deepEqual(unsupported(document.parts), [
    "1,1,0", "1,1,1", "tube:0,1,0:1,1,0", "tube:0,1,1:1,1,1",
    "tube:1,1,0:1,1,1", "tube:1,1,0:2,1,0", "tube:1,1,1:2,1,1",
  ].sort());
  assert.equal(checkGeneratedDocument(makeEmptyDocument(), document, { mode: "new", limits: {}, seed: 3 }), false);
});

test("stacked vertical tube chains support several levels independently of part order", () => {
  const parts = grid(2, 3).parts;
  const permutations = [parts, [...parts].reverse(), [...parts.slice(13), ...parts.slice(0, 13)]];
  for (const permutation of permutations) {
    assert.deepEqual(analyzeAssemblySupport(permutation), { supported: true, unsupportedPartIds: [] });
    assert.equal(checkGeneratedDocument(makeEmptyDocument(), { ...makeEmptyDocument(), parts: permutation }, {
      mode: "new", limits: {}, seed: 3,
    }), true);
  }
  const broken = parts.filter((part) => part.id !== "tube:0,0,0:0,1,0");
  const expected = unsupported(broken);
  assert.ok(expected.includes("0,1,0"));
  assert.ok(expected.includes("0,2,0"));
  assert.ok(expected.includes("tube:0,1,0:0,2,0"));
  assert.equal(expected.includes("1,2,1"), false);
  assert.deepEqual(unsupported([...broken].reverse()), expected);
});

test("all catalog connector rotations seed support at their physical bottom, including sleeve contact", () => {
  for (const definition of PARTS.filter((part) => part.category === "connector")) {
    const { length, height, width } = definition.dimensionsMm;
    for (let orientation = 0; orientation < 24; orientation++) {
      const matrix = ORIENTATIONS[orientation];
      const cornerHeights = [-length / 2, length / 2].flatMap((x) => [-height / 2, height / 2].flatMap((y) =>
        [-width / 2, width / 2].map((z) => matrix[3] * x + matrix[4] * y + matrix[5] * z)));
      const halfHeight = -Math.min(...cornerHeights);
      const grounded = { id: "connector", partId: definition.id, orientation, positionMm: [12.125, halfHeight, -7.375] };
      for (const offset of [-0.5, 0, 0.5]) {
        assert.equal(analyzeAssemblySupport(shifted([grounded], [0, offset, 0])).supported, true, `${definition.id}/${orientation}/${offset}`);
      }
      for (const offset of [-0.50001, 0.50001, 34]) {
        assert.deepEqual(unsupported(shifted([grounded], [0, offset, 0])), ["connector"]);
      }
    }
  }
});

test("column support uses actual tube connections and the planner's 0.5 mm join tolerance", () => {
  const lower = connector("lower", [0, 34, 0], [[1, 0, 0], [0, 1, 0]]);
  const upper = connector("upper", [0, 434, 0], [[1, 0, 0], [0, -1, 0]]);
  const column = tube("column", [0, 234, 0], [0, 1, 0]);
  for (const offset of [0, 0.125, 0.5]) {
    const shiftedColumn = shifted([column], [offset, 0, 0])[0];
    assert.deepEqual(analyzeAssemblySupport([lower, upper, shiftedColumn]), { supported: true, unsupportedPartIds: [] });
  }
  assert.deepEqual(unsupported([lower, upper, ...shifted([column], [0.50001, 0, 0])]), ["column", "upper"]);
  assert.deepEqual(unsupported([upper, column]), ["column", "upper"]);
  // A tube cannot support itself merely by resting its own body on the floor.
  assert.deepEqual(unsupported([tube("bare-column", [0, 175, 0], [0, 1, 0])]), ["bare-column"]);
});

test("a vertical tube needs its lower endpoint; horizontal tubes need both supported endpoints", () => {
  const lower = connector("lower", [0, 34, 0], [[1, 0, 0], [0, 1, 0]]);
  const vertical = tube("vertical", [0, 234, 0], [0, 1, 0]);
  assert.deepEqual(analyzeAssemblySupport([lower, vertical]), { supported: true, unsupportedPartIds: [] });
  const horizontal = tube("horizontal", [200, 34, 0], [1, 0, 0]);
  assert.deepEqual(unsupported([lower, horizontal]), ["horizontal"]);
  const right = connector("right", [400, 34, 0], [[-1, 0, 0], [0, 0, 1]]);
  assert.deepEqual(analyzeAssemblySupport([lower, horizontal, right]), { supported: true, unsupportedPartIds: [] });
  const hanging = tube("hanging", [0, -166, 0], [0, 1, 0]);
  const groundWithDownPort = connector("grounded-top", [0, 75, 0], [[1, 0, 0], [0, -1, 0]]);
  const hangingFromGrounded = { ...hanging, positionMm: [0, -125, 0] };
  assert.deepEqual(unsupported([groundWithDownPort, hangingFromGrounded]), ["hanging"]);
});

test("fractional offsets, repeated calls and returned arrays leave caller data unchanged", () => {
  const parts = shifted(grid(2, 3).parts, [0.125, 0.375, -0.25]);
  for (const part of parts) { Object.freeze(part.positionMm); Object.freeze(part); }
  Object.freeze(parts);
  const before = JSON.stringify(parts);
  for (let attempt = 0; attempt < 30; attempt++) {
    assert.deepEqual(analyzeAssemblySupport(parts), { supported: true, unsupportedPartIds: [] });
  }
  const floating = shifted(parts, [0, 0.25, 0]);
  const expected = floating.map((part) => part.id).sort();
  const result = analyzeAssemblySupport(floating);
  assert.deepEqual(result, { supported: false, unsupportedPartIds: expected });
  result.unsupportedPartIds.length = 0;
  assert.deepEqual(unsupported([...floating].reverse()), expected);
  assert.equal(JSON.stringify(parts), before);
});
