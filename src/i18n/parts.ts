import type { PartCategory, PartDefinition, PartKind } from "../domain/parts.ts";
import type { Locale } from "./config.ts";

type PartText = Pick<PartDefinition, "name" | "description" | "colorName" | "dimensionLabel" | "sourceNote">;

/** Display translations only; geometry, IDs and saved documents are locale-independent. */
export const hungarianParts: Record<PartKind, PartText> = {
  "tube": {
    "name": "Egyenes cső",
    "description": "Üreges, hengeres tartóelem két nyitott véggel és a végek közelében kialakított rögzítőfuratokkal.",
    "colorName": "Kék",
    "dimensionLabel": "Kb. 350 mm hossz · külső Ø 50 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "elbow": {
    "name": "Könyökcsatlakozó",
    "description": "Két egymásra merőleges csövet összekötő, nyitott hüvelyes sarokelem.",
    "colorName": "Piros",
    "dimensionLabel": "Kb. 109 × 109 × 68 mm · külső Ø 60 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "tee": {
    "name": "T-csatlakozó",
    "description": "Egy síkban elhelyezkedő három csatlakozónyílás; egy átmenő irányhoz merőleges ág kapcsolódik.",
    "colorName": "Piros",
    "dimensionLabel": "Kb. 150 × 109 × 68 mm · külső Ø 60 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "corner3": {
    "name": "Térbeli háromágú csatlakozó",
    "description": "Három egymásra merőleges hüvely egy térbeli sarok kialakításához.",
    "colorName": "Sárga",
    "dimensionLabel": "Kb. 109 × 109 × 109 mm · külső Ø 60 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "corner4": {
    "name": "Térbeli négyágú csatlakozó",
    "description": "Egy átmenő csatlakozási irány és két, eltérő síkba mutató merőleges ág.",
    "colorName": "Zöld",
    "dimensionLabel": "Kb. 150 × 109 × 109 mm · külső Ø 60 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "cross": {
    "name": "Keresztcsatlakozó",
    "description": "Négy, egy síkban elhelyezkedő nyitott hüvely két egymásra merőleges átmenő iránnyal.",
    "colorName": "Zöld",
    "dimensionLabel": "Kb. 150 × 68 × 150 mm · külső Ø 60 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "connector5": {
    "name": "Ötágú csatlakozó",
    "description": "Négy, egy síkban álló hüvely és egy rájuk merőleges ötödik ág.",
    "colorName": "Zöld",
    "dimensionLabel": "Kb. 150 × 109 × 150 mm · külső Ø 60 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "screw": {
    "name": "Rögzítőcsavar",
    "description": "Rövid rögzítőelem széles, süllyesztett szerszámfészkes fejjel. A menet és a fej részletei szemléltető közelítések.",
    "colorName": "Fekete",
    "dimensionLabel": "Kb. 32 mm hossz · fej Ø 28 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "wrench": {
    "name": "Szerelőkulcs",
    "description": "Könnyített, hosszúkás fogantyújú szerelőszerszám oldalsó karral és felső befogóvéggel.",
    "colorName": "Fekete",
    "dimensionLabel": "Kb. 170 × 78 × 13 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: a 383000 idealo-oldaláról hivatkozott kereskedő termékfotóján megfigyelt színcsalád; a digitális árnyalat közelítés."
  },
  "anchor": {
    "name": "Talajrögzítő horgony",
    "description": "Hajlított, U alakú rögzítőrúd egy hosszabb és egy rövidebb, elkeskenyedő szárral.",
    "colorName": "Szürke · nem igazolt",
    "dimensionLabel": "Kb. 258 × 60 mm · rúd Ø 8 mm",
    "sourceNote": "Forma és méret: az IAN 369527 útmutató 2. oldala alapján becsült; a 383000 alkatrészeivel való azonosság nem igazolt. Szín: nem igazolt; a horgony a vizsgált termékfotókon nem azonosítható. A szürke megjelenítés szemléltető választás."
  }
};

export const categoryLabels: Record<Locale, Record<PartCategory, string>> = {
  hu: { structure: "Csövek", connector: "Csatlakozók", accessory: "Kiegészítők" },
  en: { structure: "Tubes", connector: "Connectors", accessory: "Accessories" },
};

export function localizePart(part: PartDefinition, locale: Locale): PartDefinition {
  return locale === "hu" ? { ...part, ...hungarianParts[part.kind] } : part;
}
