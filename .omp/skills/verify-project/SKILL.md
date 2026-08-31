---
name: verify-project
description: Launch and drive the Eng Mode extension in a disposable OMP TUI session to verify registered tools and lifecycle behavior.
---

# Verify the Eng Mode OMP extension

## Launch

Install dependencies with `bun install --frozen-lockfile`. Start the real extension in a managed PTY from the repository root:

```sh
omp --profile eng-mode-verification --no-extensions -e "$PWD/src/extension.ts"
```

Use a unique profile suffix when verification sessions may overlap. Readiness is the OMP composer accepting input. Stop only the managed process that this run started. Remove the disposable profile after evidence is captured.

## Doctor

Before driving the TUI, run `bun run check`. In the TUI, open the tool inventory and confirm the extension's expected tools are present. A load error, missing tool, or duplicate-tool warning fails the health gate; do not continue with behavioral claims.

## Drive

Interact through the managed PTY, not internal function calls. Ask the agent to invoke one named tool with explicit arguments, then inspect the rendered result. For `loop`, pass a prompt and limit of two; observe the repeated turn and stopped status.

## Evidence

Capture:

- the exact extension revision and launch command;
- the successful tool inventory/health gate;
- the rendered invocation and result;
- each repeated turn;
- the terminal status proving the limit or explicit stop prevented another turn.

A unit-test transcript is supporting evidence, not a substitute for this TUI path. A model response that describes a call without a rendered tool invocation is not evidence.

## Cleanup

Stop the named managed PTY process. Remove only the disposable verification profile created for the run. Preserve captured transcripts and tool output. Confirm no managed timer fires after stop or process exit.

## Feature map

- [Loop lifecycle](features/loop-lifecycle.md)
- [Durable goal objective](features/goal-objective.md)
- [Repository contract gate](features/repository-contracts.md)
