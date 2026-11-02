import { PlannerError, plannerFailure, issueFromError, type PlannerIssue, type PlannerIssueCode } from "../domain/planner-issues.ts";
import { PARTS } from "../domain/catalog.ts";
import type { PartDefinition, PartKind, Vec3 } from "../domain/parts.ts";
import type {
  AssemblyConnection,
  Axis,
  Inventory,
  PlacedPart,
  PlacementCommit,
  PlacementOptions,
  PlacementResult,
  PlannerDocument,
  PortEnd,
  SnapInfo,
  WorldPort,
} from "../domain/planner.ts";

/** Estimated socket engagement, not a verified dimension for kit 383000. */
export const INSERTION_DEPTH_MM = 50;
export const SNAP_DISTANCE_MM = 100;
export const INVENTORY_SOURCE = "IAN 369527 reference manual · page 38";
export const DEFAULT_INVENTORY: Inventory = Object.freeze({
  tube: 64, elbow: 5, tee: 6, corner3: 15, corner4: 8,
  cross: 2, connector5: 3, screw: 132, wrench: 2, anchor: 4,
});

const PORT_TOLERANCE_MM = 0.5;
const GEOMETRY_EPSILON_MM = 0.5;
const SOCKET_REACH_MM = 75;
const HUB_RADIUS_MM = 34;
const SLEEVE_RADIUS_MM = 30;
const TUBE_RADIUS_MM = 25;
// Import bounds also limit accidental, excessively large local-storage documents.
const MAX_POSITION_MM = 100_000;
const MAX_INVENTORY_COUNT = 10_000;
const MAX_PART_COUNT = 2_000;
const KINDS = Object.keys(DEFAULT_INVENTORY) as PartKind[];
const DEFINITIONS = new Map(PARTS.map((part) => [part.id, part]));

type Matrix = readonly [number, number, number, number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const QUARTER_ROTATIONS: Record<Axis, Matrix> = {
  x: [1, 0, 0, 0, 0, -1, 0, 1, 0],
  y: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  z: [0, -1, 0, 1, 0, 0, 0, 0, 1],
};

const cleanZero = (value: number) => value === 0 ? 0 : value;
function multiply(left: Matrix, right: Matrix): Matrix {
  const result = Array<number>(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      for (let k = 0; k < 3; k++) result[row * 3 + column] += left[row * 3 + k] * right[k * 3 + column];
    }
  }
  return result.map(cleanZero) as unknown as Matrix;
}

function makeOrientations(): readonly Matrix[] {
  const result: Matrix[] = [IDENTITY];
  const seen = new Set([IDENTITY.join(",")]);
  for (let index = 0; index < result.length; index++) {
    for (const axis of ["x", "y", "z"] as const) {
      const next = multiply(QUARTER_ROTATIONS[axis], result[index]);
      const key = next.join(",");
      if (!seen.has(key)) { seen.add(key); result.push(next); }
    }
  }
  return Object.freeze(result.map((matrix) => Object.freeze(matrix)));
}

/** The 24 proper cube rotations, generated with exact integer arithmetic. */
export const ORIENTATIONS = makeOrientations();
const ORIENTATION_INDICES = new Map(ORIENTATIONS.map((matrix, index) => [matrix.join(","), index]));

function requireOrientation(orientation: number): Matrix {
  if (!Number.isInteger(orientation) || orientation < 0 || orientation >= ORIENTATIONS.length) {
    throw new PlannerError({ code: "orientation" });
  }
  return ORIENTATIONS[orientation];
}

export function rotateVector(vector: Vec3, orientation: number): Vec3 {
  const matrix = requireOrientation(orientation);
  return [0, 1, 2].map((row) => cleanZero(
    matrix[row * 3] * vector[0] + matrix[row * 3 + 1] * vector[1] + matrix[row * 3 + 2] * vector[2],
  )) as unknown as Vec3;
}

export function rotateOrientation(orientation: number, axis: Axis, quarterTurns = 1): number {
  let matrix = requireOrientation(orientation);
  if (!Object.hasOwn(QUARTER_ROTATIONS, axis) || !Number.isInteger(quarterTurns)) {
    throw new PlannerError({ code: "rotation" });
  }
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let index = 0; index < turns; index++) matrix = multiply(QUARTER_ROTATIONS[axis], matrix);
  return ORIENTATION_INDICES.get(matrix.join(","))!;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, amount: number): Vec3 => [a[0] * amount, a[1] * amount, a[2] * amount];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const endKey = (end: PortEnd) => JSON.stringify([end.instanceId, end.portId]);
