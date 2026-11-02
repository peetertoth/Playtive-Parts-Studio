import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  DEFAULT_INVENTORY, INSERTION_DEPTH_MM, SNAP_DISTANCE_MM, ORIENTATIONS,
  rotateVector, rotateOrientation, getPartDefinition, worldPorts,
  deriveConnections, inventoryUsage, remainingInventory, makeEmptyDocument,
  evaluatePlacement, commitPlacement, removePlacedPart, rotatePlacedPart,
  validateDocument, groundedPosition,
} from "../src/lib/assembly-engine.ts";

const add = (a, b) => a.map((value, axis) => value + b[axis]);
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const scale = (a, n) => a.map((value) => value * n);
const close = (a, b) => a.every((value, axis) => Math.abs(value - b[axis]) < 1e-8);
const noSnap = { magnetic: false };
const tube = (id, positionMm, direction = [0, 1, 0]) => ({
  id, partId: "tube", positionMm,
  orientation: ORIENTATIONS.findIndex((_, index) => close(rotateVector([0, 1, 0], index), direction)),
});
function localHub(partId) {
  const port = getPartDefinition(partId).ports[0];
  return subtract(port.positionMm, scale(port.direction, 75));
}
function connector(id, partId, hub, orientation = 0) {
  return { id, partId, orientation, positionMm: subtract(hub, rotateVector(localHub(partId), orientation)) };
}
function orientationFor(partId, desired) {
  return ORIENTATIONS.findIndex((_, orientation) => {
    const directions = getPartDefinition(partId).ports.map((port) => rotateVector(port.direction, orientation));
    return desired.length === directions.length && desired.every((d) => directions.some((actual) => close(d, actual)));
  });
}
function documentWith(parts, inventory = DEFAULT_INVENTORY) {
  return validateDocument({ ...makeEmptyDocument(inventory), parts });
}
function outwardTube(id, hub, direction) {
  return tube(id, add(hub, scale(direction, 200)), direction);
}
function groundDraft(id, partId, x, z, orientation = 0, placementHeightMm = 0) {
  return { id, partId, orientation, positionMm: groundedPosition(partId, [x, placementHeightMm, z], orientation) };
}
function dragAndCommit(document, candidate, options = {}) {
  const preview = evaluatePlacement(document, candidate, { autoOrient: true, placementHeightMm: 0, ...options });
  assert.equal(preview.valid, true, preview.reason);
  assert.ok(preview.snap, `The ground-drag preview of ${candidate.id} must actually attach.`);
  const committed = commitPlacement(document, preview.part, { autoOrient: false });
  assert.equal(committed.result.valid, true, committed.result.reason);
  assert.deepEqual(committed.result.part, preview.part, "Committing the preview must preserve its pose.");
  assert.deepEqual(committed.result.connections, preview.connections);
  return { document: committed.document, preview };
}

