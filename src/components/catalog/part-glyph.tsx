import type { PartKind } from "@/domain/parts";

/** Diagrammatic library icons; the interactive viewport contains the 3D geometry. */
export function PartGlyph({ kind, color }: { kind: PartKind; color: string }) {
  const dark = `color-mix(in srgb, ${color}, black 35%)`;
  const recess = `color-mix(in srgb, ${color}, black 60%)`;
  const light = `color-mix(in srgb, ${color}, white 28%)`;
  const highlight = `color-mix(in srgb, ${color}, white 50%)`;
  const branches: Record<string, readonly (readonly [number, number])[]> = {
    elbow: [[53, 16], [18, 53]],
    tee: [[53, 16], [18, 53], [68, 53]],
    corner3: [[43, 9], [16, 49], [69, 49]],
    corner4: [[43, 9], [16, 49], [69, 49], [43, 66]],
    cross: [[18, 19], [68, 19], [18, 55], [68, 55]],
    connector5: [[43, 8], [16, 24], [70, 24], [17, 56], [69, 56]],
  };
  return (
    <svg viewBox="0 0 86 74" fill="none" aria-hidden="true" className="part-glyph">
      <ellipse cx="43" cy="62" rx="24" ry="4" fill="#17222c" opacity=".08" />
      {kind === "tube" ? (
        <g transform="rotate(-35 43 37)">
          <path d="M12 31H72V43H12Z" fill={color} />
          <path d="M12 31H72V35H12Z" fill={highlight} />
          <ellipse cx="12" cy="37" rx="4" ry="6" fill={dark} />
          <ellipse cx="72" cy="37" rx="4" ry="6" fill={light} />
          <ellipse cx="72" cy="37" rx="2.3" ry="4" fill={recess} />
        </g>
      ) : kind === "screw" ? (
        <g transform="rotate(36 43 37)">
          <path d="M39 23H47V59L43 64L39 59Z" fill={color} />
          <path d="M38 29L48 33M38 35L48 39M38 41L48 45M38 47L48 51M38 53L48 57" stroke={highlight} strokeWidth="2" />
          <rect x="32" y="16" width="22" height="12" rx="4" fill={light} />
          <path d="M39 19H47V24H39Z" fill={recess} />
        </g>
      ) : kind === "wrench" ? (
        <g transform="rotate(36 43 37)">
          <path d="M34 12L34 25L40 31V61H47V31L54 25V12L48 18H40Z" fill={color} />
          <path d="M40 34V59" stroke={highlight} strokeWidth="2" />
        </g>
      ) : kind === "anchor" ? (
        <g transform="rotate(28 43 37)">
          <path d="M27 16H51Q60 16 60 25Q60 32 48 32H43V61L37 66V26H50V23H27Z" fill={color} />
          <path d="M39 31V58M29 18H49" stroke={highlight} strokeWidth="2" />
        </g>
      ) : (
        <g>
          {(branches[kind] ?? branches.corner3).map(([x, y], index) => (
            <g key={index}>
              <path d={`M43 37L${x} ${y}`} stroke={dark} strokeWidth="17" strokeLinecap="round" />
              <path d={`M42 35L${x - 1} ${y - 2}`} stroke={color} strokeWidth="12" strokeLinecap="round" />
              <path d={`M40 33L${x - 2} ${y - 3}`} stroke={highlight} strokeWidth="3" strokeLinecap="round" opacity=".65" />
              <circle cx={x} cy={y} r="7" fill={light} />
              <circle cx={x} cy={y} r="4.7" fill={dark} />
              <circle cx={x} cy={y} r="3" fill={recess} />
            </g>
          ))}
          <circle cx="43" cy="37" r="9" fill={color} />
          <circle cx="41" cy="34" r="3" fill={light} opacity=".7" />
        </g>
      )}
    </svg>
  );
}
