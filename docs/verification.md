# Verification

## Closed assembly generation — 2026-11-03

- All 59 automated tests passed: the original assembly/i18n/HTTP ID tests, 11 independent geometry audit tests, 13 search tests and 2 actual worker-thread protocol tests. The production build and its TypeScript check passed. Build output includes the compiled generator worker and Turbopack worker bootstrap.
- Output checks require every real tube end and connector socket to be occupied, a single connected nonempty assembly, stock and screw compliance, collision/floor validity, inclusive outer-size caps and unchanged inventory. Tests include every connector kind, five-way sockets, both tube ends, disconnected closed shapes, tight independent caps, malformed input and failed searches with no partial document.
- Deterministic variants include results using all 103 available structural pieces. New runs produce different geometry; generation is a bounded lattice search and does not guarantee a global optimum or exhaustive feasibility detection.
- Continuation tests preserve every original ID, type, position and orientation, including partial cubes and individual tubes. Compact completion seeds closed all 144 connector-kind/orientation combinations at an elevated hub within 64 attempts, plus all tested floor-feasible connector orientations. The geometry specialist independently reran all 144 cases, checked actual closure/stock/stats and verified immutable inputs. The shared 1e-6 mm limit tolerance is covered by a regression.
- The actual worker module was executed in a separate Node worker thread, using a browser-message adapter. It returned a closed bounded result, preserved the request data and reported impossible caps or malformed protocol without a partial plan.
- An actual-source Studio hook harness verified one history/save step per successful apply, exact undo/redo, independent audit, continuation, stale snapshot refusal, and rejection of open-port, bounds and stock violations without document/history/save changes. Modal open/close preserved placement and selection; shortcuts were isolated.
- An actual-source dialog harness passed 24 lifecycle/settings cases with mock workers and real generated documents: optional/invalid/native-invalid caps, fresh seeds, cancellation/closure/unmount cleanup, ignored late or duplicate messages, worker constructor/post/message/error failures, no-solution and stale refusals, structural-only metrics and live HU/EN state text. Existing UI, locale and HTTP-ID fallback checks continued to pass.

These checks exercise real domain functions, thread protocol and component callbacks with simulated React/native dialog/worker surfaces. Browser access remained unavailable, so live browser rendering, device-level modal/focus behavior and visual WebGL interaction were not verified.

## HTTP LAN access — 2026-11-03

- The PowerShell launcher now binds to `0.0.0.0` by default, with an optional `-BindAddress` override. A running launcher was observed listening on `0.0.0.0:3000`; PowerShell syntax validation passed.
- Development origins use the machine's assigned IPv4 addresses instead of a wildcard. The actual Next.js development asset/WebSocket origin guard accepted the assigned addresses and localhost and rejected an unrelated origin in a direct function check.
- Both planner UI and Scene use the shared UUIDv4 helper. It retains native `crypto.randomUUID()` on secure origins and uses `crypto.getRandomValues()` on ordinary HTTP LAN origins. Moves preserve their existing IDs.
- All 33 domain/i18n/ID tests and the production build passed. Three focused ID tests cover native generation, 1,000 distinct fallback IDs, and multiple additions/move/JSON round trips.
- Actual UI and Scene handler harnesses passed with `randomUUID` absent: distinct additions, stable repeated moves, six consecutive spatial attachments, history/storage/rotation, and 14 locale round trips. Each harness restored the original global crypto descriptor.
- Browser access remained unavailable; no HTTP/browser workaround was used. A different device's network/firewall reachability and rendered interaction were not directly verified. Local storage remains isolated by origin, so plans can be transferred between localhost and an IP address through JSON export/import.

Earlier entries retain their original verification scope and limitations.

## Hungarian and English internationalization

