import type { Vec3 } from "./parts";
import type { PlannerDocument, PlacedPart, PortEnd } from "./planner";

/** Maximum outer model dimensions in millimeters, including connector bodies. */
export interface GenerationLimits { widthMm?: number; heightMm?: number; depthMm?: number }
export interface GenerationOptions {
  mode: "new" | "continue";
  limits: GenerationLimits;
  seed: number;
  /** Permit geometric overhangs/unsupported members; omitted means false. */
  allowFloating?: boolean;
  /** Bounded search effort; default 2000, clamped to 1..20000. */
  maxAttempts?: number;
}
export interface AssemblyBounds {
  min: Vec3;
  max: Vec3;
  widthMm: number;
  heightMm: number;
  depthMm: number;
}
export interface AssemblyAnalysis {
  bounds: AssemblyBounds;
  freePorts: PortEnd[];
  connected: boolean;
  connections: number;
  tubes: number;
  connectors: number;
}
/** Conservative per-connector vertical load-path check, not a structural simulation. */
export interface AssemblySupportAnalysis {
  supported: boolean;
  unsupportedPartIds: string[];
}
export type GenerationFailure = "invalid-options" | "invalid-document" | "outside-limits" | "no-closed-solution" | "already-closed";
export interface GenerationStats {
  attempts: number;
  usedParts: number;
  addedParts: number;
  remainingParts: number;
  connections: number;
  bounds: AssemblyBounds;
}
export type GenerationResult =
  | { status: "success"; document: PlannerDocument; stats: GenerationStats }
  | { status: "no-solution"; reason: GenerationFailure; attempts: number };

export type GeneratorRequest = { type: "generate"; document: PlannerDocument; options: GenerationOptions };
export type GeneratorResponse = { type: "result"; result: GenerationResult } | { type: "error" };

/** Pure geometry/port audit implemented independently from the search algorithm. */
export type AnalyzeAssembly = (parts: readonly PlacedPart[]) => AssemblyAnalysis;