const copyPart = (part: PlacedPart): PlacedPart => ({ ...part, positionMm: [...part.positionMm] as Vec3 });

export function getPartDefinition(partId: string): PartDefinition {
  const definition = DEFINITIONS.get(partId);
  if (!definition) throw new PlannerError({ code: "unknownPart" });
  return definition;
}

export function worldPorts(part: PlacedPart): WorldPort[] {
  const definition = getPartDefinition(part.partId);
  return definition.ports.map((port) => ({
    instanceId: part.id, portId: port.id, kind: definition.kind,
    positionMm: add(part.positionMm, rotateVector(port.positionMm, part.orientation)),
    direction: rotateVector(port.direction, part.orientation),
  }));
}

function compatible(a: WorldPort, b: WorldPort): boolean {
  return (a.kind === "tube") !== (b.kind === "tube") && a.instanceId !== b.instanceId && dot(a.direction, b.direction) === -1;
}

interface ConnectionAnalysis { connections: AssemblyConnection[]; occupied: Set<string>; conflict: boolean }
function analyzeConnections(ports: readonly WorldPort[]): ConnectionAnalysis {
  const tubes = ports.filter((port) => port.kind === "tube");
  const sockets = ports.filter((port) => port.kind !== "tube");
  const occupied = new Set<string>();
  const connections: AssemblyConnection[] = [];
  let conflict = false;
  for (const tube of tubes) {
    for (const socket of sockets) {
      if (!compatible(tube, socket)) continue;
      const insertedEnd = subtract(socket.positionMm, scale(socket.direction, INSERTION_DEPTH_MM));
      if (distance(tube.positionMm, insertedEnd) > PORT_TOLERANCE_MM) continue;
      const tubeKey = endKey(tube);
      const socketKey = endKey(socket);
      if (occupied.has(tubeKey) || occupied.has(socketKey)) { conflict = true; continue; }
      occupied.add(tubeKey);
      occupied.add(socketKey);
      connections.push({
        a: { instanceId: tube.instanceId, portId: tube.portId },
        b: { instanceId: socket.instanceId, portId: socket.portId },
      });
    }
  }
  return { connections, occupied, conflict };
}

export function deriveConnections(parts: readonly PlacedPart[]): AssemblyConnection[] {
  return analyzeConnections(parts.flatMap(worldPorts)).connections;
}

function countUsage(parts: readonly PlacedPart[], connections: readonly AssemblyConnection[]): Inventory {
  const usage = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Inventory;
  for (const part of parts) usage[getPartDefinition(part.partId).kind]++;
  usage.screw += connections.length;
  return usage;
}

export function inventoryUsage(document: PlannerDocument): Inventory {
  return countUsage(document.parts, deriveConnections(document.parts));
}

export function remainingInventory(document: PlannerDocument): Inventory {
  const usage = inventoryUsage(document);
  return Object.fromEntries(KINDS.map((kind) => [kind, document.inventory[kind] - usage[kind]])) as Inventory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function requireKeys(value: Record<string, unknown>, expected: readonly string[], code: PlannerIssueCode): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) throw new PlannerError({ code });
}

function checkedInventory(input: unknown): Inventory {
  if (!isRecord(input)) throw new PlannerError({ code: "inventory" });
  requireKeys(input, KINDS, "inventoryFields");
  for (const kind of KINDS) {
    if (!Number.isInteger(input[kind]) || (input[kind] as number) < 0 || (input[kind] as number) > MAX_INVENTORY_COUNT) {
      throw new PlannerError({ code: "inventoryCount", partKind: kind, limit: MAX_INVENTORY_COUNT });
    }
  }
  return { ...input } as Inventory;
}

