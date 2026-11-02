import type { Locale } from "./config";

const hu = {
  unavailable: "A 3D tervező nem érhető el",
  webglRequired: "A megjelenítéshez WebGL 2 támogatás szükséges. Az alkatrészlista és a mentett terv továbbra is elérhető.",
  retry: "Újrapróbálás",
  starting: "3D tervező indítása…",
  workspaceAria: "3D építési terület. Nyílbillentyűk: elhelyezés mozgatása; Enter: rögzítés; Escape: mégse.",
  rotationAria: (axis: string, sign: string) => `Forgatás a világ ${axis} tengelye körül: ${sign}90°`,
  rotationTitle: (label: string) => `${label} · világtengely · jobbkéz-szabály`,
  rotationPreview: (label: string) => `${label} · előnézet`,
};

const en: typeof hu = {
  unavailable: "The 3D planner is unavailable",
  webglRequired: "Viewing requires WebGL 2 support. The part list and saved plan remain available.",
  retry: "Try again",
  starting: "Starting the 3D planner…",
  workspaceAria: "3D assembly area. Arrow keys: move placement; Enter: place; Escape: cancel.",
  rotationAria: (axis: string, sign: string) => `Rotate around the world ${axis} axis: ${sign}90°`,
  rotationTitle: (label: string) => `${label} · world axis · right-hand rule`,
  rotationPreview: (label: string) => `${label} · preview`,
};

export const sceneMessages: Record<Locale, typeof hu> = { hu, en };
