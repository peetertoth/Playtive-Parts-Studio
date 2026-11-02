# Web integration context

Goal: a polished parts explorer for Playtive Kids' Climbing Frame 383000, with Hungarian as the default UI language and English support. Preserve the individual inspector; the new `/planner` route adds inventory-limited magnetic assembly. Read `planner-context.md` when assigned planner work. No backend, database or account.

Write code identifiers, comments, developer messages, documentation, and instructions in English. Use central typed project-local Hungarian/English dictionaries and a shared locale context for all user-facing text, including accessibility labels, empty/loading/error states, catalog data, and validation explanations. Provide a visible HU/EN switcher and preserve the chosen locale across routes with a cookie. Use locale-aware `Intl` formatting. Keep part identifiers and saved-plan JSON schemas independent of the UI language.

Use the small `src/i18n/` layer without an added i18n library. The one-year `playtive-locale` cookie supplies server-localized root HTML language and metadata; client language changes are immediate. Hungarian is the default regardless of browser language. Canonical catalog data and engine error messages are English; stable engine issue codes identify validation explanations for UI translation.

Stack: Next.js App Router, TypeScript, Tailwind CSS, React Three Fiber 9, Three.js, Drei, Lucide icons. The package installation is managed by the orchestrator. Use system fonts to avoid network font requirements.

Contract: `src/domain/parts.ts`; catalog `PARTS` from `src/domain/catalog.ts`; geometry `PartModel({ part, wireframe?, showPorts? })` from `src/components/3d/part-model.tsx`. Geometry is centered, Y-up, 100 mm = 1 scene unit. Do not create competing definitions or placeholders. Modeler owns catalog and geometry.

Experience: warm off-white studio workspace, catalog-defined retail colors, dark ink text, subtle grid in a large 3D viewport. Use each part's `color` and `colorName` in models, glyphs and details; do not hardcode a blue palette by kind. Frame the measured visible-body bounds at the viewport center; exclude floor and optional port markers. Search/category filter in a left parts library; selected part details in an adjacent panel or below on mobile. Functional rotate, zoom, reset camera, front/top/isometric presets, wireframe toggle, optional auto-rotation and connection markers. Keep controls usable by keyboard and on touch. Show a loading state and readable WebGL fallback. Clear selection and filtered-empty states.

Accuracy note: target 383000 technical drawings are not verified yet; current geometry uses an explicitly labeled related-kit reference and estimated dimensions. Show this once, concisely, with a source link. No fake claim of manufacturing-accurate models.

Allowed files: `src/app/`, `src/components/catalog/`, `src/components/3d/part-viewer.tsx`. Read relevant `node_modules/next/dist/docs/` before framework code, especially server/client components and lazy loading. No agent configuration, package, or geometry edits.
