import type { GenerationLimits, GenerationOptions, GenerationResult } from "../domain/generator.ts";
import type { Vec3 } from "../domain/parts.ts";
import type { Inventory, PlacedPart, PlannerDocument } from "../domain/planner.ts";
import {
  ORIENTATIONS, getPartDefinition, rotateVector, validateDocument, worldPorts,
} from "./assembly-engine.ts";
import { analyzeAssembly, checkGeneratedDocument, withinGenerationLimits } from "./assembly-analysis.ts";
import { analyzeAssemblySupport } from "./assembly-support.ts";

/*
 * A bounded, seeded search over unions of lattice cycles. A tube spans adjacent
 * hubs 400 mm apart: its 350 mm length plus two 75 mm sockets, less two 50 mm
 * insertions. Every graph edge becomes one tube; every graph vertex becomes a
 * connector whose complete set of sockets is exactly the incident edge set.
 * Adding cycles keeps new assemblies closed, rather than capping open sockets
 * with fictitious parts. This is a heuristic search, not an optimality proof.
 */
const PITCH = 400;
const HUB_RADIUS = 34;
const TOLERANCE = 0.5;
const STRUCTURAL = ["tube", "elbow", "tee", "corner3", "corner4", "cross", "connector5"] as const;
const CONNECTORS = STRUCTURAL.slice(1) as readonly ConnectorKind[];
type ConnectorKind = Exclude<(typeof STRUCTURAL)[number], "tube">;
type Point = readonly [number, number, number];
interface Edge { key: string; a: Point; b: Point; direction: number }
interface Vertex { point: Point; mask: number }
interface Graph { vertices: Map<string, Vertex>; edges: Map<string, Edge> }
interface Fixed { connectors: Map<string, PlacedPart>; masks: Map<string, number>; tubes: Map<string, PlacedPart>; origin: Vec3 }
interface Assessment { score: number; feasible: boolean; parts: number; deficit: number; components: number; unsupported: number }
interface Node { graph: Graph; assessment: Assessment; proposals?: Square[]; cursor: number; priority: number }
type Square = readonly [Point, number, number];
interface Fit { kind: ConnectorKind; orientation: number }

const DIRECTIONS: readonly Point[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const pointKey = (p: Point) => p.join(",");
const compareKeys = ([a]: readonly [string, unknown], [b]: readonly [string, unknown]) => a < b ? -1 : a > b ? 1 : 0;
const plus = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scaled = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const directionIndex = (p: Vec3) => DIRECTIONS.findIndex((d) => d.every((v, axis) => v === p[axis]));
const bitCount = (mask: number): number => { let count = 0; for (; mask; mask &= mask - 1) count++; return count; };
const emptyGraph = (): Graph => ({ vertices: new Map(), edges: new Map() });
const copyGraph = (g: Graph): Graph => ({ vertices: new Map(g.vertices), edges: new Map(g.edges) });

// All legal direction sets are catalog-derived, including handed spatial fits.
const FITS = new Map<number, Fit>();
for (const kind of CONNECTORS) {
  for (let orientation = 0; orientation < ORIENTATIONS.length; orientation++) {
    let mask = 0;
    for (const port of getPartDefinition(kind).ports) mask |= 1 << directionIndex(rotateVector(port.direction, orientation));
    if (!FITS.has(mask)) FITS.set(mask, { kind, orientation });
  }
}
const TUBE_ORIENTATIONS = DIRECTIONS.map((direction) => ORIENTATIONS.findIndex((_, orientation) =>
  rotateVector([0, 1, 0], orientation).every((v, axis) => v === direction[axis])));

function edgeAt(point: Point, direction: number): Edge {
  const end = plus(point, DIRECTIONS[direction]);
  const positive = direction % 2 === 0;
  const a = positive ? point : end;
  const b = positive ? end : point;
  return { key: `${pointKey(a)}:${Math.floor(direction / 2)}`, a, b, direction: direction & ~1 };
}

function addEdge(graph: Graph, point: Point, direction: number): void {
  const edge = edgeAt(point, direction);
  if (graph.edges.has(edge.key)) return;
  graph.edges.set(edge.key, edge);
  for (const [p, d] of [[edge.a, edge.direction], [edge.b, edge.direction ^ 1]] as const) {
    const key = pointKey(p);
    graph.vertices.set(key, { point: p, mask: (graph.vertices.get(key)?.mask ?? 0) | 1 << d });
  }
}

function addSquare(source: Graph, square: Square): Graph {
  const [p, d, e] = square;
  const graph = copyGraph(source);
  addEdge(graph, p, d);
  addEdge(graph, p, e);
  addEdge(graph, plus(p, DIRECTIONS[d]), e);
  addEdge(graph, plus(p, DIRECTIONS[e]), d);
  return graph;
}

function components(graph: Graph): number {
  const unseen = new Set(graph.vertices.keys());
  let count = 0;
  while (unseen.size) {
    count++;
    const start = unseen.values().next().value!;
    unseen.delete(start);
    const pending = [start];
    while (pending.length) {
      const current = graph.vertices.get(pending.pop()!)!;
      for (let d = 0; d < 6; d++) {
        if (!(current.mask & 1 << d)) continue;
        const key = pointKey(plus(current.point, DIRECTIONS[d]));
        if (unseen.delete(key)) pending.push(key);
      }
    }
  }
  return count;
}

function coordinateExtrema(graph: Graph): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { point } of graph.vertices.values()) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], point[axis]);
    max[axis] = Math.max(max[axis], point[axis]);
  }
  return { min, max };
}

