---
name: verify-project
description: Launch and drive the Eng Mode extension in a disposable OMP TUI session to verify registered tools and lifecycle behavior.
---

# Verify the Eng Mode OMP extension

## Launch

Install dependencies with `bun install --frozen-lockfile`. Select a configured model and start the real extension in a managed PTY from the repository root:

```sh
omp --profile eng-mode-verification-<unique-suffix> --model <provider/model> --no-extensions -e "$PWD/src/extension.ts"
```

The disposable profile must be able to resolve the selected model. If the model uses a custom definition, make that definition visible in the disposable profile before launch. Inject broker-backed credentials into the runtime environment when needed, but never record credential values in evidence or committed files. Readiness is the OMP composer accepting input. Stop only the managed process that this run started. Remove the disposable profile after evidence is captured.

## Doctor

Before driving the TUI, run `bun run check`. In the TUI, open the tool inventory and confirm the extension's expected tools are present. A load error, missing tool, or duplicate-tool warning fails the health gate; do not continue with behavioral claims.

## Drive

Interact through the managed PTY, not internal function calls. Ask the agent to invoke one named tool with explicit arguments, then inspect the rendered result. Follow the recipe in each mapped feature file.

## Evidence

Capture:

- the exact extension revision and launch command;
- the successful tool inventory/health gate;
- the rendered invocation and result;
- each repeated turn;
- the terminal status proving the limit or explicit stop prevented another turn.

A unit-test transcript is supporting evidence, not a substitute for this TUI path. A model response that describes a call without a rendered tool invocation is not evidence.

## Cleanup

Where a loop recipe applies, invoke `loop` with `op: status` and confirm `{ "available": true, "enabled": false }` before shutdown. Stop the named managed PTY process and confirm that it exited. Remove only the disposable verification profile created for the run. Preserve captured transcripts and tool output.

## Feature map

- [Loop lifecycle](features/loop-lifecycle.md)
- [Durable goal objective](features/goal-objective.md)
- [Repository contract gate](features/repository-contracts.md)
- [Eng-Advisor](features/eng-advisor.md)
- [Durable orchestration store](features/orchestration-store.md)
- [Automatic expert lens](features/expert-lens.md)
