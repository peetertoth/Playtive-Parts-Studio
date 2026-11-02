# Planner integration contract

Current task: build a local inventory-limited magnetic assembly designer, keeping `/` part inspector and adding `/planner`. User requires drag/drop with magnetic tube-to-connector attachment, and rotation only in exact 90-degree steps around X/Y/Z. Use the existing actual-color geometries. No backend or database. User chose manual-based initial quantities; they remain editable and their related-kit provenance must be visible.

Language contract: code identifiers, comments, developer messages, documentation, and agent instructions are English. The UI defaults to Hungarian and supports English through central typed project-local dictionaries and a shared locale context. All user-facing text, including validation explanations and accessibility labels, is localized. A visible HU/EN switcher and locale cookie preserve the choice across routes; use locale-aware `Intl` formatting. Do not change saved-plan JSON, domain schemas, or identifiers according to locale.

The small project-local `src/i18n/` layer adds no library dependency. Hungarian is the default regardless of browser language. Preserve the one-year `playtive-locale` cookie, server-localized root HTML language and metadata, and immediate client updates. Canonical catalog data and engine errors are English; preserve stable engine issue codes and translate their explanations at the UI boundary.

Shared types: `src/domain/parts.ts`, `src/domain/planner.ts` (orchestrator-owned). `dimensionsMm`: X/Z/Y extents. Scene units: 100 mm = 1. Domain positions use mm, Y up. `PlacedPart.orientation` indexes 24 proper axis-aligned rotations, identity index 0. No arbitrary quaternion or Euler transform is saved.

## Engine exports (src/lib/assembly-engine.ts)

- `DEFAULT_INVENTORY: Inventory` and `INVENTORY_SOURCE: string`; initial related-manual counts: tube64, elbow5, tee6, corner3=15, corner4=8, cross2, connector5=3, screw132, wrench2, anchor4. Orchestrator verifies evidence before final delivery.
- `INSERTION_DEPTH_MM = 50` (estimated geometry assumption), `SNAP_DISTANCE_MM = 100`.
- `ORIENTATIONS`: readonly 24 readonly row-major 3x3 rotation matrices; identity index0.
- `rotateVector(vector: Vec3, orientation: number): Vec3`.
- `rotateOrientation(orientation: number, axis: Axis, quarterTurns?: number): number` (world-axis positive quarter turns).
- `getPartDefinition(partId: string): PartDefinition`.
- `worldPorts(part: PlacedPart): WorldPort[]`.
- `deriveConnections(parts: readonly PlacedPart[]): AssemblyConnection[]` (only tube↔connector; opposing port directions; tube port sits 50mm inside socket; one connection per port, tolerance 0.5mm).
- `inventoryUsage(document: PlannerDocument): Inventory` (structural instances + one screw for each derived join; wrench/anchor are listed supplies, not placeable structural pieces).
- `remainingInventory(document: PlannerDocument): Inventory`.
- `makeEmptyDocument(inventory?: Inventory): PlannerDocument`.
- `evaluatePlacement(document, candidate: PlacedPart, options?: PlacementOptions): PlacementResult`; existing candidate.id replaces that instance for evaluation. Snap only to available compatible ports within threshold, rotate automatically only to one of 24 orientations if autoOrient is enabled. Align by exact port math, not a visual proximity fake. Recompute all joins, reject overspending, below-ground and intersecting exposed geometry/duplicates; allow intended tube insertion overlap at valid joints. Leave original document untouched.
- `PlacementOptions.placementHeightMm` supplies the raw horizontal workplane height. Ground the current and each trial orientation independently; never retain an upright tube's 175mm grounding lift when trialing a horizontal tube requiring only25mm. Without the option preserve caller's current pose and infer floor for alternate orientations only when applicable.
- `PlacementOptions.snapTarget` names a pointer-targeted free compatible endpoint. Solve that endpoint exactly at its real3Dheight independent of plane distance; still enforce orientation, occupancy, stock, floor and collision rules. Missing/occupied/incompatible targets refuse instead of silently falling back. Ordinary unhinted snapping keeps the100mm threshold.
- `commitPlacement(document, candidate, options?): PlacementCommit`; validates again before returning updated immutable document; invalid => original document.
- `removePlacedPart(document, id): PlannerDocument`.
- `rotatePlacedPart(document, id, axis, quarterTurns?): PlacementCommit`; rotate around the physical connector hub (infer from first port.positionMm - direction*75), or part center for tube. Preserve occupied neighbor endpoints or return useful refusal; user can move the element away to detach before incompatible rotation.
- `validateDocument(input: unknown): PlannerDocument`; enforce schema, known structural part IDs only, finite bounded mm positions, orientation0..23, unique IDs, nonnegative integer inventory within sensible max, counts/joins/geometry validity; reject bad input and present localized validation explanations through central i18n. Used on localStorage and JSON imports.
- `groundedPosition(partId: string, positionMm: Vec3, orientation: number): Vec3` shifts Y as needed to keep rotated bbox above Y0.