/** Existing poses retain real geometry even when tolerant joins round to the lattice. */
function connectorBottom(key: string, { point, mask }: Vertex, fixed: Fixed, originY: number): number {
  const existing = fixed.connectors.get(key);
  if (existing) {
    const { length, height, width } = getPartDefinition(existing.partId).dimensionsMm;
    const halfHeight = Math.abs(rotateVector([length / 2, height / 2, width / 2], existing.orientation)[1]);
    return existing.positionMm[1] - halfHeight;
  }
  return originY + point[1] * PITCH - (mask & 1 << 3 ? 75 : HUB_RADIUS);
}

/** Guide the search using downward columns; emitted parts still pass the independent audit. */
function unsupportedVertices(graph: Graph, fixed: Fixed, continuing: boolean): number {
  const { min } = coordinateExtrema(graph);
  const originY = continuing ? fixed.origin[1] : HUB_RADIUS - min[1] * PITCH;
  const supported = new Set<string>();
  const vertices = [...graph.vertices].sort(([, a], [, b]) => a.point[1] - b.point[1]);
  for (const [key, vertex] of vertices) {
    const { point, mask } = vertex;
    const bottom = connectorBottom(key, vertex, fixed, originY);
    if (Math.abs(bottom) <= TOLERANCE || mask & 1 << 3 && supported.has(pointKey(plus(point, DIRECTIONS[3])))) supported.add(key);
  }
  return graph.vertices.size - supported.size;
}

