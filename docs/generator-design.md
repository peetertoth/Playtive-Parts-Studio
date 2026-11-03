# Closed assembly generation

The planner's **Random assembly** action searches for a connected assembly that uses as many available structural parts as it can find. It supports a new assembly and continuation of the current plan. All processing runs locally in a Web Worker; no backend or external AI service is involved.

## Result requirements

A generated result is accepted only when all of these conditions hold:

- Every tube end and every socket on every connector participates in exactly one real compatible connection.
- All structural pieces belong to one connected assembly. Empty results and separate closed components are rejected.
- Inventory quantities and screw usage stay within the current stock. Accessories are supplies, not generated frame members.
- The existing assembly engine accepts all positions, exact quarter-turn orientations, collisions, floor clearance, IDs and schema fields.
- Each supplied maximum outer dimension is respected: width is X, height is Y, depth is Z. Limits include the physical connector bodies and are measured in millimeters. Each cap is independently optional.
- Inventory is preserved exactly. In continue mode every existing part retains its ID, type, position and orientation.

`src/lib/assembly-analysis.ts` performs an independent final audit using the actual engine's connections and catalog body bounds. The worker and the UI integration both gate successful results through that audit. Manual editing continues to support unfinished assemblies; generation commits only completed assemblies.

## Search

`generateAssembly(document, options)` is a deterministic seeded search over unions of axis-aligned lattice cycles. In the current estimated geometry, adjacent connector hubs are 400 mm apart: a 350 mm tube plus two 75 mm sleeves minus two 50 mm insertions. Each graph edge becomes a tube. Each graph vertex must match a real catalog connector with exactly the same complete set of directions. The search includes planar loops, spatial grids and mixed cycle additions, using only the engine's 24 exact orientations.

The score favors more structural pieces. Alternative branches permit temporary graph deficits while completing cycles or changing generated fittings. Existing fittings remain fixed during continuation. Every emitted candidate is fully validated; incomplete graph states are never returned to the editor.

The default effort is 2,000 attempts, capped at 20,000 for callers. The seed varies on every dialog run and is safe on HTTP LAN origins. A search can leave inventory unused, and another seed may find a different or larger assembly. It does not prove global optimality or that an unsuccessful problem has no feasible solution. Continuations outside the supported lattice or search budget may fail. A fully closed existing assembly has no available connection ports for extension; the dialog explains that a new assembly can be generated instead.

The geometry remains an illustrative estimate from a related kit, not verified manufacturer CAD or a structural safety calculation.

## UI and data preservation

The generator dialog provides new/continue selection, three optional size fields, generation status, cancellation and result counts/dimensions. All text and failures are available in Hungarian and English.

The current document is captured when a run starts. The worker changes no editor state while searching. Cancel, Escape, close, worker failure, no solution, rejected validation or a stale document leave the plan and inventory intact. Closing the dialog restores a previously active manual placement. Worker handlers are detached and the worker is terminated on cancellation, closure and unmount.

Successful application checks that the document is still the captured object, repeats the independent audit, and commits the entire result as one undoable document change. Selection and placement are reset and the camera frames the result. Normal local saving and JSON exchange then work without a schema migration.

## Ownership and verification

- The orchestrator owns `src/domain/generator.ts`, worker protocol, integration checks and documentation.
- The assembly specialist owns search logic and its domain tests.
- The geometry specialist owns physical bounds, closure/connectivity audit and its tests.
- The web specialist owns the dialog, planner controls, translated messages and responsive styles.

Run `npm run test:generator` for geometry, search and actual worker-thread protocol tests. `npm run test:i18n` includes generator dictionary coverage. See `docs/verification.md` for completed checks and the browser verification limit.
