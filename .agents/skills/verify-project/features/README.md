# Eng Mode extension verification map

This directory is the maintained source for verifying the user-facing behavior of the Eng Mode OMP extension. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Install dependencies with `bun install --frozen-lockfile`.
- Launch the real extension in a disposable OMP TUI profile as described in the parent skill.
- Copy workstation `config.yml` and `models.yml` into the profile's `agent/` directory.
- Export the `@tiny` provider's API key without recording the value.
- Run `bun run check`, then send `/tools` and require `escalate`, `handoff`, `loop`, `goal`, and `xd://eng_orch`.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from a healthy composer unless its preconditions say otherwise.
- Send each drive as one composer line.
- `eng_orch` is an `xd://` device. The transcript shows a `write` to `xd://eng_orch`.
- Restore loop and goal state after a mutation. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the rendered tool result, not only the final reply.
- A model response that describes a call without a rendered tool invocation is not evidence.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with OMP TUI` starts with preconditions when they differ from this README and uses numbered steps that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Loop lifecycle](./loop-lifecycle.md) covers start, status, pause, resume, stop, and the iteration-limit shutdown.
- [Durable goal objective](./goal-objective.md) covers create, get, resume, complete, and drop.
- [Repository contract gate](./repository-contracts.md) covers proceed, missing, malformed, and unconfigured contract decisions.
- [Durable orchestration store](./orchestration-store.md) covers units, ledger, inbox, gates, standing orders, and status. Frontier mutation is verified-unreachable without a dedicated non-production `gh stack`.
- [Automatic expert lens](./expert-lens.md) covers classifier injection of the Expert lens message and the ordinary no-write negative case.
- [Model tier handoff and escalation](./escalation.md) covers `/eng-mode` start, Exploration check, handoff, Escalation check, evidence-gated escalate, and terminal handoff refusal.
- [Easy session pin](./easy-mode.md) covers `/easy`, `/easy TASK`, the `/eng-mode … /easy` modifier, and pinned escalate refusal.