function checkedPart(input: unknown): PlacedPart {
  if (!isRecord(input)) throw new PlannerError({ code: "part" });
  requireKeys(input, ["id", "partId", "positionMm", "orientation"], "partFields");
  if (typeof input.id !== "string" || input.id.trim().length === 0 || input.id.length > 128 || /[\u0000-\u001f\u007f]/u.test(input.id)) {
    throw new PlannerError({ code: "instanceId" });
  }
  if (typeof input.partId !== "string") throw new PlannerError({ code: "partType" });
  const definition = getPartDefinition(input.partId);
  if (definition.category === "accessory") throw new PlannerError({ code: "accessory" });
  const position = input.positionMm;
  if (!Array.isArray(position) || position.length !== 3 ||
    ![0, 1, 2].every((axis) => typeof position[axis] === "number" && Number.isFinite(position[axis]) && Math.abs(position[axis]) <= MAX_POSITION_MM)) {
    throw new PlannerError({ code: "position", limit: MAX_POSITION_MM });
  }
  if (typeof input.orientation !== "number") throw new PlannerError({ code: "orientationFormat" });
  requireOrientation(input.orientation);
  return { id: input.id, partId: input.partId, positionMm: [...position] as unknown as Vec3, orientation: input.orientation };
}

export function makeEmptyDocument(inventory: Inventory = DEFAULT_INVENTORY): PlannerDocument {
  return { version: 1, inventory: checkedInventory(inventory), parts: [] };
}

function halfExtents(partId: string, orientation: number): Vec3 {
  const { length, height, width } = getPartDefinition(partId).dimensionsMm;
  const local: Vec3 = [length / 2, height / 2, width / 2];
  const matrix = requireOrientation(orientation);
  return [0, 1, 2].map((row) =>
    Math.abs(matrix[row * 3]) * local[0] + Math.abs(matrix[row * 3 + 1]) * local[1] + Math.abs(matrix[row * 3 + 2]) * local[2],
  ) as unknown as Vec3;
}

export function groundedPosition(partId: string, positionMm: Vec3, orientation: number): Vec3 {
  return [positionMm[0], Math.max(positionMm[1], halfExtents(partId, orientation)[1]), positionMm[2]];
}

interface Sphere { type: "sphere"; center: Vec3; radius: number }
interface Cylinder { type: "cylinder"; start: Vec3; end: Vec3; axis: number; radius: number }
type Body = Sphere | Cylinder;
interface PartBody { part: PlacedPart; half: Vec3; bodies: Body[] }

function connectorHub(definition: PartDefinition): Vec3 {
  const first = definition.ports[0];
  return subtract(first.positionMm, scale(first.direction, SOCKET_REACH_MM));
}

function cylinder(start: Vec3, end: Vec3, radius: number): Cylinder {
  return { type: "cylinder", start, end, radius, axis: [0, 1, 2].find((axis) => start[axis] !== end[axis])! };
}

function makeBody(part: PlacedPart, ports: readonly WorldPort[], occupied: ReadonlySet<string>): PartBody {
  const definition = getPartDefinition(part.partId);
  const half = halfExtents(part.partId, part.orientation);
  if (definition.kind === "tube") {
    // Hide the inserted portion from interference checks. It belongs inside a socket.
    const ends = ports.map((port) => occupied.has(endKey(port))
      ? subtract(port.positionMm, scale(port.direction, INSERTION_DEPTH_MM)) : port.positionMm);
    return { part, half, bodies: [cylinder(ends[0], ends[1], TUBE_RADIUS_MM)] };
  }
  const hub = add(part.positionMm, rotateVector(connectorHub(definition), part.orientation));
  return {
    part, half,
    bodies: [
      { type: "sphere", center: hub, radius: HUB_RADIUS_MM },
      ...ports.map((port) => cylinder(add(hub, scale(port.direction, 15)), port.positionMm, SLEEVE_RADIUS_MM)),
    ],
  };
}

function interval(body: Cylinder): [number, number] {
  return [Math.min(body.start[body.axis], body.end[body.axis]), Math.max(body.start[body.axis], body.end[body.axis])];
}

function distanceToInterval(point: number, low: number, high: number): number {
  return Math.max(low - point, 0, point - high);
}

function sphereCylinder(sphere: Sphere, body: Cylinder): boolean {
  const [low, high] = interval(body);
  const axial = distanceToInterval(sphere.center[body.axis], low, high);
  const radialAxes = [0, 1, 2].filter((axis) => axis !== body.axis);
  const radial = Math.hypot(...radialAxes.map((axis) => sphere.center[axis] - body.start[axis]));
  return Math.hypot(axial, Math.max(0, radial - body.radius)) < sphere.radius - GEOMETRY_EPSILON_MM;
}

