import { MM_PER_SCENE_UNIT, type Vec3 } from "@/domain/parts";
import type { Axis, PlacedPart } from "@/domain/planner";
import { getPartDefinition, rotateVector } from "@/lib/assembly-engine";

// Each plane basis satisfies u × v = its positive WORLD axis.
export const ROTATION_PLANES: Record<Axis, { u: Vec3; v: Vec3; normal: Vec3 }> = {
  x: { u: [0, 1, 0], v: [0, 0, 1], normal: [1, 0, 0] },
  y: { u: [0, 0, 1], v: [1, 0, 0], normal: [0, 1, 0] },
  z: { u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
};

export function rotationArc(axis: Axis, quarterTurns: 1 | -1) {
  const { u, v } = ROTATION_PLANES[axis];
  // Opposite Y phase spreads labels in the default isometric, front and top views.
  const startAngle = axis === "y" ? Math.PI / 4 : -Math.PI / 4;
  const point = (angle: number): Vec3 => [0, 1, 2].map((i) => u[i] * Math.cos(angle) + v[i] * Math.sin(angle)) as unknown as Vec3;
  const endAngle = startAngle + quarterTurns * Math.PI / 2;
  const tip = point(endAngle);
  const tangent = [0, 1, 2].map((i) => quarterTurns * (-u[i] * Math.sin(endAngle) + v[i] * Math.cos(endAngle))) as unknown as Vec3;
  return { points: Array.from({ length: 33 }, (_, i) => point(startAngle + quarterTurns * Math.PI / 2 * i / 32)), tip, tangent };
}

/** Match rotatePlacedPart: connector hub, or the tube's geometric center. */
export function rotationGizmoFrame(part: PlacedPart) {
  const definition = getPartDefinition(part.partId);
  const first = definition.ports[0];
  const localPivot: Vec3 = definition.kind === "tube" || !first ? [0, 0, 0] : [
    first.positionMm[0] - 75 * first.direction[0],
    first.positionMm[1] - 75 * first.direction[1],
    first.positionMm[2] - 75 * first.direction[2],
  ];
  const rotated = rotateVector(localPivot, part.orientation);
  const pivotMm: Vec3 = [part.positionMm[0] + rotated[0], part.positionMm[1] + rotated[1], part.positionMm[2] + rotated[2]];
  const { length, height, width } = definition.dimensionsMm;
  let radiusMm = 0;
  for (const x of [-length / 2, length / 2]) for (const y of [-height / 2, height / 2]) for (const z of [-width / 2, width / 2]) {
    radiusMm = Math.max(radiusMm, Math.hypot(x - localPivot[0], y - localPivot[1], z - localPivot[2]));
  }
  return { pivotMm, radius: (radiusMm + 30) / MM_PER_SCENE_UNIT };
}

/** Keep a ring readable while framing an entire assembly; Html labels remain CSS-sized. */
export function perspectiveGizmoRadius(geometryRadius: number, distance: number, fov: number, heightPx: number, zoom = 1) {
  const unitsPerPixel = 2 * distance * Math.tan(fov * Math.PI / 360) / (Math.max(1, heightPx) * zoom);
  return Math.max(geometryRadius, unitsPerPixel * 104);
}

export function clampRotationControlPosition(x: number, y: number, width: number, height: number): [number, number] {
  const marginX = Math.min(32, width / 2);
  const marginY = Math.min(28, height / 2);
  return [Math.min(width - marginX, Math.max(marginX, x)), Math.min(height - marginY, Math.max(marginY, y))];
}

/** Global capture listeners run before React's native-button handlers. */
export function isRotationControlEvent(event: { target: EventTarget | null; composedPath?: () => EventTarget[] }) {
  const path = event.composedPath?.() ?? [];
  return [event.target, ...path].some((target) => {
    const element = target as { closest?: (selector: string) => unknown } | null;
    return typeof element?.closest === "function" && Boolean(element.closest("[data-rotation-control]"));
  });
}
