import type { Axis } from "./planner";

/** Shared by the world-axis gizmo and the existing rotation controls. */
export const ROTATION_AXES = {
  x: { label: "X", color: "#c54646" },
  y: { label: "Y", color: "#248251" },
  z: { label: "Z", color: "#356fc4" },
} as const satisfies Record<Axis, { label: string; color: string }>;
