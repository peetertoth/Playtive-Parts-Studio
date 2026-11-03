import type { AssemblyAnalysis, AssemblyBounds, GenerationLimits, GenerationOptions } from "../domain/generator.ts";
import type { Vec3 } from "../domain/parts.ts";
import type { PlannerDocument, PlacedPart, PortEnd } from "../domain/planner.ts";
import { deriveConnections, getPartDefinition, rotateVector, validateDocument, worldPorts } from "./assembly-engine.ts";
import { analyzeAssemblySupport } from "./assembly-support.ts";

const LIMIT_TOLERANCE_MM = 1e-6;
const endKey = (end: PortEnd): string => JSON.stringify([end.instanceId, end.portId]);

/** Inspect physical catalog bounds and every real endpoint, without changing the assembly. */
export function analyzeAssembly(parts: readonly PlacedPart[]): AssemblyAnalysis {
  const min: [number, number, number] = parts.length ? [Infinity, Infinity, Infinity] : [0, 0, 0];
  const max: [number, number, number] = parts.length ? [-Infinity, -Infinity, -Infinity] : [0, 0, 0];
  let tubes = 0;
  let connectors = 0;
  for (const part of parts) {
    const definition = getPartDefinition(part.partId);
    const { length, height, width } = definition.dimensionsMm;
    // Each exact cube rotation is a signed axis permutation, so rotating the
    // half extents and taking absolute values gives the complete outer box.
    const half = rotateVector([length / 2, height / 2, width / 2], part.orientation).map(Math.abs);
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], part.positionMm[axis] - half[axis]);
      max[axis] = Math.max(max[axis], part.positionMm[axis] + half[axis]);
    }
    if (definition.kind === "tube") tubes++;
    else if (definition.category === "connector") connectors++;
  }
  const connections = deriveConnections(parts);
  const occupied = new Set(connections.flatMap(({ a, b }) => [endKey(a), endKey(b)]));
  const freePorts = parts.flatMap(worldPorts)
    .filter((port) => !occupied.has(endKey(port)))
    .map(({ instanceId, portId }) => ({ instanceId, portId }));

  const neighbors = new Map(parts.map((part) => [part.id, new Set<string>()]));
  for (const { a, b } of connections) {
    neighbors.get(a.instanceId)?.add(b.instanceId);
    neighbors.get(b.instanceId)?.add(a.instanceId);
  }
  const visited = new Set<string>();
  const pending = parts.length ? [parts[0].id] : [];
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index];
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of neighbors.get(id) ?? []) {
      if (!visited.has(neighbor)) pending.push(neighbor);
    }
  }
  return {
    bounds: { min, max, widthMm: max[0] - min[0], heightMm: max[1] - min[1], depthMm: max[2] - min[2] },
    freePorts,
    connected: parts.length > 0 && visited.size === parts.length,
    connections: connections.length,
    tubes,
    connectors,
  };
}

/** Check only supplied outer-dimension caps; option validation belongs to the caller. */
export function withinGenerationLimits(bounds: AssemblyBounds, limits: GenerationLimits): boolean {
  return (limits.widthMm === undefined || bounds.widthMm <= limits.widthMm + LIMIT_TOLERANCE_MM)
    && (limits.heightMm === undefined || bounds.heightMm <= limits.heightMm + LIMIT_TOLERANCE_MM)
    && (limits.depthMm === undefined || bounds.depthMm <= limits.depthMm + LIMIT_TOLERANCE_MM);
}

const samePosition = (a: Vec3, b: Vec3): boolean => a.every((value, axis) => value === b[axis]);

/** Independently audit a search result before it can replace the user's document. */
export function checkGeneratedDocument(base: PlannerDocument, candidate: PlannerDocument, options: GenerationOptions): boolean {
  try {
    if (options.allowFloating !== undefined && typeof options.allowFloating !== "boolean") return false;
    const original = validateDocument(base);
    const generated = validateDocument(candidate);
    if (Object.entries(original.inventory).some(([kind, count]) => generated.inventory[kind as keyof typeof original.inventory] !== count)) return false;
    if (options.mode === "continue") {
      const byId = new Map(generated.parts.map((part) => [part.id, part]));
      for (const part of original.parts) {
        const preserved = byId.get(part.id);
        if (!preserved || preserved.partId !== part.partId || preserved.orientation !== part.orientation
          || !samePosition(preserved.positionMm, part.positionMm)) return false;
      }
    } else if (options.mode !== "new") return false;
    const analysis = analyzeAssembly(generated.parts);
    return analysis.connected && analysis.freePorts.length === 0 && withinGenerationLimits(analysis.bounds, options.limits)
      && (options.allowFloating === true || analyzeAssemblySupport(generated.parts).supported);
  } catch {
    return false;
  }
}
