---
name: project-standards
description: Repository law, commands, and selected engineering skills for the Eng Mode OMP extension.
---

# Eng Mode repository standards

## Scope and architecture

This repository ships one OMP extension from `src/extension.ts`, reusable skills under `skills/`, agent definitions under `agents/`, and operator guidance under `docs/guide/`.

- Keep runtime behavior behind the extension's registered tool interfaces.
- Reuse OMP primitives when an equivalent model-callable interface exists. When OMP exposes only operator UI state, keep any extension-owned state explicit and isolated.
- Skills define workflow semantics; runtime code provides only mechanisms and lifecycle state.
- Clean cutovers are required: migrate every shipped skill and guide in the same change, then remove obsolete semantics.

## TypeScript

Read `typescript-best-practices` before changing TypeScript. Keep external/session data validated at its boundary, model lifecycle variants with discriminated unions, and avoid casts. Do not add a dependency when the platform or existing dependencies provide the behavior.

## Test law

Use Bun's existing tests under `src/`. Tests must exercise observable tool and lifecycle contracts through registered extension interfaces. For timer behavior, inject or control time; do not add real sleeps. A regression test must fail when the behavior it protects is removed.

Commands:

- Targeted test: `bun test ./src/<file>.test.ts`
- Full test: `bun test ./src`
- Typecheck: `bunx tsgo -p tsconfig.json`
- Required pre-commit pass: `bun run check`

There is no separate lint command.

## Verification and review

The product verification contract is `verify-project`. Use it for user-visible OMP extension behavior; unit tests alone do not prove that OMP can load and drive the tool.

Before handoff, run `unslop`, then `no-comments`, then `bun run check`. Use `interrogate` for cross-cutting runtime or lifecycle changes. GitHub work uses `better-github-skill`; stacked delivery uses `graphite`.

## Safety

- Never use production credentials or mutate remote repositories during verification.
- Run OMP smoke checks with a disposable profile/session and explicit local extension path.
- Do not run the operator-only native `/loop` and an extension-owned model-callable loop simultaneously in one session.
