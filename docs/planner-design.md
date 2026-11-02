# Magnetic assembly planner

On the `/planner` route, users can build shapes from the tubes and connectors in their inventory. The existing `/` part inspector is retained. All functionality runs in the browser.

## Responsibilities

1. **Assembly engine:** the 24 distinct axis-aligned orientations; compatible free connections; inventory and collision checks; regression tests.
2. **3D scene:** live colored previews while dragging; magnetic snapping; placement, selection, and movement; camera.
3. **Web interface:** inventory palette and settings; 90° rotation buttons; undo/redo; local saving and file exchange.
4. **Orchestrator:** shared data types, verified reference data, integration, and final verification.

## Initial inventory

The user chose a manual-based initial inventory. [Document page 38 of the related IAN 369527 manufacturer manual](https://www.manuals.co.uk/playtive/ian-369527/manual?p=38), printed page 14, lists the following quantities. Full equivalence with the 383000 version is still unverified; quantities are editable in the application.

| Part | Quantity |
| --- | ---: |
| Tube | 64 |
| Elbow connector | 5 |
| T connector | 6 |
| Spatial 3-way connector | 15 |
| Spatial 4-way connector | 8 |
| Cross connector | 2 |
| 5-way connector | 3 |
| Fastening screw | 132 |
| Wrench | 2 |
| Ground anchor | 4 |

One screw is counted for every tube-to-connector joint. The wrench and ground anchor are inventory supplies, not placeable structural parts in the current planner.

## Geometry rules

- Positions are stored in millimeters, and rotation is the index of one of the 24 proper axis-aligned orientations. Four identical quarter turns restore the exact orientation; angular error does not accumulate.
- Tube ends may attach only to connectors. Both ports must be free, with opposing directions.
- The estimated geometry uses an **insertion depth of 50 mm** and a **magnetic search distance of 100 mm**. These are editing parameters, not verified manufacturer dimensions.
- The planner finds a pointer-targeted free port on screen and then aligns to its actual spatial endpoint. Side ports and upper-level ports can therefore be targeted directly; the distance to the ground plane does not prevent this snapping. Height is recalculated for each orientation during automatic quarter turns.
- The engine recalculates every resulting connection, including multiple connections made by the final part of a closed frame. Every connection consumes a screw.
- Placement checks inventory, below-ground geometry, and modeled structural collisions. Intended tube-insertion overlap is allowed.
- An attached connector may rotate only by a quarter turn that preserves its occupied neighboring endpoints. For other directions, move/detach the part first. Moving one part leaves its neighbors in place and recalculates its connections.

The plan is illustrative. The application does not calculate structural stability or load capacity, and the current geometries are not manufacturer CAD models.

The selected part's details show separate counts for connected, free, and total ports. A T connector can accept up to three tubes, and a tube can accept one connector at each end. No additional part may use an occupied port.

## Color-coded rotation controls

Three mutually perpendicular rotation rings and six clickable arrows/buttons appear around the selected placed part. For the fixed world axes, X is red, Y is green, and Z is blue. Every button retains its label and sign, so operation does not depend on recognizing color alone.

One click requests exactly +90° or −90° around the selected axis, through the same validated action used by the sidebar buttons. Connection constraints, error messages, and undo behavior are therefore shared. The rotation center is the connector's physical hub, or the tube's center.

Hover or keyboard focus shows a wireframe preview of the next pose. This changes neither the plan nor the inventory. Valid turns have a green preview; blocked turns have a red preview and an explanation. The controls disappear during placement previews or dragging so they do not interfere with drag-and-drop interaction.

The buttons retain a fixed screen size while zooming and stay within the workspace bounds. The arrows' visual direction matches the engine's exact quarter turns. Ctrl/Cmd+Z and redo remain available while the controls have focus.

## Data preservation

Only valid committed actions change the plan and inventory. A preview or canceled drag consumes no parts. Undo/redo stores complete document states. Plans saved in browser local storage or as JSON files must pass the same domain rules when imported; an invalid file must not overwrite current work.

## Language support

The interface defaults to Hungarian and supports English through the visible HU/EN switcher. A locale cookie preserves the chosen language across routes. Typed project-local dictionaries and a shared locale context provide user-facing labels, hints, accessibility text, and validation explanations; `Intl` formats locale-sensitive values. Saved-plan JSON and domain identifiers remain independent of the UI language. Code, comments, developer messages, documentation, and agent instructions use English.