function assess(graph: Graph, inventory: Inventory, fixed: Fixed, limits: GenerationLimits, continuing: boolean, allowFloating: boolean): Assessment | null {
  if (!graph.edges.size || graph.edges.size > inventory.tube || graph.edges.size * 2 > inventory.screw ||
    graph.edges.size + graph.vertices.size > 2000) return null;
  const { min, max } = coordinateExtrema(graph);
  const spans = max.map((v, axis) => (v - min[axis]) * PITCH + 2 * HUB_RADIUS);
  if (!withinGenerationLimits({ min: [0, 0, 0], max: spans as unknown as Vec3,
    widthMm: spans[0], heightMm: spans[1], depthMm: spans[2] }, limits)) return null;
  if (continuing && min[1] * PITCH + fixed.origin[1] < HUB_RADIUS - TOLERANCE &&
    [...graph.vertices].some(([key, vertex]) => connectorBottom(key, vertex, fixed, fixed.origin[1]) < -TOLERANCE)) return null;
  const counts = Object.fromEntries(CONNECTORS.map((kind) => [kind, 0])) as Record<ConnectorKind, number>;
  let incomplete = 0;
  for (const [key, vertex] of graph.vertices) {
    const fixedMask = fixed.masks.get(key);
    if (fixedMask !== undefined && vertex.mask !== fixedMask) return null;
    if (bitCount(vertex.mask) > 5) return null;
    const fit = FITS.get(vertex.mask);
    if (fit) counts[fit.kind]++;
    else {
      // An existing unfinished edge may acquire the perpendicular directions
      // needed for a real fitting. No degree-one or straight fitting is emitted.
      if (bitCount(vertex.mask) > 2) return null;
      incomplete++;
    }
  }
  let deficit = 0;
  for (const kind of CONNECTORS) {
    const excess = Math.max(0, counts[kind] - inventory[kind]);
    // A small temporary excess lets subsequent cycles turn elbows into tees,
    // tees into crosses, or spatial corners into higher-degree fittings.
    if (excess > 3) return null;
    deficit += excess;
  }
  if (graph.vertices.size > CONNECTORS.reduce((sum, kind) => sum + inventory[kind], 0)) return null;
  const connectedComponents = components(graph);
  const parts = graph.edges.size + graph.vertices.size;
  const unsupported = allowFloating ? 0 : unsupportedVertices(graph, fixed, continuing);
  return {
    score: parts - deficit * 10 - incomplete * 9 - (connectedComponents - 1) * 16 - unsupported * 8,
    feasible: deficit === 0 && incomplete === 0 && connectedComponents === 1,
    parts, deficit, components: connectedComponents, unsupported,
  };
}

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function squareProposals(graph: Graph, fixed: Fixed, random: () => number): Square[] {
  const result: Square[] = [];
  const seen = new Set<string>();
  for (const { point, mask } of graph.vertices.values()) {
    for (let d = 0; d < 6; d++) for (let e = d + 1; e < 6; e++) {
      if (Math.floor(d / 2) === Math.floor(e / 2)) continue;
      // Squares touching one existing vertex allow spatial branches as well as
      // the familiar extension along an already present edge.
      const corners = [point, plus(point, DIRECTIONS[d]), plus(point, DIRECTIONS[e]), plus(plus(point, DIRECTIONS[d]), DIRECTIONS[e])];
      const key = corners.map(pointKey).sort().join(";");
      if (seen.has(key)) continue;
      seen.add(key);
      const incident = [mask | 1 << d | 1 << e,
        (graph.vertices.get(pointKey(corners[1]))?.mask ?? 0) | 1 << (d ^ 1) | 1 << e,
        (graph.vertices.get(pointKey(corners[2]))?.mask ?? 0) | 1 << d | 1 << (e ^ 1),
        (graph.vertices.get(pointKey(corners[3]))?.mask ?? 0) | 1 << (d ^ 1) | 1 << (e ^ 1)];
      if (incident.some((next, index) => bitCount(next) > 5 ||
        (fixed.masks.has(pointKey(corners[index])) && fixed.masks.get(pointKey(corners[index])) !== next))) continue;
      if (corners.every((p, index) => graph.vertices.get(pointKey(p))?.mask === incident[index])) continue;
      result.push([point, d, e]);
    }
  }
  return shuffle(result, random);
}

function grid(x: number, y: number, z: number): Graph {
  const graph = emptyGraph();
  const sizes = [x, y, z];
  for (let a = 0; a <= x; a++) for (let b = 0; b <= y; b++) for (let c = 0; c <= z; c++) {
    const point: Point = [a, b, c];
    for (let axis = 0; axis < 3; axis++) if (point[axis] < sizes[axis]) addEdge(graph, point, axis * 2);
  }
  return graph;
}

/**
 * Give unfinished existing sockets a compact closed completion before growth.
 * Each fitting occurs somewhere in these small grid frames: an elbow on a
 * square, a T on two squares, and the spatial fittings on one or more cubes.
 * Matching the full world-direction mask makes this independent of catalog
 * socket order and covers every exact quarter-turn orientation.
 */