test("24 exact proper rotations form a closed group with identity 0", () => {
  assert.equal(ORIENTATIONS.length, 24);
  assert.equal(new Set(ORIENTATIONS.map(String)).size, 24);
  assert.deepEqual(ORIENTATIONS[0], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  for (const [index, m] of ORIENTATIONS.entries()) {
    assert.ok(m.every((value) => Number.isInteger(value) && Math.abs(value) <= 1));
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    assert.equal(det, 1);
    assert.equal(rotateVector([3, 4, 12], index).reduce((sum, value) => sum + value * value, 0), 169);
    for (const axis of ["x", "y", "z"]) {
      let next = index;
      for (let turn = 0; turn < 4; turn++) next = rotateOrientation(next, axis);
      assert.equal(next, index);
      assert.equal(rotateOrientation(rotateOrientation(index, axis), axis, -1), index);
      assert.equal(rotateOrientation(index, axis, 0), index);
    }
  }
  assert.deepEqual(rotateVector([0, 1, 0], rotateOrientation(0, "x")), [0, 0, 1]);
  assert.deepEqual(rotateVector([1, 0, 0], rotateOrientation(0, "y")), [0, 0, -1]);
  assert.throws(() => rotateOrientation(0, "y", 0.5), /90°/);
  assert.throws(() => rotateVector([1, 0, 0], 24), /24/);
});

test("related-manual stock is independent and tools remain supplies", () => {
  assert.deepEqual(DEFAULT_INVENTORY, { tube: 64, elbow: 5, tee: 6, corner3: 15, corner4: 8, cross: 2, connector5: 3, screw: 132, wrench: 2, anchor: 4 });
  const first = makeEmptyDocument();
  const second = makeEmptyDocument();
  first.inventory.tube = 0;
  assert.equal(second.inventory.tube, 64);
  assert.equal(remainingInventory(second).wrench, 2);
  for (const partId of ["screw", "wrench", "anchor"]) {
    const result = evaluatePlacement(second, { id: partId, partId, positionMm: [0, 200, 0], orientation: 0 });
    assert.equal(result.valid, false);
    assert.equal(result.issue.code, "accessory");
  }
});

test("world ports apply rotation and translation without rounding fractional coordinates", () => {
  const orientation = rotateOrientation(0, "z", -1);
  const part = { id: "p", partId: "tube", orientation, positionMm: [10.25, 80, 9.75] };
  assert.deepEqual(worldPorts(part).map((port) => [port.positionMm, port.direction]), [
    [[-164.75, 80, 9.75], [-1, 0, 0]], [[185.25, 80, 9.75], [1, 0, 0]],
  ]);
});

test("only opposing tube/socket ends at the estimated 50 mm engagement form joins", () => {
  const hub = [0, 100, 0];
  const socket = connector("elbow", "elbow", hub);
  const pipe = outwardTube("tube", hub, [1, 0, 0]);
  assert.equal(INSERTION_DEPTH_MM, 50);
  assert.equal(deriveConnections([socket, pipe]).length, 1);
  const atMouth = { ...pipe, positionMm: add(pipe.positionMm, [50, 0, 0]) };
  assert.equal(deriveConnections([socket, atMouth]).length, 0);
  assert.equal(deriveConnections([socket, { ...pipe, positionMm: add(pipe.positionMm, [0.49, 0, 0]) }]).length, 1);
  assert.equal(deriveConnections([socket, { ...pipe, positionMm: add(pipe.positionMm, [0.51, 0, 0]) }]).length, 0);
  assert.equal(deriveConnections([pipe, tube("other", [550, 100, 0], [1, 0, 0])]).length, 0);
  assert.equal(deriveConnections([socket, connector("other", "elbow", [50, 100, 0])]).length, 0);
});

test("a socket cannot be occupied twice, even when all endpoint equations match", () => {
  const hub = [0, 100, 0];
  const socket = connector("elbow", "elbow", hub);
  const pipe = outwardTube("tube1", hub, [1, 0, 0]);
  const duplicate = { ...pipe, id: "tube2" };
  assert.equal(deriveConnections([socket, pipe, duplicate]).length, 1);
  const result = evaluatePlacement(documentWith([socket, pipe]), duplicate, noSnap);
  assert.equal(result.valid, false);
  assert.equal(result.issue.code, "portConflict");
});

test("magnetic placement solves endpoint math, changes only to a discrete orientation and respects 100 mm", () => {
  const socket = connector("elbow", "elbow", [0, 100, 0]);
  const document = documentWith([socket]);
  const candidate = tube("tube", [260, 100, 0]);
  const snapped = evaluatePlacement(document, candidate);
  assert.equal(snapped.valid, true);
  assert.ok(snapped.snap);
  assert.equal(snapped.snap.distanceMm, 60);
  assert.deepEqual(snapped.part.positionMm, [200, 100, 0]);
  assert.ok(Number.isInteger(snapped.part.orientation));
  assert.ok(snapped.part.orientation >= 0 && snapped.part.orientation < 24);
  assert.equal(snapped.connections.length, 1);
  assert.deepEqual(candidate.positionMm, [260, 100, 0]);
  assert.equal(candidate.orientation, 0);
  const fixedOrientation = evaluatePlacement(document, candidate, { autoOrient: false });
  assert.equal(fixedOrientation.part.orientation, candidate.orientation);
  assert.equal(fixedOrientation.snap, null);
  assert.equal(SNAP_DISTANCE_MM, 100);
  assert.ok(evaluatePlacement(document, tube("edge", [300, 100, 0], [1, 0, 0])).snap);
  assert.equal(evaluatePlacement(document, tube("far", [301, 100, 0], [1, 0, 0])).snap, null);
  assert.equal(evaluatePlacement(document, candidate, { maxSnapDistanceMm: 59 }).snap, null);
});

test("occupied target ports never attract another part", () => {
  const hub = [0, 100, 0];
  const document = documentWith([connector("e", "elbow", hub), outwardTube("existing", hub, [1, 0, 0])]);
  const result = evaluatePlacement(document, outwardTube("new", [40, 100, 0], [1, 0, 0]));
  assert.equal(result.snap, null);
  assert.equal(result.valid, false);
});

test("magnetic placement preserves an explicit quarter-turn over a closer alternative orientation", () => {
  const hub = [0, 100, 0];
  const document = documentWith([outwardTube("existing", hub, [1, 0, 0])]);
  const unrotated = connector("new", "elbow", hub);
  const requestedOrientation = rotateOrientation(unrotated.orientation, "x");
  const manualDraft = { ...unrotated, orientation: requestedOrientation };
  // The original elbow orientation needs no translation. The requested twist
  // keeps its +X socket and needs a small translation, so it should win anyway.
  assert.equal(evaluatePlacement(document, unrotated).snap.distanceMm, 0);
  const result = evaluatePlacement(document, manualDraft);
  assert.equal(result.valid, true, result.reason);
  assert.equal(result.part.orientation, requestedOrientation);
  assert.ok(result.snap.distanceMm > 0 && result.snap.distanceMm < SNAP_DISTANCE_MM);
  assert.equal(result.connections.length, 1);
});

test("sequential ground-drag drafts attach three tubes to all three T sockets", () => {
  const first = commitPlacement(makeEmptyDocument(), groundDraft("tee", "tee", 0, 0), { autoOrient: false });
  assert.equal(first.result.valid, true, first.result.reason);
  let document = first.document;
  for (const [index, [x, z, socket]] of [[-212, 8, "socket-1"], [211, -9, "socket-2"], [8, 7, "socket-3"]].entries()) {
    const candidate = groundDraft(`t${index}`, "tube", x, z);
    assert.equal(candidate.orientation, 0);
    assert.equal(candidate.positionMm[1], 175);
    const placed = dragAndCommit(document, candidate);
    assert.deepEqual(placed.preview.snap.target, { instanceId: "tee", portId: socket });
    document = placed.document;
    assert.equal(deriveConnections(document.parts).length, index + 1);
  }
  assert.equal(inventoryUsage(document).tube, 3);
  assert.equal(inventoryUsage(document).screw, 3);
  assert.equal(new Set(deriveConnections(document.parts).map((join) => join.b.portId)).size, 3);
  assert.doesNotThrow(() => validateDocument(document));
});

test("ground auto-orientation rebases its grounding lift without expanding the magnetic radius", () => {
  const raw = { id: "free", partId: "tube", positionMm: [2000, 0, 2000], orientation: 0 };
  const free = evaluatePlacement(makeEmptyDocument(), raw, { placementHeightMm: 0 });
  assert.equal(free.valid, true, free.reason);
  assert.deepEqual(free.part.positionMm, [2000, 175, 2000]);
  assert.equal(free.snap, null);
  assert.equal(evaluatePlacement(makeEmptyDocument(), raw).valid, false);
  const socket = groundDraft("tee", "tee", 0, 0);
  const document = documentWith([socket]);
  // Original upright draft center Y175 is 141 mm above the side sockets.
  // Its horizontal fallback rests at Y25, only 9 mm below the socket axis.
  const candidate = groundDraft("tube", "tube", 210, 0);
  const inferredFloor = evaluatePlacement(document, candidate);
  assert.ok(inferredFloor.snap);
  assert.equal(inferredFloor.valid, true, inferredFloor.reason);
  assert.deepEqual(inferredFloor.part.positionMm, [200, 34, 0]);
  assert.ok(Math.abs(inferredFloor.snap.distanceMm - Math.hypot(10, 9)) < 1e-8);
  const raisedPlane = evaluatePlacement(document, candidate, { placementHeightMm: 100 });
  assert.equal(raisedPlane.valid, true, raisedPlane.reason);
  assert.ok(Math.abs(raisedPlane.snap.distanceMm - Math.hypot(10, 66)) < 1e-8);
  assert.equal(evaluatePlacement(document, candidate, { placementHeightMm: 140 }).snap, null);
  assert.equal(evaluatePlacement(document, candidate, { placementHeightMm: 0, autoOrient: false }).snap, null);
  assert.equal(evaluatePlacement(document, candidate, { placementHeightMm: Infinity }).valid, false);
  assert.equal(evaluatePlacement(document, groundDraft("far", "tube", 301, 0), { placementHeightMm: 0 }).snap, null);
  assert.equal(SNAP_DISTANCE_MM, 100);
});

test("a magnetically placed tube accepts a second connector on its opposite end", () => {
  let document = documentWith([groundDraft("near", "tee", 0, 0)]);
  document = dragAndCommit(document, groundDraft("tube", "tube", 211, -8)).document;
  const far = dragAndCommit(document, groundDraft("far", "tee", 412, 9));
  document = far.document;
  assert.equal(far.preview.snap.target.instanceId, "tube");
  assert.equal(deriveConnections(document.parts).length, 2);
  assert.equal(new Set(deriveConnections(document.parts).map((join) => join.a.portId)).size, 2);
  assert.equal(inventoryUsage(document).tee, 2);
  assert.equal(inventoryUsage(document).screw, 2);
  assert.doesNotThrow(() => validateDocument(document));
});

test("explicit port targeting attaches a connector above 400 mm without widening ordinary snapping", () => {
  let document = documentWith([groundDraft("base", "tee", 0, 0)]);
  document = dragAndCommit(document, groundDraft("upright", "tube", 8, -6)).document;
  const pipe = document.parts.find((part) => part.id === "upright");
  const upper = worldPorts(pipe).find((port) => port.direction[1] === 1);
  assert.ok(upper.positionMm[1] > 400);
  const candidate = groundDraft("top", "tee", 12, 8);
  const withoutTarget = evaluatePlacement(document, candidate, { placementHeightMm: 0 });
  assert.equal(withoutTarget.snap, null);
  const snapTarget = { instanceId: upper.instanceId, portId: upper.portId };
  const placed = dragAndCommit(document, candidate, { snapTarget });
  assert.deepEqual(placed.preview.snap.target, snapTarget);
  assert.ok(placed.preview.snap.distanceMm > SNAP_DISTANCE_MM);
  assert.equal(placed.preview.connections.length, 2);
  assert.equal(new Set(placed.preview.connections.map((join) => join.a.portId)).size, 2);
  assert.doesNotThrow(() => validateDocument(placed.document));
  // Occupied, missing, incompatible, and fixed-incompatible targets must refuse
  // the drop, even if another free nearby port could have supplied a fallback.
  for (const target of [
    snapTarget,
    { instanceId: "missing", portId: "socket-1" },
    { instanceId: "base", portId: "socket-1" },
  ]) {
    const result = commitPlacement(placed.document, groundDraft("refused", "tee", 200, 0), { snapTarget: target });
    assert.equal(result.result.valid, false);
    assert.equal(result.document, placed.document);
    assert.equal(result.result.snap, null);
  }
  const fixed = evaluatePlacement(document, candidate, { snapTarget, autoOrient: false });
  assert.equal(fixed.valid, false);
  assert.equal(fixed.issue.code, "targetOrientation");
  const noScrews = { ...document, inventory: { ...document.inventory, screw: 1 } };
  const shortage = commitPlacement(noScrews, candidate, { snapTarget });
  assert.equal(shortage.result.valid, false);
  assert.equal(shortage.result.issue.code, "screwStock");
  assert.equal(shortage.document, noScrews);
});

test("an explicit target still rejects exposed collisions and below-ground geometry", () => {
  const document = documentWith([
    groundDraft("tee", "tee", 0, 0),
    tube("blocker", [200, 34, 0], [0, 0, 1]),
  ]);
  const collision = commitPlacement(document, groundDraft("new", "tube", 2000, 2000), {
    placementHeightMm: 0, snapTarget: { instanceId: "tee", portId: "socket-2" },
  });
  assert.equal(collision.result.valid, false);
  assert.equal(collision.result.issue.code, "collision");
  assert.equal(collision.document, document);
  const upright = documentWith([groundDraft("upright", "tube", 0, 0)]);
  const underground = commitPlacement(upright, groundDraft("new", "tee", 1000, 1000), {
    snapTarget: { instanceId: "upright", portId: "end-bottom" },
  });
  assert.equal(underground.result.valid, false);
  assert.equal(underground.result.issue.code, "belowGround");
  assert.equal(underground.document, upright);
});

test("perpendicular tubes in a common connector are valid while exposed crossings collide", () => {
  const hub = [0, 100, 0];
  const connected = [connector("c", "corner3", hub), ...[[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((direction, index) => outwardTube(`t${index}`, hub, direction))];
  const document = documentWith(connected);
  assert.equal(deriveConnections(document.parts).length, 3);
  const crossing = evaluatePlacement(documentWith([tube("x", [0, 300, 0], [1, 0, 0])]), tube("z", [0, 300, 0], [0, 0, 1]), noSnap);
  assert.equal(crossing.valid, false);
  assert.equal(crossing.issue.code, "collision");
  assert.equal(evaluatePlacement(documentWith([tube("a", [0, 300, 0])]), tube("b", [0, 350, 0]), noSnap).valid, false);
  assert.equal(evaluatePlacement(documentWith([tube("a", [0, 300, 0])]), tube("b", [0, 650, 0]), noSnap).valid, true);
});

test("collision bodies allow nearby free space that lies inside a connector's bounding box", () => {
  const socket = connector("e", "elbow", [0, 100, 0]);
  const document = documentWith([socket]);
  // The empty diagonal corner of the L bounding box is not solid plastic.
  const candidate = tube("t", [70, 170, 200], [0, 0, 1]);
  assert.equal(evaluatePlacement(document, candidate, noSnap).valid, true);
  const collision = tube("t", [0, 100, 0], [0, 0, 1]);
  assert.equal(evaluatePlacement(document, collision, noSnap).valid, false);
});

test("every socket of all connector kinds accepts simultaneous tubes in all 24 orientations", () => {
  const hub = [0, 500, 0];
  for (const partId of ["elbow", "tee", "corner3", "corner4", "cross", "connector5"]) {
    for (let orientation = 0; orientation < 24; orientation++) {
      const socket = connector("c", partId, hub, orientation);
      const pipes = worldPorts(socket).map((port, index) => outwardTube(`t${index}`, hub, port.direction));
      const document = documentWith([socket, ...pipes]);
      assert.equal(deriveConnections(document.parts).length, pipes.length, `${partId}, orientation ${orientation}`);
      assert.equal(inventoryUsage(document).screw, pipes.length);
    }
  }
});

test("a closed square automatically derives both joins on the final tube", () => {
  const hubs = [[0, 100, 0], [400, 100, 0], [400, 100, 400], [0, 100, 400]];
  const directions = [[[1, 0, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, -1]], [[1, 0, 0], [0, 0, -1]]];
  const corners = hubs.map((hub, index) => connector(`c${index}`, "elbow", hub, orientationFor("elbow", directions[index])));
  const tubes = [tube("x0", [200, 100, 0], [1, 0, 0]), tube("z1", [400, 100, 200], [0, 0, 1]), tube("x1", [200, 100, 400], [1, 0, 0]), tube("z0", [0, 100, 200], [0, 0, 1])];
  const before = documentWith([...corners, ...tubes.slice(0, 3)]);
  assert.equal(deriveConnections(before.parts).length, 6);
  const { document, result } = commitPlacement(before, { ...tubes[3], positionMm: [10, 100, 210] });
  assert.equal(result.valid, true, result.reason);
  assert.equal(result.connections.length, 8);
  assert.equal(inventoryUsage(document).screw, 8);
  assert.equal(inventoryUsage(document).elbow, 4);
  assert.deepEqual(result.part.positionMm, tubes[3].positionMm);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(document))), document);
});