- `npm run typecheck` and the production build passed. Both `/` and `/planner` render on demand using the locale cookie, including server-rendered HTML language and metadata. No dependency was added.
- All 26 assembly-engine regression tests and 4 new i18n tests passed. Locale tests cover the Hungarian default, invalid locale fallback, the one-year cookie, locale-aware numbers, matching dictionary coverage, all ten translated part types, immutable geometry/IDs, source caveats, and every engine issue code in both languages. Domain tests now assert stable issue codes rather than translated prose.
- The actual locale provider and server layout/metadata functions were checked in a Node harness with simulated React hooks and cookie/DOM surfaces. HU/EN switching updated HTML language, titles, descriptions, formatting and part names, preserved child identity, and handled blocked preference cookies. Initial, Hungarian, English and unsupported cookie values produced the expected server language and metadata for both routes.
- The actual planner UI passed its existing state, multi-port and rotation integration checks. Fourteen HU-to-EN-to-HU round trips retained the exact plan and draft references, selected part, orientation, undo/redo availability, view and framing requests, placement height, port display, stock and saved data. Existing notices, inventory validation, import/recovery/save failures, and blocked engine explanations changed language immediately.
- Scene event and targeting checks still passed, including sequential use of all three T ports, both ends of each tube, elevated/rotated targets, inventory/floor refusals, keyboard handling and cancellation. The 1,008 rotation geometry/pivot cases and existing projection/callback isolation checks passed. Live hover-state language changes translated valid previews, blocked reasons, tooltips and accessible labels without a document mutation or rotation callback.
- Targeted ESLint passed for the i18n modules, new issue contract, localized route metadata, inspector UI and new locale tests. English documentation, agent instructions and launcher messages were checked; renamed examples retained their original JSON contents and hashes.

These are domain, source-component, simulated lifecycle/event and build checks. Real-browser visual, WebGL rendering and device-level touch checks were not performed because browser access had previously been denied. Responsive header rules were adjusted to accommodate the language switcher; their final visual appearance still needs an interactive browser check.

## Selected-part color-coded rotation controls

- Three rings for the fixed world axes, colored quarter-circle arrows, and six native ±90° buttons were added around the selected part. Shared axis colors match the sidebar buttons. The existing rotation action also handles the new buttons.
- A mathematical check covered the pivot, indicated direction, and agreement with the engine in 1,008 part/orientation/rotation cases. The 3D arrow tip and tangent follow the quarter turn with the appropriate sign.
- In isometric/front/top projections, the six 56×44 CSS-pixel buttons did not overlap in the centered views checked. Their minimum readable size was retained across zoom, distance, and viewport height changes. During initial camera fitting for a long tube, the complete button rectangles remained inside the canvas in 420×740, 320×640, and 800×600 workspaces.
- Testing the actual component callbacks produced exactly one correct rotation request for each of the six axis/sign actions. Hover/focus showed a preview and retained the explanation for a blocked turn; click/cancellation cleared the preview. Ctrl/Cmd undo and redo commands continue to propagate.
- Scene event checks confirmed that clicking a rotation control does not start placement, dragging, camera movement, or deselection. In the UI check, the six new callbacks invoked the existing sidebar action, leaving inventory unchanged and creating one undoable action per click; a blocked rotation at an occupied connection did not alter the plan.
- The 26 engine tests, multi-port magnetic-snapping event checks, and local-save/state-management checks continued to pass.

These are code, event-handling, and projection checks. Real-browser visual checks, device-level touch checks, and WebGL rendering checks were not performed because access had previously been denied.

## Sequential snapping to multiple ports — fix

The user's reported issue was reproduced with actual Scene pointer events: when targeting the side ports of a T connector, a vertically grounded tube retained its 175 mm center height even during automatic horizontal trials. The T connector's side endpoint was at 34 mm, so the 141 mm difference exceeded the 100 mm magnetic radius. Earlier tests checked geometrically prepositioned cases and missed this complete user placement workflow.

The fix uses orientation-specific height handling, exact spatial snapping to the screen-targeted free port before ground-plane projection, and markers for all compatible free endpoints during placement. Occupancy is still calculated per individual port. A new UI counter displays connected/free/total ports.

- **26/26** domain regression tests passed, including three tubes attached sequentially to the same T connector, separate connectors at both ends of a tube, an endpoint above 400 mm, a magnetically closed square, and inventory/collision limits.
- A check using the real Scene event handlers placed tubes on the three T ports and another connector on each free tube end: 6 connections, with 2 connections per tube. Another 15 pointer-based connections passed with elevated/rotated T connectors and front/top/isometric camera views. Inventory exhaustion, an invalid downward-facing target, and individual repositioning checks also passed.
- The same multi-connection sequence passed through the UI's own commit handler; the counter showed 3 connected/0 free/3 total for the T connector and 2 connected/0 free/2 total for all three tubes. The resulting sample is in `examples/tee-with-three-tubes.json`.
- The full production build and its TypeScript check passed; existing save/state and event-handling checks continued to pass.

