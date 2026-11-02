# Agent workflow

The primary agent is the orchestrator and the user's point of contact. Three specialists work on the project:

- **modeler_3d:** parametric 3D geometry, part catalog, and reference data.
- **web_integrator:** Next.js interface, part selection, and 3D viewer integration.
- **assembly_engine:** exact quarter turns, magnetic snapping, occupied ports, collision and inventory checks, and browser-independent tests.

Native Codex agent definitions for these roles are in `.codex/agents/*.toml`. Open this directory as a Codex project so the project's own `AGENTS.md` and `.codex` settings are the starting point. No separate agent server, API, or database is needed.

## Task workflow

1. The orchestrator records the expected result and shared interface.
2. It starts the appropriate specialist with a fresh context, providing only the task, allowed files, relevant context file, and acceptance criteria.
3. Specialists edit separate files. They request shared type changes from the orchestrator.
4. Specialists send a short handoff to the orchestrator.
5. The orchestrator checks integration, runs the necessary verification, and reports to the user.

Narrow context is a deliberate workflow choice. Agents share a working directory and permissions; file ownership is not a technical access restriction.

## Task handoff template

```text
Role: modeler_3d | web_integrator | assembly_engine
Goal: one concrete, verifiable result
Read: AGENTS.md, the role's context file, src/domain/parts.ts
Allowed edits: exact file list
Input: relevant specification and verified sources
Acceptance: expected behavior and verification
Return: changed files; checks; assumptions; open questions
```

## Current milestone

An inventory-limited magnetic assembly planner accompanies the part library. Its narrow context and fixed integration contract are in `planner-context.md`. The primary agent owns shared domain types; the three specialists work on separate engine, scene, and interface files. The related IAN 369527 kit's data must not automatically be treated as verified specifications for the 383000 kit.

All code identifiers, comments, developer messages, documentation, and agent instructions use English. The application defaults to Hungarian and supports English through central typed project-local dictionaries and a shared locale context. A visible HU/EN switcher and locale cookie preserve the selected language across routes; locale-sensitive values use `Intl`. Localized user-facing messages must not change saved-plan schemas or identifiers.

The dependency-free i18n layer is in `src/i18n/`. The one-year `playtive-locale` cookie supplies the server's root HTML language and metadata, while the client updates immediately on language changes. Hungarian remains the default regardless of browser language. Catalog data and engine error messages are canonically English; stable engine issue codes are translated at the UI boundary.

Documentation: [OpenAI — Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
