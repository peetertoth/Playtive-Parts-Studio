import type { AssemblySupportAnalysis } from "../domain/generator.ts";
import type { PlacedPart, PortEnd } from "../domain/planner.ts";
import { deriveConnections, getPartDefinition, rotateVector, worldPorts } from "./assembly-engine.ts";

const GROUND_TOLERANCE_MM = 0.5;
const endKey = (end: PortEnd): string => JSON.stringify([end.instanceId, end.portId]);

interface TubeSupport {
  id: string;
  vertical: boolean;
  lower?: string;
  upper?: string;
  ends: (string | undefined)[];
}

/**
 * Conservative geometry check: each elevated connector needs its own continuous
 * vertical column to y=0. Horizontal members never transfer connector support.
 * This does not estimate strength, stability, load capacity, or deflection.
 */
export function analyzeAssemblySupport(parts: readonly PlacedPart[]): AssemblySupportAnalysis {
  const supported = new Set<string>();
  const connectors = new Set<string>();
  for (const part of parts) {
    const definition = getPartDefinition(part.partId);
    if (definition.category !== "connector") continue;
    connectors.add(part.id);
    const { length, height, width } = definition.dimensionsMm;
    const halfHeight = Math.abs(rotateVector([length / 2, height / 2, width / 2], part.orientation)[1]);
    if (Math.abs(part.positionMm[1] - halfHeight) <= GROUND_TOLERANCE_MM) supported.add(part.id);
  }

  // deriveConnections is the same real insertion-depth/endpoint audit used by
  // the planner. Proximity, touching bodies, and neighboring hubs are not joins.
  const connectorAtEnd = new Map<string, string>();
  for (const { a, b } of deriveConnections(parts)) {
    if (connectors.has(a.instanceId)) connectorAtEnd.set(endKey(b), a.instanceId);
    else if (connectors.has(b.instanceId)) connectorAtEnd.set(endKey(a), b.instanceId);
  }

  const tubes: TubeSupport[] = [];
  const columnsAbove = new Map<string, TubeSupport[]>();
  for (const part of parts) {
    if (getPartDefinition(part.partId).kind !== "tube") continue;
    const ports = worldPorts(part);
    const lowerPort = ports.find((port) => port.direction[1] === -1);
    const upperPort = ports.find((port) => port.direction[1] === 1);
    const tube: TubeSupport = {
      id: part.id,
      vertical: lowerPort !== undefined && upperPort !== undefined,
      lower: lowerPort && connectorAtEnd.get(endKey(lowerPort)),
      upper: upperPort && connectorAtEnd.get(endKey(upperPort)),
      ends: ports.map((port) => connectorAtEnd.get(endKey(port))),
    };
    tubes.push(tube);
    if (tube.vertical && tube.lower !== undefined) {
      const above = columnsAbove.get(tube.lower) ?? [];
      above.push(tube);
      columnsAbove.set(tube.lower, above);
    }
  }

  // Only upward edges from an actually grounded connector can propagate. This
  // also handles arbitrarily many stacked levels without self-supporting loops.
  const pending = [...supported];
  for (let index = 0; index < pending.length; index++) {
    for (const tube of columnsAbove.get(pending[index]) ?? []) {
      supported.add(tube.id);
      if (tube.upper !== undefined && !supported.has(tube.upper)) {
        supported.add(tube.upper);
        pending.push(tube.upper);
      }
    }
  }
  for (const tube of tubes) {
    if (!tube.vertical && tube.ends.length === 2 && tube.ends.every((id) => id !== undefined && supported.has(id))) {
      supported.add(tube.id);
    }
  }

  const unsupportedPartIds = parts.filter((part) => !supported.has(part.id)).map((part) => part.id).sort();
  return { supported: unsupportedPartIds.length === 0, unsupportedPartIds };
}