The event-handling checks use real Three cameras and ray calculations and the real engine, but a simulated hook lifecycle and canvas. No live visual or device-level tests were run because browser access had previously been denied.

## Assembly planner — update

- The `/planner` route and original part inspector were generated successfully in a production build; the TypeScript check also passed.
- The assembly engine's 20 regression tests passed. They cover the 24 exact orientations, magnetic connections, exclusion of occupied ports, preservation of manual quarter turns, inventory and screw counts, collisions, a closed frame, immutable state transitions, and rejection of invalid imports. Every port on every connector type was also checked with simultaneously attached tubes in all 24 orientations.
- A separate integration check built a complete spatial cube from 8 corner connectors and 12 tubes, with 24 connections and 24 screws consumed. Reimporting the saved JSON was valid. Its sample plan is `examples/cube.json`.
- In a sparse test scene with 103 structural parts, engine computation averaged approximately 2 ms per preview on this machine. This measures CPU logic, not WebGL frame rate.
- The actual planner UI state management was checked with a Node-based hook harness: selection/arming does not consume stock; new parts receive unique IDs; repositioning within one event does not duplicate a part; undo/redo, deletion, invalid import, inventory minimums, and the exhausted palette work. The initial empty state does not overwrite a saved plan, and invalid previous saved data is preserved separately.
- Actual 3D Scene event handlers were checked with a simulated hook lifecycle, real Three cameras/ray calculations, and the real engine. Checks passed for dropping inside/outside, cancellation, the final pointerup coordinates, touch cancellation, click-to-arm, Escape/right-click, arrow keys and Enter/Space, the front-view workplane, click versus quick individual dragging, context loss, and cleanup of handlers/pointer capture.
- All three native agent definitions were valid TOML and contained the instructions required for their roles.

These are code and mathematical checks. They do not replace real-browser hit testing, device-level pointer capture, touchscreen use, visual-layout checks, or WebGL rendering checks. No live visual verification was performed, and the earlier localhost browser-access denial was not bypassed.

During verification, port 3000 was temporarily not listening, but the project's own Next.js server was running again by the launcher check. The launcher recognized the existing instance, and no second instance remained running. The existing server was preserved. Use the command in the README to restart it.

## Colors and centering — update

- Part color families were added to the catalog from retailer product photos identified as 383000; thumbnails and the details panel use the same data. Image sources are listed in `model-reference.md`. The ground anchor's color remains unverified.
- The camera targets the center of the visible geometry's measured world-space bounding box. The floor, shadow, axis helper, and optional connection markers are excluded from the measurement.
- Geometry verification covered ten parts, four viewport aspect ratios, and three camera directions: 960 corner projections passed. The center projects to the center of the image.
- CameraRig state-transition verification covered seven steps, including view changes, reset, alignment after damped rotation, resize after zoom, and a UI update that does not change the camera. All passed.
- Browser permissions denied reading the open `http://localhost:3000` page. Consequently, this update also had no live visual test; without visual evidence, no single specific cause of the earlier low placement can be established.
- The user's existing development server was preserved.

## Earlier successful checks

- `npm run typecheck`: successful Next.js route-type generation and TypeScript check.
- `npm run build`: successful production build; the home page was statically generated.
- Local production launch with the bundled Node 24 runtime: passed; the home page returned HTTP 200 and the expected page title.
- Part catalog: ten distinct part types, unique identifiers, positive bounding dimensions, normalized outward connection directions; ports are within the specified bounding dimensions.
- Agent setup at that milestone: two specialists, valid TOML files, completed names/descriptions/instructions, inherited model selection.
- `start-local.ps1`: PowerShell syntax check passed.
- Production dependencies, `npm audit --omit=dev`: 0 known vulnerabilities at the time of the check.

## Verification limitations

Browser permissions denied opening the `http://127.0.0.1:3000` origin. Interactive WebGL rendering, mouse/touch interaction, and responsive layout therefore were not verified in a live browser. The build and HTTP response alone do not establish those behaviors.

Technical equivalence and dimensions for the exact 383000 kit are unverified. Model sources and estimates are recorded in `model-reference.md`.

The full npm audit reported 16 moderately affected packages in the development ESLint toolchain, concerning minimatch glob processing. The production-dependency audit reported no affected packages.

The local server started for testing was stopped at the end of that verification. Restart it with `npm run dev` in the project root or the `start-local.ps1` command in the README.