function* completionSeeds(required: Graph, fixed: Fixed): Generator<Graph> {
  const anchors = [...fixed.masks].sort(compareKeys).slice(0, 4);
  if (!anchors.length) return;
  const templates: Graph[] = [];
  for (let x = 0; x <= 2; x++) for (let y = 0; y <= 2; y++) for (let z = 0; z <= 2; z++) {
    if ([x, y, z].filter((v) => v > 0).length < 2 || x === 2 && y === 2 && z === 2) continue;
    templates.push(grid(x, y, z));
  }
  templates.sort((a, b) => a.edges.size + a.vertices.size - b.edges.size - b.vertices.size);
  for (const template of templates) {
    for (const [key, mask] of anchors) {
      const target = required.vertices.get(key)!.point;
      for (const vertex of template.vertices.values()) {
        if (vertex.mask !== mask) continue;
        const offset = minus(target, vertex.point);
        const graph = copyGraph(required);
        for (const edge of template.edges.values()) addEdge(graph, plus(edge.a, offset), edge.direction);
        yield graph;
      }
    }
  }
}

/** Anchor compact repair frames at the actual floor, not the lowest old piece. */
function* groundedCompletionSeeds(required: Graph, fixed: Fixed, inventory: Inventory): Generator<Graph> {
  const groundY = Math.round((HUB_RADIUS - fixed.origin[1]) / PITCH);
  if (Math.abs(fixed.origin[1] + groundY * PITCH - HUB_RADIUS) > TOLERANCE) return;
  const seeds = new Map<string, Graph>();
  for (const [key, mask] of [...fixed.masks].sort(compareKeys).slice(0, 4)) {
    const target = required.vertices.get(key)!.point;
    const targetHeight = target[1] - groundY;
    if (targetHeight < 0 || targetHeight > inventory.tube / 3 ||
      targetHeight > 0 && !(mask & 1 << 3)) continue;
    const height = targetHeight + (mask & 1 << 2 ? 1 : 0);
    for (let x = 0; x <= 2; x++) for (let z = 0; z <= 2; z++) {
      if ([x, height, z].filter((v) => v > 0).length < 2) continue;
      const template = grid(x, height, z);
      if (template.edges.size > inventory.tube) continue;
      for (const vertex of template.vertices.values()) {
        if (vertex.point[1] !== targetHeight || vertex.mask !== mask) continue;
        const graph = copyGraph(required);
        const offset = minus(target, vertex.point);
        for (const edge of template.edges.values()) addEdge(graph, plus(edge.a, offset), edge.direction);
        seeds.set([...graph.edges.keys()].sort().join(";"), graph);
      }
    }
  }
  yield* [...seeds.values()].sort((a, b) => a.edges.size + a.vertices.size - b.edges.size - b.vertices.size);
}

function fixedGraph(document: PlannerDocument): { graph: Graph; fixed: Fixed } | null {
  const graph = emptyGraph();
  const fixed: Fixed = { connectors: new Map(), masks: new Map(), tubes: new Map(), origin: [0, HUB_RADIUS, 0] };
  const hubs = document.parts.map((part) => {
    const ports = worldPorts(part);
    return part.partId === "tube"
      ? minus(ports[0].positionMm, scaled(ports[0].direction, -25))
      : minus(ports[0].positionMm, scaled(ports[0].direction, 75));
  });
  if (hubs.length) fixed.origin = hubs[0];
  const lattice = (position: Vec3): Point | null => {
    const raw = position.map((v, axis) => (v - fixed.origin[axis]) / PITCH);
    const rounded = raw.map(Math.round);
    return raw.every((v, axis) => Math.abs(v - rounded[axis]) * PITCH <= TOLERANCE + 1e-7) ? rounded as unknown as Point : null;
  };
  for (let index = 0; index < document.parts.length; index++) {
    const part = document.parts[index];
    const point = lattice(hubs[index]);
    if (!point) return null;
    if (part.partId === "tube") {
      const d = directionIndex(worldPorts(part)[1].direction);
      const edge = edgeAt(point, d);
      if (fixed.tubes.has(edge.key)) return null;
      fixed.tubes.set(edge.key, part);
      addEdge(graph, point, d);
    } else {
      const key = pointKey(point);
      if (fixed.connectors.has(key)) return null;
      const directions = worldPorts(part).map((port) => directionIndex(port.direction)).sort((a, b) => a - b);
      const mask = directions.reduce((value, d) => value | 1 << d, 0);
      fixed.connectors.set(key, part);
      fixed.masks.set(key, mask);
      for (const d of directions) addEdge(graph, point, d);
    }
  }
  return { graph, fixed };
}

