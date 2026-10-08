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

Before handoff, run `unslop`, then `no-comments`, then `bun run check`. Use `interrogate` for cross-cutting runtime or lifecycle changes. GitHub work uses `eng-github`; stack submission uses `eng-github stack submit --base BASE BRANCH...`.

## Safety

- Never use production credentials or mutate remote repositories during verification.
- Run OMP smoke checks with a disposable profile/session and explicit local extension path.
- Do not run the operator-only native `/loop` and an extension-owned model-callable loop simultaneously in one session.

## Rules and what enforces them

A port is correct only when OMP can resolve every name from the actor that needs it. A name that exists in our manifest can still fail at runtime when the actor that uses it can't reach it. Add a row whenever the operator corrects the same mistake twice.

| Rule | Enforced by |
|---|---|
| Every skill a shipped file tells an agent to load (`skill://NAME`, `/NAME`, `**NAME** skill`) resolves to a shipped or explicitly external skill. Cursor's bold short names (`**type-system-discipline**`) do not resolve in OMP. | `src/references.test.ts` |
| Every shipped agent can spawn every agent type that the skills it runs tell it to dispatch, under OMP's own `resolveSpawnPolicy`. No agent has `spawns: *`, and writers never spawn writers. | `src/agents.test.ts` |
| No skill or playbook expects a spawn deeper than OMP's default `task.maxRecursionDepth` of 2: lead (0) → writer or verifier (1) → leaf (2). Leaves declare no spawns. | `src/agents.test.ts` |
| Workflow-law references name only skills, agents, playbooks, and tools this plugin ships. External workflow dependencies are shipped in `skills/`, never whitelisted. | `bun run workflow-law:check` |
| A port or behavior change to an agent, skill, or playbook gets a live `omp -p` smoke run, from the actor that will use it, against this checkout's agents (installed plugin copies shadow `--plugin-dir`; copy `agents/*.md` into the scratch repo's `.omp/agents`). | Review judgment |