test("a square built through sequential magnetic ground drags closes both final tube ends", () => {
  const hubs = [[0, 34, 0], [400, 34, 0], [400, 34, 400], [0, 34, 400]];
  const directions = [[[1, 0, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, -1]], [[1, 0, 0], [0, 0, -1]]];
  const corners = hubs.map((hub, index) => connector(`c${index}`, "elbow", hub, orientationFor("elbow", directions[index])));
  const seed = groundDraft("c0", "elbow", corners[0].positionMm[0], corners[0].positionMm[2], corners[0].orientation);
  let document = commitPlacement(makeEmptyDocument(), seed, { autoOrient: false }).document;
  const cornerDraft = (index, dx, dz) => groundDraft(`c${index}`, "elbow", corners[index].positionMm[0] + dx, corners[index].positionMm[2] + dz, corners[index].orientation);
  const drafts = [
    groundDraft("x0", "tube", 211, -8), cornerDraft(1, 9, -7),
    groundDraft("z1", "tube", 411, 192), cornerDraft(2, -8, 10),
    groundDraft("x1", "tube", 208, 411), cornerDraft(3, -10, 8),
    groundDraft("z0", "tube", 9, 212),
  ];
  for (const [index, candidate] of drafts.entries()) {
    const placed = dragAndCommit(document, candidate);
    if (candidate.partId === "elbow") assert.equal(placed.preview.part.orientation, candidate.orientation);
    document = placed.document;
    assert.equal(deriveConnections(document.parts).length, index === 6 ? 8 : index + 1);
  }
  assert.equal(document.parts.length, 8);
  assert.equal(inventoryUsage(document).tube, 4);
  assert.equal(inventoryUsage(document).elbow, 4);
  assert.equal(inventoryUsage(document).screw, 8);
  const finalJoins = deriveConnections(document.parts).filter((join) => join.a.instanceId === "z0");
  assert.equal(finalJoins.length, 2);
  assert.equal(new Set(finalJoins.map((join) => join.a.portId)).size, 2);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(document))), document);
});

