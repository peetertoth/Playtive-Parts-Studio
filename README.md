# Playtive Parts Studio

A local React + Next.js web application for viewing the parts of the Playtive Kids' Climbing Frame (383000) in 3D and designing assemblies within inventory limits.

- [Part inspector](http://localhost:3000/): a separate 3D view of each part type.
- [Assembly planner](http://localhost:3000/planner): drag-and-drop placement, magnetic snapping, and exact quarter turns.

## Getting started

Recommended environment: **Node.js 24** and npm. The regression tests require Node.js 22.6 or later.

```powershell
git clone https://github.com/peetertoth/Playtive-Parts-Studio.git
cd Playtive-Parts-Studio
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If the port is occupied, use the local address printed by Next.js. Stop the server with `Ctrl+C`.

On this machine, you can also run `start-local.ps1` from the project directory to use the Node runtime bundled with Codex. This does not change the machine's global Node installation.

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

The launcher listens on `0.0.0.0` by default, so other devices on the same network can open `http://<computer-ip>:3000` (or `/planner`). Use the computer's actual IPv4 address in the browser. Next.js development assets allow the machine's assigned IPv4 addresses, detected when the server starts. Restart the server if its network address changes. To bind only to loopback, pass `-BindAddress 127.0.0.1`.

The planner supports ordinary HTTP access by IP, including part creation when the browser does not expose `crypto.randomUUID()`. Local saves and the language preference belong to each browser origin: `localhost` and an IP address have separate storage. Export a plan as JSON and import it at the other address to transfer it.

## Features

- Select a part type from a searchable library with category filters.
- Rotate, zoom, select camera views, and reset the camera.
- Display wireframes and connection points.
- Responsive interface with Hungarian as the default language and English available through the visible HU/EN switcher.

The assembly planner provides:

- Drag tubes and connectors from inventory; click and keyboard placement are also supported.
- Magnetic snapping to compatible, free connection points, with valid/invalid previews.
- ±90° rotation around each X/Y/Z axis, using only the 24 proper spatial orientations.
- Colored rotation arrows around the selected placed part: X red, Y green, Z blue. Each direction has a separate ±90° button; the existing sidebar buttons and keyboard shortcuts also work. Hover or focus previews the next orientation and explains any blocked turn.
- Inventory and screw usage tracking, with editable reference quantities from the manual.
- Select, move individually, and delete existing parts; undo and redo.
- Adjustable placement-plane height and isometric/front/top camera views.
- Automatic local saving, validated JSON import, and JSON export. Invalid saved data or imports do not overwrite preserved work.

Moving a part leaves its neighbors in place and recalculates connections. A part with occupied ports may rotate only if the neighboring endpoints are preserved. The wrench and ground anchor are inventory supplies and cannot be placed in the structural workspace.

Try the sample plan [examples/cube.json](examples/cube.json). Select it using the planner's import control. It contains 8 corner connectors and 12 tubes, forming 24 connections. Importing it can be undone.

The sample [examples/tee-with-three-tubes.json](examples/tee-with-three-tubes.json) uses every T-connector port and both ends of each tube. While dragging, aim at the turquoise connection point; a green preview indicates a valid connection. The details panel also counts the selected part's connected and free ports.

There is no backend, database, or sign-in. Plans are saved in the browser's local storage; download a JSON file for a lasting backup.

## Language support

Hungarian is the default UI language, regardless of the browser's language. The visible HU/EN switcher selects Hungarian or English, and the `playtive-locale` cookie preserves that choice for one year across the inspector and planner routes. UI text comes from typed, project-local dictionaries and a shared locale context in `src/i18n/`; no additional i18n library is required. Numbers and other locale-sensitive values use `Intl` with the selected locale.

The server reads the cookie for localized page metadata and the root HTML language; switching languages also updates the client immediately. Canonical catalog data and engine error messages are English. Stable engine issue codes allow the UI to translate validation explanations through the central dictionaries.

Keep code identifiers, comments, documentation, developer messages, and agent instructions in English. Put user-facing text in the central dictionaries and provide both Hungarian and English translations. Keep saved-plan JSON, part identifiers, and domain schemas independent of the selected UI language.

The dictionaries are grouped by inspector, viewer, planner, scene, site metadata and validation errors. Add both translations when adding a message and run `npm run test:i18n`. Store transient notices as locale-neutral data or message functions so a language change also translates messages already on screen. Switching languages preserves the active plan, draft, selection and undo history.

## Models and accuracy

The geometries are original parametric Three.js models. The initial part list comes from the manual for the related **IAN 369527** kit. Full equivalence with the 383000 version and detailed dimensions still need verification; the models are illustrative and their dimensions are estimates. They are not manufacturer CAD files.

Sources and assumptions: [docs/model-reference.md](docs/model-reference.md).

Initial inventory and connection rules: [docs/planner-design.md](docs/planner-design.md). The application is an illustrative modeling tool; it does not calculate structural stability or load capacity.

## Why React Three Fiber?

[React Three Fiber](https://r3f.docs.pmnd.rs/) is a React renderer for Three.js. Parts are separate reusable components, while selection and the viewer fit React state management. Drei supplies rotation and camera helpers. All three libraries use the MIT license; no paid modeling service or API key is required.

## Agent setup

The primary agent is the orchestrator: it communicates with the user and verifies the result. The three specialists are:

| Agent | Responsibility |
| --- | --- |
| `modeler_3d` | 3D geometry, part data, sources, and estimates |
| `web_integrator` | Web interface, 3D viewer, and integration |
| `assembly_engine` | Magnetic snapping, discrete rotation, inventory, and geometry rules |

Roles and narrow-context handoffs: [docs/agents/README.md](docs/agents/README.md). Project instructions: [AGENTS.md](AGENTS.md). Native Codex definitions: `.codex/agents/`. Open this directory as a Codex project; no separate agent server or agent SDK is required. Agents inherit the primary agent's model selection.

## File structure

```text
.codex/agents/                    # Definitions for the three specialist roles
docs/agents/                     # Context packages and workflow
src/app/                         # Next.js pages and styles
src/components/catalog/          # Catalog interface
src/components/3d/part-model.tsx  # Reusable geometries
src/components/3d/part-viewer.tsx # Camera, lights, and viewer
src/domain/parts.ts              # Shared types, owned by the orchestrator
src/domain/catalog.ts            # Part catalog
src/domain/planner.ts            # Shared planner data model
src/i18n/                        # Typed dictionaries, locale context, and language controls
src/lib/assembly-engine.ts       # Browser-independent snapping engine
src/components/planner/          # Planner interface and 3D editor
tests/assembly-engine.test.mjs   # Domain regression tests
tests/instance-id.test.mjs       # HTTP LAN part creation and saved-ID compatibility
tests/i18n.test.mjs              # Locale and translation regression tests
```

## Verification

```powershell
npm run typecheck
npm run test:planner
npm run test:i18n
npm run build
```

Completed checks and their limitations: [docs/verification.md](docs/verification.md).

Main technologies: Next.js App Router, React, TypeScript, Tailwind CSS, React Three Fiber, Three.js, and Drei. The 3D view runs in the browser; the loaded application does not require an external model or font service.
