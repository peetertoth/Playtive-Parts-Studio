import { PARTS } from "../domain/catalog.ts";
import { EN_PLANNER_ERRORS, type PlannerIssue } from "../domain/planner-issues.ts";
import { formatLocaleNumber, type Locale } from "./config.ts";
import { localizePart } from "./parts.ts";

const hu: typeof EN_PLANNER_ERRORS = {
  orientation: "Az elforgatás csak a 24 pontos, derékszögű állás egyike lehet.",
  rotation: "A forgatás tengelye X, Y vagy Z, lépése pedig egész számú 90° lehet.",
  unknownPart: "Ismeretlen alkatrész-azonosító.",
  inventory: "A készlet formátuma hibás.",
  inventoryFields: "A készletben minden ismert alkatrésznek pontosan egyszer kell szerepelnie.",
  inventoryCount: "{part}: a készlet 0 és {limit} közötti egész szám lehet.",
  part: "Egy elhelyezett alkatrész formátuma hibás.",
  partFields: "Az alkatrész mentett mezői hibásak.",
  instanceId: "Az alkatrész egyedi azonosítója hibás vagy túl hosszú.",
  partType: "Az alkatrész típusa hibás.",
  accessory: "A csavar, a kulcs és a horgony csak készletelem; nem helyezhető a vázba.",
  position: "A helyzet három véges, legfeljebb ±{limit} mm értékből állhat.",
  orientationFormat: "Az elforgatás formátuma hibás.",
  partLimit: "A terv legfeljebb {limit} szerkezeti elemet tartalmazhat.",
  duplicateId: "Az alkatrészek egyedi azonosítói nem ismétlődhetnek.",
  portConflict: "Egy csatlakozónyílást csak egy alkatrész foglalhat el.",
  screwStock: "Nincs elég rögzítőcsavar: minden kapcsolathoz egy csavar szükséges.",
  partStock: "Elfogyott a készlet: {part}.",
  belowGround: "Az alkatrész nem kerülhet a talaj alá.",
  collision: "Az alkatrészek teste ütközik. Helyezd őket szabad helyre vagy illeszd a csövet egy szabad nyílásba.",
  targetMissing: "A kijelölt csatlakozónyílás már nem érhető el.",
  targetOccupied: "A kijelölt csatlakozónyílás már foglalt.",
  snapDistance: "Az illesztési távolság hibás.",
  targetOrientation: "A kijelölt nyíláshoz ebben az állásban nem csatlakoztatható az alkatrész.",
  workplane: "Az elhelyezési sík magassága hibás.",
  placement: "Az elhelyezés adatai hibásak.",
  selectedMissing: "A kijelölt alkatrész már nincs a tervben.",
  connectedRotation: "A forgatás elmozdítaná a foglalt csatlakozást. Előbb húzd el az alkatrészt a leválasztáshoz.",
  rotationData: "A forgatás adatai hibásak.",
  document: "A terv formátuma hibás.",
  documentFields: "A terv mentett mezői hibásak.",
  documentVersion: "A mentett terv verziója nem támogatott.",
};
export const plannerErrorMessages = { hu, en: EN_PLANNER_ERRORS };

/** Accept an engine result/error, without parsing translated prose or leaking native errors. */
export function plannerErrorMessage(value: unknown, locale: Locale): string {
  if (value instanceof SyntaxError) return locale === "hu" ? "A fájl nem érvényes JSON-formátumú." : "The file is not valid JSON.";
  const issue = value && typeof value === "object" && "issue" in value ? value.issue as PlannerIssue : null;
  if (!issue || !Object.hasOwn(EN_PLANNER_ERRORS, issue.code)) return locale === "hu" ? "Ismeretlen hiba történt." : "An unexpected error occurred.";
  const part = PARTS.find((definition) => definition.kind === issue.partKind);
  return plannerErrorMessages[locale][issue.code]
    .replace("{part}", part ? localizePart(part, locale).name : "")
    .replace("{limit}", issue.limit === undefined ? "" : formatLocaleNumber(issue.limit, locale));
}
