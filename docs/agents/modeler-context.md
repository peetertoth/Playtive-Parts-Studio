# Modeler context

Goal: reusable parameterized 3D examples of the individual parts of the Playtive tube-and-connector climbing system. Target product is 383000. The individual inspector is retained; the new assembly planner reuses these geometries. Read `planner-context.md` only when assigned planner scene work.

Write code identifiers, comments, developer messages, documentation, and instructions in English. User-facing catalog and scene text must use the central typed Hungarian/English dictionaries and shared locale context. Hungarian is the default UI language; preserve English support, the visible HU/EN switcher, the cross-route locale cookie, and locale-aware `Intl` formatting. Keep part identifiers and saved-plan data locale-independent.

The small i18n layer is project-local in `src/i18n/`, without an added library. Canonical catalog data is English, with UI translations supplied centrally. Preserve the one-year `playtive-locale` cookie, server-localized HTML language and metadata, and immediate client updates. Hungarian is the default regardless of browser language.

Stack: TypeScript, React Three Fiber 9, Three.js, Drei. Export `PartModel({ part, wireframe?, showPorts? })` from `src/components/3d/part-model.tsx`. It returns a centered R3F group, never a Canvas. Coordinates are Y-up. Domain dimensions use millimeters; scene scale is 100 mm = 1 unit. Export `PARTS` from `src/domain/catalog.ts`.

The orchestrator owns `src/domain/parts.ts`. `ports` are connection directions and locations for future assembly work. Preserve honest provenance. A related IAN 369527 manual lists: tube, elbow, T connector, spatial 3-way connector, spatial 4-way connector, cross connector, 5-way connector, screw, wrench, ground anchor. This is reference-kit evidence, not verified identity with 383000. Tube dimensions around 350 × 50 mm are an estimate until the target manual or measurements are available. Other dimensions are estimated.

Sources to inspect as needed:

- https://www.manuals.co.uk/playtive/ian-369527/manual
- https://www.notice-facile.com/en/manual/603788/playtive%2Bian-369527
- https://www.kleinanzeigen.de/s-anzeige/playtive-kinderklettergeruest-383000-237-teiliges-klettersystem/3437544851-23-4393

Allowed files: `src/components/3d/part-model.tsx`, `src/domain/catalog.ts`, `docs/model-reference.md`. Read only related contract and library API files. No UI edits or dependency changes.

Retail colors are now photo-referenced in `docs/model-reference.md`; preserve each entry's `color` and `colorName` rather than assuming blue. `PartModel` also accepts optional `bodyRef?: Ref<Group>` on the visible geometry group inside the mm-to-scene transform. Keep port markers outside this group so viewer framing excludes them.