test("stock and one screw per join are enforced; removing a part releases both", () => {
  const inventory = { ...DEFAULT_INVENTORY, tube: 1, screw: 1 };
  const hub = [0, 100, 0];
  const socket = connector("e", "elbow", hub);
  const before = documentWith([socket], inventory);
  const first = commitPlacement(before, outwardTube("t", hub, [1, 0, 0]), noSnap);
  assert.equal(first.result.valid, true);
  assert.equal(remainingInventory(first.document).tube, 0);
  assert.equal(remainingInventory(first.document).screw, 0);
  const exhausted = commitPlacement(first.document, tube("new", [1000, 200, 0]), noSnap);
  assert.equal(exhausted.result.valid, false);
  assert.equal(exhausted.result.issue.code, "partStock");
  assert.equal(exhausted.document, first.document);
  const noScrews = documentWith([socket], { ...inventory, screw: 0 });
  assert.equal(evaluatePlacement(noScrews, outwardTube("t", hub, [1, 0, 0]), noSnap).issue.code, "screwStock");
  const removed = removePlacedPart(first.document, "t");
  assert.equal(remainingInventory(removed).tube, 1);
  assert.equal(remainingInventory(removed).screw, 1);
  assert.equal(removePlacedPart(removed, "missing"), removed);
});

