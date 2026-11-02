/** Shared contract. Changes are coordinated by the primary orchestrator. */
export type Vec3 = readonly [number, number, number];

export type PartKind =
  | "tube"
  | "elbow"
  | "tee"
  | "corner3"
  | "corner4"
  | "cross"
  | "connector5"
  | "screw"
  | "wrench"
  | "anchor";

export type PartCategory = "structure" | "connector" | "accessory";

export interface ConnectionPort {
  id: string;
  positionMm: Vec3;
  direction: Vec3;
}

export interface PartDefinition {
  id: string;
  code: string;
  name: string;
  kind: PartKind;
  category: PartCategory;
  description: string;
  color: string;
  /** Human-readable observed retail color; hex values are a photographic approximation. */
  colorName: string;
  /** Centered bounding box: length = X extent, width = Z extent, height = Y extent. */
  dimensionsMm: { length: number; width: number; height: number };
  dimensionLabel: string;
  ports: readonly ConnectionPort[];
  accuracy: "estimated" | "verified";
  sourceNote: string;
}

export const MM_PER_SCENE_UNIT = 100;

export const CATEGORY_LABELS: Record<PartCategory, string> = {
  structure: "Tubes",
  connector: "Connectors",
  accessory: "Accessories",
};
