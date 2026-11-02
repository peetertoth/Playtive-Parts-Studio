import type { PartKind, Vec3 } from "./parts";
import type { PlannerIssue } from "./planner-issues";

/** Shared planner contract, owned by the orchestrator. All positions are millimeters. */
export type Axis = "x" | "y" | "z";
export type Inventory = Record<PartKind, number>;

export interface PlacedPart {
  id: string;
  partId: string;
  positionMm: Vec3;
  /** Index into the engine's 24 exact, axis-aligned cube orientations. */
  orientation: number;
}

export interface PlannerDocument {
  version: 1;
  inventory: Inventory;
  parts: PlacedPart[];
}

export interface WorldPort {
  instanceId: string;
  portId: string;
  positionMm: Vec3;
  direction: Vec3;
  kind: PartKind;
}

export interface PortEnd { instanceId: string; portId: string }
export interface AssemblyConnection { a: PortEnd; b: PortEnd }

export interface SnapInfo {
  source: PortEnd;
  target: PortEnd;
  distanceMm: number;
}

export interface PlacementOptions {
  magnetic?: boolean;
  autoOrient?: boolean;
  maxSnapDistanceMm?: number;
  /** Raw horizontal workplane height, before grounding a draft's current orientation. */
  placementHeightMm?: number;
  /** An explicitly pointer-targeted free port. Solved exactly, independent of workplane distance. */
  snapTarget?: PortEnd;
}

export interface PlacementResult {
  part: PlacedPart;
  valid: boolean;
  reason?: string;
  /** Locale-neutral validation details; reason remains an English developer fallback. */
  issue?: PlannerIssue;
  snap: SnapInfo | null;
  connections: AssemblyConnection[];
}

export interface PlacementCommit {
  document: PlannerDocument;
  result: PlacementResult;
}

export interface PlannerDraft {
  partId: string;
  orientation: number;
  movingId?: string;
  /** Enables pointer dragging from a palette outside the Canvas, including touch. */
  dragOrigin?: { x: number; y: number };
}

export interface PlannerSceneProps {
  document: PlannerDocument;
  selectedId: string | null;
  draft: PlannerDraft | null;
  placementHeightMm: number;
  showPorts: boolean;
  frameRequest: number;
  view: "isometric" | "top" | "front";
  viewRequest: number;
  onSelect: (id: string | null) => void;
  onMoveStart: (id: string) => void;
  /** The same exact-quarter-turn action used by the existing sidebar controls. */
  onRotate: (axis: Axis, quarterTurns: number) => void;
  onPreview: (result: PlacementResult | null) => void;
  onCommit: (part: PlacedPart) => void;
  onCancel: () => void;
}

export const PLANNER_STORAGE_KEY = "playtive-planner-v1";