test("commits, moves and removals leave caller-owned state untouched", () => {
  const before = makeEmptyDocument();
  const serialized = JSON.stringify(before);
  const candidate = tube("t", [0, 200, 0]);
  const first = commitPlacement(before, candidate, noSnap);
  assert.equal(first.result.valid, true);
  assert.equal(JSON.stringify(before), serialized);
  assert.notEqual(first.document.inventory, before.inventory);
  candidate.positionMm[0] = 999;
  assert.equal(first.document.parts[0].positionMm[0], 0);
  first.result.part.positionMm[0] = 500;
  assert.equal(first.document.parts[0].positionMm[0], 0);
  const firstSerialized = JSON.stringify(first.document);
  const moved = commitPlacement(first.document, tube("t", [1000, 200, 0]), noSnap);
  assert.equal(moved.document.parts.length, 1);
  assert.equal(inventoryUsage(moved.document).tube, 1);
  assert.equal(JSON.stringify(first.document), firstSerialized);
  removePlacedPart(moved.document, "t");
  assert.equal(moved.document.parts.length, 1);
});

test("rotation pivots around the physical connector hub and preserves occupied neighbor endpoints", () => {
  const hub = [0, 150, 0];
  const socket = connector("e", "elbow", hub);
  const pipe = outwardTube("t", hub, [1, 0, 0]);
  const before = documentWith([socket, pipe]);
  const allowed = rotatePlacedPart(before, "e", "x");
  assert.equal(allowed.result.valid, true, allowed.result.reason);
  const rotatedHub = add(allowed.result.part.positionMm, rotateVector(localHub("elbow"), allowed.result.part.orientation));
  assert.deepEqual(rotatedHub, hub);
  assert.notDeepEqual(allowed.result.part.positionMm, socket.positionMm);
  assert.deepEqual(allowed.document.parts.find((part) => part.id === "t"), pipe);
  assert.equal(deriveConnections(allowed.document.parts).length, 1);
  const refused = rotatePlacedPart(before, "e", "z");
  assert.equal(refused.result.valid, false);
  assert.equal(refused.result.issue.code, "connectedRotation");
  assert.equal(refused.document, before);
  assert.equal(rotatePlacedPart(before, "t", "z").result.valid, false);
  assert.equal(rotatePlacedPart(before, "t", "x").result.valid, true);
  const detached = commitPlacement(before, { ...socket, positionMm: add(socket.positionMm, [1000, 0, 0]) }, noSnap).document;
  assert.equal(rotatePlacedPart(detached, "e", "z").result.valid, true);
});