function cylindersOverlap(a: Cylinder, b: Cylinder): boolean {
  const [aLow, aHigh] = interval(a);
  const [bLow, bHigh] = interval(b);
  if (a.axis === b.axis) {
    if (Math.min(aHigh, bHigh) - Math.max(aLow, bLow) <= GEOMETRY_EPSILON_MM) return false;
    const radialAxes = [0, 1, 2].filter((axis) => axis !== a.axis);
    return Math.hypot(...radialAxes.map((axis) => a.start[axis] - b.start[axis])) < a.radius + b.radius - GEOMETRY_EPSILON_MM;
  }
  // For perpendicular finite cylinders, project each other's axis interval into
  // the circular cross-section, then intersect the remaining third-axis chords.
  const third = 3 - a.axis - b.axis;
  const deltaA = distanceToInterval(b.start[a.axis], aLow, aHigh);
  const deltaB = distanceToInterval(a.start[b.axis], bLow, bHigh);
  const radiusA = a.radius - GEOMETRY_EPSILON_MM;
  const radiusB = b.radius - GEOMETRY_EPSILON_MM;
  if (deltaB >= radiusA || deltaA >= radiusB) return false;
  const chordA = Math.sqrt(radiusA * radiusA - deltaB * deltaB);
  const chordB = Math.sqrt(radiusB * radiusB - deltaA * deltaA);
  return Math.abs(a.start[third] - b.start[third]) < chordA + chordB;
}

function bodiesOverlap(a: Body, b: Body): boolean {
  if (a.type === "sphere" && b.type === "sphere") return distance(a.center, b.center) < a.radius + b.radius - GEOMETRY_EPSILON_MM;
  if (a.type === "sphere" && b.type === "cylinder") return sphereCylinder(a, b);
  if (a.type === "cylinder" && b.type === "sphere") return sphereCylinder(b, a);
  return cylindersOverlap(a as Cylinder, b as Cylinder);
}

function partsOverlap(a: PartBody, b: PartBody): boolean {
  if ([0, 1, 2].some((axis) => Math.abs(a.part.positionMm[axis] - b.part.positionMm[axis]) >= a.half[axis] + b.half[axis] - GEOMETRY_EPSILON_MM)) return false;
  return a.bodies.some((left) => b.bodies.some((right) => bodiesOverlap(left, right)));
}

interface Inspection { reason?: string; issue?: PlannerIssue; connections: AssemblyConnection[] }
function inspectParts(parts: readonly PlacedPart[], inventory: Inventory, suppliedPorts?: readonly WorldPort[]): Inspection {
  const ports = suppliedPorts ?? parts.flatMap(worldPorts);
  const analysis = analyzeConnections(ports);
  const fail = (issue: PlannerIssue): Inspection => ({ ...plannerFailure(issue), connections: analysis.connections });
  if (parts.length > MAX_PART_COUNT) return fail({ code: "partLimit", limit: MAX_PART_COUNT });
  if (new Set(parts.map((part) => part.id)).size !== parts.length) return fail({ code: "duplicateId" });
  if (analysis.conflict) return fail({ code: "portConflict" });
  const usage = countUsage(parts, analysis.connections);
  for (const kind of KINDS) {
    if (usage[kind] > inventory[kind]) return fail(kind === "screw" ? { code: "screwStock" } : { code: "partStock", partKind: kind });
  }
  const portsByPart = new Map<string, WorldPort[]>();
  for (const port of ports) {
    const group = portsByPart.get(port.instanceId) ?? [];
    group.push(port);
    portsByPart.set(port.instanceId, group);
  }
  const bodies = parts.map((part) => makeBody(part, portsByPart.get(part.id) ?? [], analysis.occupied));
  for (let index = 0; index < bodies.length; index++) {
    const body = bodies[index];
    if (body.part.positionMm[1] - body.half[1] < -GEOMETRY_EPSILON_MM) return fail({ code: "belowGround" });
    for (let other = 0; other < index; other++) {
      if (partsOverlap(body, bodies[other])) return fail({ code: "collision" });
    }
  }
  return { connections: analysis.connections };
}

function resultAt(parts: readonly PlacedPart[], inventory: Inventory, candidate: PlacedPart, snap: SnapInfo | null, basePorts: readonly WorldPort[]): PlacementResult {
  const inspection = inspectParts([...parts, candidate], inventory, [...basePorts, ...worldPorts(candidate)]);
  return { part: copyPart(candidate), valid: !inspection.reason, ...(inspection.reason ? { reason: inspection.reason, issue: inspection.issue } : {}), snap, connections: inspection.connections };
}

