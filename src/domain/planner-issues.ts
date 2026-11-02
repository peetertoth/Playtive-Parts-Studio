import { PARTS } from "./catalog.ts";
import type { PartKind } from "./parts.ts";

/** Stable error codes keep assembly decisions independent of display language. */
export const EN_PLANNER_ERRORS = {
  orientation: "Orientation must be one of the 24 exact right-angle positions.",
  rotation: "Choose the X, Y or Z axis and a whole number of 90° turns.",
  unknownPart: "Unknown part identifier.",
  inventory: "Invalid inventory format.",
  inventoryFields: "The inventory must contain every known part exactly once.",
  inventoryCount: "{part}: stock must be a whole number between 0 and {limit}.",
  part: "Invalid placed-part format.",
  partFields: "Invalid saved part fields.",
  instanceId: "The unique part identifier is invalid or too long.",
  partType: "Invalid part type.",
  accessory: "Screws, the wrench and ground anchors are inventory accessories; they cannot be placed in the frame.",
  position: "Position must contain three finite coordinates, each within ±{limit} mm.",
  orientationFormat: "Invalid orientation format.",
  partLimit: "A plan can contain at most {limit} structural parts.",
  duplicateId: "Each placed part must have a unique identifier.",
  portConflict: "Only one part can occupy a connection port.",
  screwStock: "Not enough fixing screws: each connection needs one screw.",
  partStock: "Out of stock: {part}.",
  belowGround: "Parts cannot be placed below the ground.",
  collision: "The parts overlap. Move them to a clear space or fit the tube into a free socket.",
  targetMissing: "The selected connection port is no longer available.",
  targetOccupied: "The selected connection port is already occupied.",
  snapDistance: "Invalid snap distance.",
  targetOrientation: "This part cannot connect to the selected port in its current orientation.",
  workplane: "Invalid workplane height.",
  placement: "Invalid placement data.",
  selectedMissing: "The selected part is no longer in the plan.",
  connectedRotation: "This rotation would move an occupied connection. Move the part away to disconnect it first.",
  rotationData: "Invalid rotation data.",
  document: "Invalid plan format.",
  documentFields: "Invalid saved plan fields.",
  documentVersion: "The saved plan version is not supported.",
};

export type PlannerIssueCode = keyof typeof EN_PLANNER_ERRORS;
export interface PlannerIssue {
  code: PlannerIssueCode;
  partKind?: PartKind;
  limit?: number;
}

export function englishIssueMessage(issue: PlannerIssue): string {
  const part = PARTS.find((definition) => definition.kind === issue.partKind)?.name ?? "";
  return EN_PLANNER_ERRORS[issue.code].replace("{part}", part).replace("{limit}", String(issue.limit ?? ""));
}

export class PlannerError extends Error {
  readonly issue: PlannerIssue;
  constructor(issue: PlannerIssue) {
    super(englishIssueMessage(issue));
    this.name = "PlannerError";
    this.issue = issue;
  }
}

export function plannerFailure(issue: PlannerIssue): { reason: string; issue: PlannerIssue } {
  return { reason: englishIssueMessage(issue), issue };
}

export function issueFromError(error: unknown, fallback: PlannerIssueCode): PlannerIssue {
  return error instanceof PlannerError ? error.issue : { code: fallback };
}