test("symmetric connector rotation can preserve a neighbor using a different physical socket", () => {
  const hub = [0, 150, 0];
  const document = documentWith([connector("c", "cross", hub), outwardTube("t", hub, [1, 0, 0])]);
  const rotated = rotatePlacedPart(document, "c", "y");
  assert.equal(rotated.result.valid, true, rotated.result.reason);
  assert.equal(deriveConnections(rotated.document.parts).length, 1);
});

test("grounding follows the rotated bounding box and never lowers a raised part", () => {
  assert.deepEqual(groundedPosition("tube", [20, 0, 30], 0), [20, 175, 30]);
  const horizontal = rotateOrientation(0, "z");
  assert.deepEqual(groundedPosition("tube", [20, -300, 30], horizontal), [20, 25, 30]);
  assert.deepEqual(groundedPosition("tube", [20, 500, 30], horizontal), [20, 500, 30]);
  assert.equal(evaluatePlacement(makeEmptyDocument(), tube("t", [0, 0, 0]), noSnap).valid, false);
});

test("imports reject malformed schema, transforms, inventory and coordinates without altering input", () => {
  const original = documentWith([tube("t", [0, 200, 0])]);
  const originalJson = JSON.stringify(original);
  const invalid = [null, [], {}, { ...original, version: 2 }, { ...original, arbitrary: true }];
  for (const inventory of [null, { tube: 1 }, { ...original.inventory, tube: -1 }, { ...original.inventory, tube: 0.5 }, { ...original.inventory, tube: Infinity }, { ...original.inventory, tube: 10_001 }, { ...original.inventory, extra: 1 }]) invalid.push({ ...original, inventory });
  for (const override of [
    { partId: "screw" }, { partId: "wrench" }, { partId: "anchor" }, { partId: "unknown" },
    { orientation: -1 }, { orientation: 24 }, { orientation: 0.25 }, { orientation: NaN },
    { positionMm: [NaN, 200, 0] }, { positionMm: [Infinity, 200, 0] },
    { positionMm: [100_001, 200, 0] }, { positionMm: [-100_001, 200, 0] },
    { positionMm: [0, -200, 0] }, { positionMm: [0, 100_001, 0] },
    { positionMm: [0, 200] }, { positionMm: [0, "200", 0] },
    { id: "" }, { id: "x".repeat(129) }, { quaternion: [0, 0, 0, 1] },
  ]) invalid.push({ ...original, parts: [{ ...original.parts[0], ...override }] });
  invalid.push({ ...original, parts: [original.parts[0], { ...tube("t", [1000, 200, 0]) }] });
  invalid.push({ ...original, inventory: { ...original.inventory, tube: 0 } });
  invalid.push({ ...original, parts: [original.parts[0], tube("another", [0, 200, 0])] });
  invalid.push({ ...original, parts: Array(1) });
  invalid.push({ ...original, parts: [{ ...original.parts[0], positionMm: Array(3) }] });
  for (const input of invalid) assert.throws(() => validateDocument(input), Error);
  assert.equal(JSON.stringify(original), originalJson);
  const validated = validateDocument(original);
  validated.parts[0].positionMm[0] = 999;
  validated.inventory.tube = 0;
  assert.equal(JSON.stringify(original), originalJson);
});

