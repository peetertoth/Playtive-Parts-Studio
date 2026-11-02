# Playtive Parts Studio — agent instructions

## Product scope

Build a local React + Next.js application for inspecting and assembling parts of the Playtive Kids' Climbing Frame (383000). Current milestone: inventory-limited magnetic 3D assembly planner with exact 90-degree rotations, undo/redo and local saving. Preserve the existing individual-part inspector. No backend, database or authentication. The UI defaults to Hungarian and supports English through central internationalization.

## Team and ownership

The primary agent is the orchestrator and remains the user's point of contact. It clarifies requirements, assigns bounded tasks, maintains shared contracts and dependencies, reviews changes, and verifies the integrated application. Delegate independent geometry, assembly logic and web work to the three specialists below; do not create additional agents by default.

| Specialist | Owns | Read initially |
| --- | --- | --- |
| `modeler_3d` | `src/components/3d/part-model.tsx`, `src/domain/catalog.ts`, `docs/model-reference.md`, assigned planner scene files | This file, `docs/agents/modeler-context.md`, `src/domain/parts.ts` |
| `web_integrator` | `src/app/`, `src/components/catalog/`, `src/components/3d/part-viewer.tsx`, planner studio UI | This file, `docs/agents/web-context.md`, `src/domain/parts.ts` |
| `assembly_engine` | `src/lib/assembly-engine.ts`, `tests/assembly-engine.test.mjs` | This file, `docs/agents/planner-context.md`, shared domain contracts |
| Primary orchestrator | Shared contracts, package/config files, agent setup, README, final checks | Task-relevant files only |

## Context and coordination

- Start specialist tasks with a fresh context (`fork_turns="none"` when supported). Supply the task, exact file allowlist, shared contract, acceptance criteria, and relevant source links. Do not pass the whole conversation.
- Context boundaries and file ownership are workflow instructions, not filesystem permission enforcement. All agents share the same checkout and permissions.
- Specialists communicate findings and contract-change requests to the primary agent. They do not spawn agents, contact the user, install dependencies, modify agent rules, or publish the app.
- Never edit another specialist's files concurrently. Request a handoff from the orchestrator first. Do not revert unrelated work.
- The orchestrator owns `src/domain/parts.ts` and `src/domain/planner.ts`. Propose changes before changing the interface; do not invent a competing type or placeholder catalog. Planner scene and UI ownership is assigned explicitly per task.
- Return a short handoff: changed files, behavior implemented, checks run, assumptions and unresolved issues.
- Keep generated logs, downloaded references, and screenshots outside the project in the chat workspace's `work/` directory.

## Engineering rules

- Write code identifiers, comments, developer messages, documentation, and agent instructions in English.
- Keep all user-facing text, including accessibility labels and validation explanations, in typed project-local Hungarian and English dictionaries with a shared locale context. Provide a visible HU/EN switcher, preserve the selected locale across routes with a cookie, and use locale-aware `Intl` formatting. Keep saved-plan JSON, identifiers, and domain schemas locale-independent.
- The small project-local i18n layer lives in `src/i18n/` and needs no additional library. Default to Hungarian regardless of browser language. Preserve the one-year `playtive-locale` cookie, server-selected root HTML language and metadata, and immediate client locale updates. Canonical catalog data and engine error messages are English; preserve stable engine issue codes for localized UI explanations.
- TypeScript with strict typing; React Three Fiber 9 + Three.js + Drei for 3D.
- Geometry uses millimeters in the domain, converted to scene units in one place. Expose reusable part geometry without its own Canvas or camera.
- Do not claim reference-kit specifications or estimated geometry are verified dimensions for model 383000. Keep source provenance and uncertainty visible.
- Browser-only 3D must load behind a client boundary. Provide a readable WebGL failure state.
- Accessible controls, responsive layout, keyboard focus, and reduced-motion support.
- Implement only current scope. No API keys, agent SDK server, backend, database, or hosting setup is necessary.
- Verify relevant changes with TypeScript, a production build, and a browser smoke check when available. Do not add trivial tests that only repeat implementation details.

## Commands

- `npm run dev` — local preview.
- `npm run typecheck` — Next route types + TypeScript check.
- `npm run test:planner` — pure assembly engine regression tests; Node 22.6+ required, bundled Node24 preferred on this machine.
- `npm run test:i18n` — translation coverage, locale preferences, and localized domain validation.
- `npm run build` — production build.

Custom project agents live in `.codex/agents/`. See `docs/agents/README.md` for orchestration and handoff instructions. Leave model selection inherited from the primary agent unless the user explicitly chooses otherwise.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
