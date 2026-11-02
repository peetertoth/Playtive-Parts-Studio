import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_MAX_AGE, resolveLocale, localeCookie, formatLocaleNumber } from "../src/i18n/config.ts";
import { PARTS } from "../src/domain/catalog.ts";
import { localizePart, categoryLabels } from "../src/i18n/parts.ts";
import { PlannerError, EN_PLANNER_ERRORS } from "../src/domain/planner-issues.ts";
import { plannerErrorMessage, plannerErrorMessages } from "../src/i18n/planner-errors.ts";
import { catalogMessages } from "../src/i18n/catalog-messages.ts";
import { viewerMessages } from "../src/i18n/viewer-messages.ts";
import { plannerMessages } from "../src/i18n/planner-messages.ts";
import { sceneMessages } from "../src/i18n/scene-messages.ts";
import { siteMessages } from "../src/i18n/site-messages.ts";
import { makeEmptyDocument, evaluatePlacement, validateDocument } from "../src/lib/assembly-engine.ts";

test("locale selection uses Hungarian by default and persists only supported choices", () => {
  assert.equal(DEFAULT_LOCALE, "hu");
  for (const input of [undefined, null, "de", "EN", "en; Path=/admin", {}, 1]) assert.equal(resolveLocale(input), "hu");
  assert.equal(resolveLocale("en"), "en");
  for (const locale of ["hu", "en"]) {
    assert.equal(localeCookie(locale), `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax`);
  }
  assert.equal(formatLocaleNumber(12345.6, "en"), "12,345.6");
  assert.match(formatLocaleNumber(12345.6, "hu"), /^12\s345,6$/u);
});

function assertShape(hu, en, prefix = "") {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(hu).sort(), `Missing translation in ${prefix}`);
  for (const key of Object.keys(hu)) {
    assert.equal(typeof en[key], typeof hu[key], `Translation type mismatch: ${prefix}.${key}`);
    if (typeof hu[key] === "object") assertShape(hu[key], en[key], `${prefix}.${key}`);
    else if (typeof hu[key] === "string") assert.ok(en[key].trim(), `Empty translation: ${prefix}.${key}`);
  }
}

test("every UI namespace has matching, nonempty Hungarian and English entries", () => {
  for (const [name, dictionary] of Object.entries({ catalogMessages, viewerMessages, plannerMessages, sceneMessages, siteMessages, categoryLabels, plannerErrorMessages })) {
    assertShape(dictionary.hu, dictionary.en, name);
  }
  assert.equal(catalogMessages.en.partTypes(1), "part type");
  assert.equal(catalogMessages.en.partTypes(2), "part types");
});

test("all ten translated parts retain exact geometry, stable IDs and source uncertainty", () => {
  const canonical = JSON.stringify(PARTS);
  for (const part of PARTS) {
    const hu = localizePart(part, "hu");
    const en = localizePart(part, "en");
    for (const field of ["id", "code", "kind", "color", "accuracy"]) assert.equal(hu[field], en[field]);
    assert.equal(hu.ports, en.ports);
    assert.equal(hu.dimensionsMm, en.dimensionsMm);
    assert.notEqual(hu.name, en.name);
    assert.notEqual(hu.description, en.description);
    assert.match(hu.sourceNote, /nem igazolt/);
    assert.match(en.sourceNote, /unverified/);
    assert.equal(hu.accuracy, "estimated");
  }
  assert.match(localizePart(PARTS.find(part => part.kind === "anchor"), "en").colorName, /unverified/);
  assert.equal(JSON.stringify(PARTS), canonical, "Localizing display text must not mutate canonical parts");
});

test("all engine issues translate without parsing developer errors or changing validation", () => {
  for (const code of Object.keys(EN_PLANNER_ERRORS)) {
    const error = new PlannerError({ code, partKind: "tube", limit: 10000 });
    const en = plannerErrorMessage(error, "en");
    const hu = plannerErrorMessage(error, "hu");
    assert.ok(en && hu && en !== hu, `Untranslated issue: ${code}`);
    assert.doesNotMatch(en + hu, /\{(?:part|limit)\}/);
  }
  const document = makeEmptyDocument({ ...makeEmptyDocument().inventory, tube: 0 });
  const original = JSON.stringify(document);
  const result = evaluatePlacement(document, { id: "tube-1", partId: "tube", orientation: 0, positionMm: [0, 175, 0] });
  assert.equal(result.issue.code, "partStock");
  assert.equal(plannerErrorMessage(result, "en"), "Out of stock: Straight tube.");
  assert.equal(plannerErrorMessage(result, "hu"), "Elfogyott a készlet: Egyenes cső.");
  assert.equal(JSON.stringify(document), original);
  assert.deepEqual(validateDocument(JSON.parse(original)), document);
  assert.equal(plannerErrorMessage(new SyntaxError("native details"), "en"), "The file is not valid JSON.");
  assert.equal(plannerErrorMessage(new Error("native details"), "en"), "An unexpected error occurred.");
});
