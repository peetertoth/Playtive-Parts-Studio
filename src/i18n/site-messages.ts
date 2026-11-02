import type { Locale } from "./config";

const hu = {
  inspectorTitle: "Playtive Parts Studio · Alkatrészvizsgáló",
  inspectorDescription: "A Playtive 383000 mászóka alkatrészeinek interaktív 3D vizsgálója. Kapcsolódó referenciakészlet alapján készült, becsült modellek.",
  plannerTitle: "Építéstervező | Playtive Parts Studio",
  plannerDescription: "Készlet alapú, mágneses 3D építéstervező pontos 90 fokos fordulatokkal és helyi mentéssel.",
  language: "Nyelv",
  languageUnavailable: "A nyelv erre a munkamenetre megváltozott. A böngésző nem engedte a beállítás mentését.",
};
const en: typeof hu = {
  inspectorTitle: "Playtive Parts Studio · Parts explorer",
  inspectorDescription: "Explore the Playtive 383000 climbing frame parts in interactive 3D. Estimated models based on a related reference kit.",
  plannerTitle: "Assembly planner | Playtive Parts Studio",
  plannerDescription: "Inventory-limited magnetic 3D assembly planner with exact 90-degree turns and local saving.",
  language: "Language",
  languageUnavailable: "The language has changed for this session. Your browser could not save the preference.",
};
export const siteMessages: Record<Locale, typeof hu> = { hu, en };