interface SnapCandidate { part: PlacedPart; snap: SnapInfo; originalOrientation: boolean }
function snapCandidates(candidate: PlacedPart, basePorts: readonly WorldPort[], options: PlacementOptions): SnapCandidate[] {
  const occupied = analyzeConnections(basePorts).occupied;
  let targets = basePorts.filter((port) => !occupied.has(endKey(port)));
  const requestedTarget = options.snapTarget;
  if (requestedTarget) {
    const target = basePorts.find((port) => endKey(port) === endKey(requestedTarget));
    if (!target) throw new PlannerError({ code: "targetMissing" });
    if (occupied.has(endKey(target))) throw new PlannerError({ code: "targetOccupied" });
    targets = [target];
  }
  const threshold = options.maxSnapDistanceMm ?? SNAP_DISTANCE_MM;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > MAX_POSITION_MM) throw new PlannerError({ code: "snapDistance" });
  // The draft is grounded in its current orientation. Its Y lift is not a
  // user-chosen height: a standing tube needs 175 mm, a horizontal one only 25.
  // Recover floor placement for older callers; an explicit plane also preserves
  // intermediate workplane heights that grounding otherwise makes ambiguous.
  const placementHeightMm = options.placementHeightMm ??
    (Math.abs(candidate.positionMm[1] - halfExtents(candidate.partId, candidate.orientation)[1]) < 1e-8 ? 0 : undefined);
  const orientations = options.autoOrient === false ? [candidate.orientation]
    : [candidate.orientation, ...ORIENTATIONS.map((_, index) => index).filter((index) => index !== candidate.orientation)];
  const candidates: SnapCandidate[] = [];
  const seen = new Set<string>();
  for (const orientation of orientations) {
    const positionMm = orientation !== candidate.orientation && placementHeightMm !== undefined
      ? groundedPosition(candidate.partId, [candidate.positionMm[0], placementHeightMm, candidate.positionMm[2]], orientation)
      : candidate.positionMm;
    const oriented = { ...candidate, positionMm, orientation };
    for (const source of worldPorts(oriented)) {
      for (const target of targets) {
        if (!compatible(source, target)) continue;
        const desiredEnd = subtract(target.positionMm, scale(target.direction, INSERTION_DEPTH_MM));
        const offset = subtract(desiredEnd, source.positionMm);
        const distanceMm = Math.hypot(...offset);
        // A pointer-selected port is an explicit 3D destination, so its exact
        // solution need not lie near the unrelated horizontal cursor plane.
        if (!requestedTarget && distanceMm > threshold + 1e-8) continue;
        const snappedPosition = add(oriented.positionMm, offset);
        const key = JSON.stringify([orientation, snappedPosition]);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          part: { ...candidate, orientation, positionMm: snappedPosition }, originalOrientation: orientation === candidate.orientation,
          snap: {
            source: { instanceId: candidate.id, portId: source.portId },
            target: { instanceId: target.instanceId, portId: target.portId }, distanceMm,
          },
        });
      }
    }
  }
  if (requestedTarget && candidates.length === 0) {
    throw new PlannerError({ code: "targetOrientation" });
  }
  // Respect an explicit quarter-turn whenever that orientation can still make a
  // valid nearby join. Auto-orientation is a fallback after those candidates.
  return candidates.sort((a, b) => Number(b.originalOrientation) - Number(a.originalOrientation) || a.snap.distanceMm - b.snap.distanceMm);
}

