import type { PartDefinition, PartKind, Vec3 } from "./parts";

const REFERENCE_NOTE =
  "Shape and dimensions are estimated from page 2 of the IAN 369527 manual; equivalence with the parts of model 383000 is unverified.";
const PHOTO_COLOR_NOTE =
  " Color family observed in the retailer photograph linked from the 383000 idealo page; the digital shade is approximate.";

/** Photo-observed color families, not manufacturer color codes. See docs/model-reference.md. */
const PART_COLORS = {
  tube: { color: "#2b60b7", colorName: "Blue" },
  elbow: { color: "#cf3540", colorName: "Red" },
  tee: { color: "#cf3540", colorName: "Red" },
  corner3: { color: "#edc53c", colorName: "Yellow" },
  corner4: { color: "#8bc22d", colorName: "Green" },
  cross: { color: "#8bc22d", colorName: "Green" },
  connector5: { color: "#8bc22d", colorName: "Green" },
  screw: { color: "#292c2e", colorName: "Black" },
  wrench: { color: "#292c2e", colorName: "Black" },
  anchor: { color: "#a8b3bc", colorName: "Grey · unverified" },
} satisfies Record<PartKind, Pick<PartDefinition, "color" | "colorName">>;

/** Socket ends are 75 mm from the joint; the 60 mm sleeve has a molded central hub. */
const SOCKET_REACH_MM = 75;
const HUB_RADIUS_MM = 34;

type ConnectorKind = Extract<
  PartKind,
  "elbow" | "tee" | "corner3" | "corner4" | "cross" | "connector5"
>;

function connector(
  kind: ConnectorKind,
  code: string,
  name: string,
  description: string,
  directions: readonly Vec3[],
): PartDefinition {
  const low = [0, 1, 2].map((axis) =>
    Math.min(-HUB_RADIUS_MM, ...directions.map((d) => d[axis] * SOCKET_REACH_MM)),
  );
  const high = [0, 1, 2].map((axis) =>
    Math.max(HUB_RADIUS_MM, ...directions.map((d) => d[axis] * SOCKET_REACH_MM)),
  );
  const center = low.map((value, axis) => (value + high[axis]) / 2);
  const extent = high.map((value, axis) => Math.round(value - low[axis]));

  return {
    id: kind,
    code,
    name,
    kind,
    category: "connector",
    description,
    ...PART_COLORS[kind],
    dimensionsMm: { length: extent[0], width: extent[2], height: extent[1] },
    dimensionLabel: `Approx. ${extent[0]} × ${extent[1]} × ${extent[2]} mm · outer Ø 60 mm`,
    ports: directions.map((direction, index) => ({
      id: `socket-${index + 1}`,
      positionMm: [
        direction[0] * SOCKET_REACH_MM - center[0],
        direction[1] * SOCKET_REACH_MM - center[1],
        direction[2] * SOCKET_REACH_MM - center[2],
      ] as Vec3,
      direction,
    })),
    accuracy: "estimated",
    sourceNote: REFERENCE_NOTE + PHOTO_COLOR_NOTE,
  };
}

/** One example per reference part kind; codes are local catalog identifiers, not maker codes. */
export const PARTS: readonly PartDefinition[] = [
  {
    id: "tube",
    code: "CS-01",
    name: "Straight tube",
    kind: "tube",
    category: "structure",
    description:
      "Hollow cylindrical structural member with two open ends and fixing holes near each end.",
    ...PART_COLORS.tube,
    dimensionsMm: { length: 50, width: 50, height: 350 },
    dimensionLabel: "Approx. 350 mm long · outer Ø 50 mm",
    ports: [
      { id: "end-bottom", positionMm: [0, -175, 0], direction: [0, -1, 0] },
      { id: "end-top", positionMm: [0, 175, 0], direction: [0, 1, 0] },
    ],
    accuracy: "estimated",
    sourceNote: REFERENCE_NOTE + PHOTO_COLOR_NOTE,
  },
  connector(
    "elbow", "CS-02", "Elbow connector",
    "Open-socket corner fitting joining two perpendicular tubes.",
    [[1, 0, 0], [0, 1, 0]],
  ),
  connector(
    "tee", "CS-03", "T connector",
    "Three coplanar sockets with a perpendicular branch off a through connection.",
    [[-1, 0, 0], [1, 0, 0], [0, 1, 0]],
  ),
  connector(
    "corner3", "CS-04", "3-way corner connector",
    "Three mutually perpendicular sockets forming a spatial corner.",
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  ),
  connector(
    "corner4", "CS-05", "4-way corner connector",
    "One through connection and two perpendicular branches in different planes.",
    [[-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
  ),
  connector(
    "cross", "CS-06", "Cross connector",
    "Four coplanar open sockets forming two perpendicular through connections.",
    [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]],
  ),
  connector(
    "connector5", "CS-07", "5-way connector",
    "Four coplanar sockets and a fifth branch perpendicular to their plane.",
    [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0]],
  ),
  {
    id: "screw",
    code: "KI-01",
    name: "Fixing screw",
    kind: "screw",
    category: "accessory",
    description:
      "Short fastener with a wide recessed-drive head. Thread and head details are illustrative approximations.",
    ...PART_COLORS.screw,
    dimensionsMm: { length: 28, width: 28, height: 32 },
    dimensionLabel: "Approx. 32 mm long · head Ø 28 mm",
    ports: [],
    accuracy: "estimated",
    sourceNote: REFERENCE_NOTE + PHOTO_COLOR_NOTE,
  },
  {
    id: "wrench",
    code: "KI-02",
    name: "Assembly wrench",
    kind: "wrench",
    category: "accessory",
    description:
      "Lightweight assembly tool with an elongated handle, side arm and upper drive end.",
    ...PART_COLORS.wrench,
    dimensionsMm: { length: 78, width: 13, height: 170 },
    dimensionLabel: "Approx. 170 × 78 × 13 mm",
    ports: [],
    accuracy: "estimated",
    sourceNote: REFERENCE_NOTE + PHOTO_COLOR_NOTE,
  },
  {
    id: "anchor",
    code: "KI-03",
    name: "Ground anchor",
    kind: "anchor",
    category: "accessory",
    description:
      "Bent U-shaped fixing rod with one longer and one shorter tapered leg.",
    ...PART_COLORS.anchor,
    dimensionsMm: { length: 60, width: 8, height: 258 },
    dimensionLabel: "Approx. 258 × 60 mm · rod Ø 8 mm",
    ports: [],
    accuracy: "estimated",
    sourceNote:
      REFERENCE_NOTE +
      " Color is unverified; the anchor cannot be identified in the inspected product photographs. Grey is an illustrative choice.",
  },
];