Engine code uses explicit relative `.ts` import extensions so Node24 can execute tests with built-in type stripping. Orchestrator enables TS allowImportingTsExtensions. No new dependency is needed.

## Ownership and UI contract

- Assembly engine agent owns the engine and its meaningful Node regression tests.
- 3D agent owns `src/components/planner/planner-scene.tsx` and optional scene helpers, and can read existing PartModel. Reuse PartModel without altering its geometry. Export a default component consuming `PlannerSceneProps` from the shared contract.
- Web agent owns `src/components/planner/planner-studio.tsx`, `src/app/planner/page.tsx`, `src/app/planner/planner.css`, and the single navigation link in existing inspector. Do not edit scene/engine/shared contracts.
- Orchestrator owns shared contracts, configuration, documentation and integration checks. Agents do not install dependencies, run builds or access browsers. No concurrent edits to shared files.

Interaction: palette pointer-down supplies `draft` with dragOrigin and orientation; scene listens to document/window pointer events to show a live candidate when the cursor enters its rect, and commits on release inside. A click in palette also arms click-to-place for keyboard/touch convenience. Handle cancellation and drop outside without spending stock. Existing meshes can be selected and dragged to reposition as an individual part (it detaches and recomputes connections); scene calls onMoveStart, previews, then onCommit. Disable orbit while placing/dragging. Right-click/Escape cancel. Only committed placements update document/history. Invalid ghosts have red indicator and cannot commit.

Scene has horizontal placement plane at `placementHeightMm`; parent offers a height control and top/front/isometric views. Floor placement uses groundedPosition; near candidate ports can snap in full3D, including upper layers. Show available compatible target ports while placing, snap preview (green) and selection outline. Camera fit considers assembled parts; preserve current camera between normal edits. Geometry rendering is mm positions /100 with orientation matrix converted to quaternion. Never use free TransformControls.

Pointer placement first projects all free compatible endpoints into screen space (24CSSpx capture radius) and passes the selected `snapTarget` to the engine before workplane projection. Only free placement falls back to a plane. While placing, compatible endpoint guides remain available even when the general port toggle is off. Regression coverage must use sequential actual Scene events and UI commits, not only mathematically prepositioned assemblies:3 tubes on a T, another connector on each tube end, and elevated/rotated variants.

UI: Hungarian by default with English support through central i18n, compatible studio styling, left palette with remaining/total stock and exhausted items disabled, large viewport, right properties with X/Y/Z ±90° controls for draft or selection, move/remove, editable inventory dialog, contextual hints, undo/redo, clear, localStorage persistence, JSON export/import with validation. Preserve user work on invalid import/storage. Helpers are browser-local; no agent implementation details in product UI. Nonstructural tools remain visible in inventory, not a fake placeable geometry option.

Browser access to localhost was denied previously. Do not retry, use other browser surfaces or workaround that denial. Parent verifies math/state/build and reports the visual QA limit.

## Selected-part rotation widget

`PlannerSceneProps.onRotate(axis, quarterTurns)` dispatches the SAME sidebar rotation action. Never mutate document/orientation directly from the gizmo. Shared colors come from `src/domain/rotation-controls.ts`: X red, Y green, Z blue. Widget source is `rotation-gizmo.tsx` and pure math is `rotation-gizmo-math.ts`.

Show the world-axis rings and six signed native Html buttons only for a selected placed part when not placing/dragging. Match the engine's connector-hub/tube-center pivot and exact quarter-turn sign. Hover/focus can preview `rotatePlacedPart` without committing; a blocked turn must remain blocked and explain why. Keep labels readable at zoom and within the Canvas rectangle.

Native widget controls carry `data-rotation-control`. Scene capture handlers and Canvas selection-miss handling must ignore those events; activation must not move/place/deselect a part or orbit the camera. Clear previews on click/cancellation/blur; retain undo/redo keyboard commands. Each click creates at most one existing validated history action. Existing sidebar, magnetic-port and saved-plan behavior must remain intact.