test("imports enforce derived screw supply and validate already connected geometry", () => {
  const hub = [0, 100, 0];
  const connected = documentWith([connector("e", "elbow", hub), outwardTube("t", hub, [1, 0, 0])]);
  assert.throws(() => validateDocument({ ...connected, inventory: { ...connected.inventory, screw: 0 } }), (error) => error.issue.code === "screwStock");
  assert.doesNotThrow(() => validateDocument({ ...connected, parts: connected.parts.map((part) => part.id === "t" ? { ...part, positionMm: add(part.positionMm, [0.4, 0, 0]) } : part) }));
});

test("103-part reference inventory remains responsive in a sparse live-placement benchmark", (context) => {
  const parts = [];
  let index = 0;
  for (const partId of ["tube", "elbow", "tee", "corner3", "corner4", "cross", "connector5"]) {
    for (let count = 0; count < DEFAULT_INVENTORY[partId]; count++) {
      parts.push({ id: `bench-${index}`, partId, orientation: 0, positionMm: [(index % 20) * 1000, 300, Math.floor(index / 20) * 1000] });
      index++;
    }
  }
  assert.equal(parts.length, 103);
  const document = documentWith(parts);
  const moving = parts[0];
  const started = performance.now();
  for (let frame = 0; frame < 100; frame++) {
    const result = evaluatePlacement(document, { ...moving, positionMm: [-2000 + frame, 300, 0] });
    assert.equal(result.valid, true, result.reason);
  }
  const elapsed = performance.now() - started;
  context.diagnostic(`103 structural parts, 100 magnetic previews: ${elapsed.toFixed(1)} ms (${(elapsed / 100).toFixed(2)} ms/preview); timing is diagnostic, not a hardware-dependent assertion.`);
});
