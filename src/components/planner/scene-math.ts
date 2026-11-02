import { Box3, Matrix4, Quaternion, Vector3, type Camera } from "three";
import { MM_PER_SCENE_UNIT, type Vec3 } from "@/domain/parts";
import type { PlacedPart, WorldPort } from "@/domain/planner";
import { deriveConnections, getPartDefinition, ORIENTATIONS, rotateVector, worldPorts } from "@/lib/assembly-engine";

const PORT_TARGET_RADIUS_PX = 24;

/** The saved integer orientation is the sole source of rendered rotation. */
const QUATERNIONS = ORIENTATIONS.map((m) => new Quaternion().setFromRotationMatrix(new Matrix4().set(
  m[0], m[1], m[2], 0,
  m[3], m[4], m[5], 0,
  m[6], m[7], m[8], 0,
  0, 0, 0, 1,
)));

export function orientationQuaternion(orientation: number) {
  return QUATERNIONS[orientation] ?? QUATERNIONS[0];
}

export function scenePosition(positionMm: Vec3): [number, number, number] {
  return [positionMm[0] / MM_PER_SCENE_UNIT, positionMm[1] / MM_PER_SCENE_UNIT, positionMm[2] / MM_PER_SCENE_UNIT];
}

/** Occupancy belongs to individual endpoints; moving a part releases only its own joins. */
export function availableConnectionPorts(parts: readonly PlacedPart[], movingId?: string): WorldPort[] {
  const stationary = parts.filter((part) => part.id !== movingId);
  const occupied = new Set(deriveConnections(stationary).flatMap(({ a, b }) => [`${a.instanceId}:${a.portId}`, `${b.instanceId}:${b.portId}`]));
  return stationary.flatMap(worldPorts).filter((port) => !occupied.has(`${port.instanceId}:${port.portId}`));
}

/** Resolve the port the cursor points at before projecting onto a placement plane. */
export function pointerPortTarget(
  ports: readonly WorldPort[], partId: string, camera: Camera,
  point: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number },
): WorldPort | null {
  if (!rect.width || !rect.height) return null;
  const sourceIsTube = getPartDefinition(partId).kind === "tube";
  const projected = new Vector3();
  let nearest: WorldPort | null = null;
  let nearestDistance = PORT_TARGET_RADIUS_PX;
  let nearestDepth = Infinity;
  for (const port of ports) {
    if (sourceIsTube === (port.kind === "tube")) continue;
    projected.set(...scenePosition(port.positionMm)).project(camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const x = rect.left + (projected.x + 1) * rect.width / 2;
    const y = rect.top + (1 - projected.y) * rect.height / 2;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance > nearestDistance + 1e-6) continue;
    if (Math.abs(distance - nearestDistance) <= 1e-6 && projected.z >= nearestDepth) continue;
    nearest = port;
    nearestDistance = distance;
    nearestDepth = projected.z;
  }
  return nearest;
}

/** Geometry bounds, excluding the floor, port markers and preview. */
export function assemblyFrame(parts: readonly PlacedPart[]) {
  const bounds = new Box3();
  for (const part of parts) {
    const { length, height, width } = getPartDefinition(part.partId).dimensionsMm;
    for (const x of [-length / 2, length / 2]) for (const y of [-height / 2, height / 2]) for (const z of [-width / 2, width / 2]) {
      const rotated = rotateVector([x, y, z], part.orientation);
      bounds.expandByPoint(new Vector3(
        (part.positionMm[0] + rotated[0]) / MM_PER_SCENE_UNIT,
        (part.positionMm[1] + rotated[1]) / MM_PER_SCENE_UNIT,
        (part.positionMm[2] + rotated[2]) / MM_PER_SCENE_UNIT,
      ));
    }
  }
  if (bounds.isEmpty()) return { center: new Vector3(0, 1.5, 0), radius: 7, gridSize: 50 };
  const size = bounds.getSize(new Vector3());
  return {
    center: bounds.getCenter(new Vector3()),
    radius: Math.max(1.5, size.length() / 2),
    gridSize: Math.min(1000, Math.max(50, Math.max(size.x, size.z) + 20)),
  };
}