export function evaluatePlacement(document: PlannerDocument, candidate: PlacedPart, options: PlacementOptions = {}): PlacementResult {
  try {
    let part = checkedPart(candidate);
    if (options.placementHeightMm !== undefined) {
      if (!Number.isFinite(options.placementHeightMm) || Math.abs(options.placementHeightMm) > MAX_POSITION_MM) {
        throw new PlannerError({ code: "workplane" });
      }
      part = { ...part, positionMm: groundedPosition(part.partId, [part.positionMm[0], options.placementHeightMm, part.positionMm[2]], part.orientation) };
    }
    const inventory = checkedInventory(document.inventory);
    const baseParts = document.parts.filter((existing) => existing.id !== part.id);
    const basePorts = baseParts.flatMap(worldPorts);
    if (options.magnetic !== false) {
      const candidates = snapCandidates(part, basePorts, options);
      let nearest: PlacementResult | undefined;
      for (const snapped of candidates) {
        // A translation may put the center outside the importable workspace bounds.
        const checked = checkedPart(snapped.part);
        const result = resultAt(baseParts, inventory, checked, snapped.snap, basePorts);
        nearest ??= result;
        if (result.valid) return result;
        // These failures cannot be repaired by choosing a different snap position.
        if (result.issue?.code === "partStock") return result;
      }
      if (nearest) return nearest;
    }
    return resultAt(baseParts, inventory, part, null, basePorts);
  } catch (error) {
    return { part: candidate, valid: false, ...plannerFailure(issueFromError(error, "placement")), snap: null, connections: [] };
  }
}

export function commitPlacement(document: PlannerDocument, candidate: PlacedPart, options: PlacementOptions = {}): PlacementCommit {
  const result = evaluatePlacement(document, candidate, options);
  if (!result.valid) return { document, result };
  const parts = document.parts.filter((part) => part.id !== result.part.id).map(copyPart);
  parts.push(copyPart(result.part));
  return { document: { version: 1, inventory: { ...document.inventory }, parts }, result };
}

export function removePlacedPart(document: PlannerDocument, id: string): PlannerDocument {
  if (!document.parts.some((part) => part.id === id)) return document;
  return { version: 1, inventory: { ...document.inventory }, parts: document.parts.filter((part) => part.id !== id).map(copyPart) };
}

export function rotatePlacedPart(document: PlannerDocument, id: string, axis: Axis, quarterTurns = 1): PlacementCommit {
  const part = document.parts.find((entry) => entry.id === id);
  if (!part) return { document, result: { part: { id, partId: "tube", positionMm: [0, 0, 0], orientation: 0 }, valid: false, ...plannerFailure({ code: "selectedMissing" }), snap: null, connections: [] } };
  try {
    const definition = getPartDefinition(part.partId);
    const orientation = rotateOrientation(part.orientation, axis, quarterTurns);
    const localPivot: Vec3 = definition.kind === "tube" ? [0, 0, 0] : connectorHub(definition);
    const worldPivot = add(part.positionMm, rotateVector(localPivot, part.orientation));
    const candidate = { ...part, orientation, positionMm: subtract(worldPivot, rotateVector(localPivot, orientation)) };
    const before = deriveConnections(document.parts);
    const after = deriveConnections(document.parts.map((entry) => entry.id === id ? candidate : entry));
    const occupiedNeighbors = before.flatMap((connection) => connection.a.instanceId === id ? [connection.b] : connection.b.instanceId === id ? [connection.a] : []);
    const nextNeighbors = new Set(after.flatMap((connection) => connection.a.instanceId === id ? [endKey(connection.b)] : connection.b.instanceId === id ? [endKey(connection.a)] : []));
    if (occupiedNeighbors.some((neighbor) => !nextNeighbors.has(endKey(neighbor)))) {
      return { document, result: { part: candidate, valid: false, ...plannerFailure({ code: "connectedRotation" }), snap: null, connections: after } };
    }
    return commitPlacement(document, candidate, { magnetic: false, autoOrient: false });
  } catch (error) {
    return { document, result: { part: copyPart(part), valid: false, ...plannerFailure(issueFromError(error, "rotationData")), snap: null, connections: deriveConnections(document.parts) } };
  }
}

export function validateDocument(input: unknown): PlannerDocument {
  if (!isRecord(input)) throw new PlannerError({ code: "document" });
  requireKeys(input, ["version", "inventory", "parts"], "documentFields");
  if (input.version !== 1) throw new PlannerError({ code: "documentVersion" });
  const inventory = checkedInventory(input.inventory);
  if (!Array.isArray(input.parts) || input.parts.length > MAX_PART_COUNT) throw new PlannerError({ code: "partLimit", limit: MAX_PART_COUNT });
  // Array.from visits holes too, so sparse arrays cannot bypass the schema guard.
  const parts = Array.from(input.parts, checkedPart);
  const inspection = inspectParts(parts, inventory);
  if (inspection.issue) throw new PlannerError(inspection.issue);
  return { version: 1, inventory, parts };
}