function materialize(graph: Graph, fixed: Fixed, base: PlannerDocument, mode: GenerationOptions["mode"], seed: number): PlannerDocument {
  const continuing = mode === "continue" && base.parts.length > 0;
  const { min } = coordinateExtrema(graph);
  const origin: Vec3 = continuing ? fixed.origin : [-min[0] * PITCH, HUB_RADIUS - min[1] * PITCH, -min[2] * PITCH];
  const world = (point: Point): Vec3 => [origin[0] + point[0] * PITCH, origin[1] + point[1] * PITCH, origin[2] + point[2] * PITCH];
  const ids = new Set(base.parts.map((part) => part.id));
  const prefix = `generated-${(seed >>> 0).toString(36)}-`;
  let sequence = 0;
  const nextId = () => { let id: string; do id = `${prefix}${sequence++}`; while (ids.has(id)); ids.add(id); return id; };
  const copyPart = (part: PlacedPart): PlacedPart => ({ ...part, positionMm: [...part.positionMm] as unknown as Vec3 });
  const parts = continuing ? base.parts.map(copyPart) : [];
  for (const [key, vertex] of [...graph.vertices].sort(compareKeys)) {
    if (continuing && fixed.connectors.has(key)) continue;
    const fit = FITS.get(vertex.mask)!;
    const definition = getPartDefinition(fit.kind);
    const first = definition.ports[0];
    const localHub = minus(first.positionMm, scaled(first.direction, 75));
    parts.push({ id: nextId(), partId: fit.kind, orientation: fit.orientation,
      positionMm: minus(world(vertex.point), rotateVector(localHub, fit.orientation)) });
  }
  for (const [key, edge] of [...graph.edges].sort(compareKeys)) {
    if (continuing && fixed.tubes.has(key)) continue;
    const a = world(edge.a), b = world(edge.b);
    parts.push({ id: nextId(), partId: "tube", orientation: TUBE_ORIENTATIONS[edge.direction],
      positionMm: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
  }
  return { version: 1, inventory: { ...base.inventory }, parts };
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function validOptions(options: unknown): options is GenerationOptions {
  if (!plainRecord(options) || !["new", "continue"].includes(options.mode as string) ||
    !Number.isSafeInteger(options.seed) || !plainRecord(options.limits) ||
    Object.keys(options).some((key) => !["mode", "limits", "seed", "maxAttempts", "allowFloating"].includes(key))) return false;
  if (options.maxAttempts !== undefined && !Number.isSafeInteger(options.maxAttempts)) return false;
  if (options.allowFloating !== undefined && typeof options.allowFloating !== "boolean") return false;
  if (Object.keys(options.limits).some((key) => !["widthMm", "heightMm", "depthMm"].includes(key))) return false;
  return Object.values(options.limits).every((value) => value === undefined ||
    typeof value === "number" && Number.isFinite(value) && value > 0);
}

/** Pure, deterministic bounded search. Input documents and options are never modified. */
export function generateAssembly(document: PlannerDocument, options: GenerationOptions): GenerationResult {
  if (!validOptions(options)) return { status: "no-solution", reason: "invalid-options", attempts: 0 };
  let base: PlannerDocument;
  try { base = validateDocument(document); }
  catch { return { status: "no-solution", reason: "invalid-document", attempts: 0 }; }
  const budget = Math.max(1, Math.min(20_000, options.maxAttempts ?? 2000));
  const continuing = options.mode === "continue" && base.parts.length > 0;
  if (continuing) {
    const analysis = analyzeAssembly(base.parts);
    if (!withinGenerationLimits(analysis.bounds, options.limits)) return { status: "no-solution", reason: "outside-limits", attempts: 0 };
    if (analysis.freePorts.length === 0) return { status: "no-solution", reason: analysis.connected &&
      (options.allowFloating === true || analyzeAssemblySupport(base.parts).supported) ? "already-closed" : "no-closed-solution", attempts: 0 };
  }
  const reconstructed = continuing ? fixedGraph(base) : { graph: emptyGraph(), fixed: { connectors: new Map(), masks: new Map(), tubes: new Map(), origin: [0, HUB_RADIUS, 0] as Vec3 } };
  if (!reconstructed) return { status: "no-solution", reason: "no-closed-solution", attempts: 0 };
  const { fixed } = reconstructed;
  const random = randomSource(options.seed);
  const pool: Node[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  let best: PlannerDocument | undefined;
  let bestParts = 0;
  const consider = (graph: Graph): void => {
    if (attempts >= budget) return;
    attempts++;
    const assessment = assess(graph, base.inventory, fixed, options.limits, continuing, options.allowFloating === true);
    if (!assessment) return;
    const signature = [...graph.edges.keys()].sort().join(";");
    if (seen.has(signature)) return;
    seen.add(signature);
    if (assessment.feasible && assessment.unsupported === 0 && assessment.parts >= bestParts) {
      const candidate = materialize(graph, fixed, base, options.mode, options.seed);
      if (candidate.parts.length > (continuing ? base.parts.length : 0) && checkGeneratedDocument(base, candidate, options)) {
        if (assessment.parts > bestParts || random() < 0.35) { best = candidate; bestParts = assessment.parts; }
      }
    }
    // Unsupported intermediate states can gain lower columns on later cycles.
    pool.push({ graph, assessment, cursor: 0, priority: assessment.score + random() * 4 });
    // Retain several alternative branches: exact stock counts often require
    // changing a fitting twice before the new graph can become feasible again.
    if (pool.length > 72) {
      pool.sort((a, b) => b.priority - a.priority);
      pool.length = 56;
    }
  };
  if (continuing) {
    consider(reconstructed.graph);
    if (options.allowFloating !== true && attempts < budget) {
      for (const seed of groundedCompletionSeeds(reconstructed.graph, fixed, base.inventory)) {
        consider(seed);
        if (attempts >= budget) break;
      }
    }
    if (attempts < budget) {
      for (const seed of completionSeeds(reconstructed.graph, fixed)) {
        consider(seed);
        if (attempts >= budget) break;
      }
    }
  }
  else {
    const dimensions: Point[] = [];
    for (let x = 0; x <= 4; x++) for (let y = 0; y <= 4; y++) for (let z = 0; z <= 4; z++) {
      if ([x, y, z].filter((v) => v > 0).length >= 2) dimensions.push([x, y, z]);
    }
    shuffle(dimensions, random);
    // Useful compact templates precede large infeasible grids. Larger valid
    // boxes are still seeds, not a stopping condition: mixed cycles grow them.
    dimensions.sort((a, b) => Math.max(...a) - Math.max(...b));
    for (const [x, y, z] of dimensions) { if (attempts >= budget) break; consider(grid(x, y, z)); }
  }
  while (attempts < budget && pool.length) {
    pool.sort((a, b) => b.priority - a.priority);
    // Usually expand a strong branch, with occasional exploration of the rest.
    const band = random() < 0.8 ? Math.min(12, pool.length) : pool.length;
    const index = Math.floor(random() * band);
    const node = pool[index];
    node.proposals ??= squareProposals(node.graph, fixed, random);
    if (node.cursor >= node.proposals.length) { pool.splice(index, 1); continue; }
    const proposal = node.proposals[node.cursor++];
    consider(addSquare(node.graph, proposal));
  }
  if (!best) return { status: "no-solution", reason: "no-closed-solution", attempts };
  // The independent audit remains the final authority, even after the search
  // accepted a candidate. It checks the actual engine geometry and all ports.
  if (!checkGeneratedDocument(base, best, options)) return { status: "no-solution", reason: "no-closed-solution", attempts };
  const analysis = analyzeAssembly(best.parts);
  return { status: "success", document: best, stats: {
    attempts, usedParts: best.parts.length, addedParts: best.parts.length - (continuing ? base.parts.length : 0),
    remainingParts: STRUCTURAL.reduce((sum, kind) => sum + base.inventory[kind], 0) - best.parts.length,
    connections: analysis.connections, bounds: analysis.bounds,
  } };
}
