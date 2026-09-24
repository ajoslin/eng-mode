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

Copy the workstation `config.yml` and `models.yml` into the profile's `agent/` directory before launch so the selected model resolves. The Expert lens and danger gate classify through TypeSafe AI and need `TYPESAFE_API_KEY` in the launch environment; export it without recording the value. Without it both hooks are disabled by design, and their positive paths are `verified-unreachable`. Readiness is the OMP composer accepting input. Stop only the managed process that this run started. Remove the disposable profile after evidence is captured.

## Doctor

Before driving the TUI, run `bun run check`. In the TUI, send `/tools` and confirm `loop`, `goal`, and `xd://eng_orch` are present, with no Eng Mode `escalate` or `handoff` tools. A load error, missing required tool, or duplicate-tool warning fails the health gate; do not continue with behavioral claims. PTY log capture keeps only the tail of the `/tools` table, so also check the profile's `logs/omp.<date>.<pid>.log` for extension load errors. A rendered `loop` or `goal` invocation proves the tool is registered.

## Drive

Interact through the managed PTY, not internal function calls. Ask the agent to invoke one named tool with explicit arguments, then inspect the rendered result. Follow the recipe in each mapped feature file. `eng_orch` is an `xd://` device: the transcript shows it as a `write` to `xd://eng_orch` with the JSON arguments as content, and the tool result is the rendered JSON. Send each drive as one composer line; a multi-line paste stays in the composer without submitting.

For model selection, launch with an explicit model and thinking level, then submit `/eng-mode Reply exactly MODEL_OK and stop.` Confirm the selected model and thinking level remain unchanged. Eng Mode must not register `/easy`, inject tier-routing prompts, or switch models after tool failures.

## Evidence

Capture:

- the exact extension revision and launch command;
- the successful tool inventory/health gate;
- the rendered invocation and result;
- each repeated turn;
- the terminal status proving the limit or explicit stop prevented another turn.

A unit-test transcript is supporting evidence, not a substitute for this TUI path. A model response that describes a call without a rendered tool invocation is not evidence.

The PTY log is lossy for long results. The profile's session file under `agent/sessions/<cwd-slug>/*.jsonl` holds every tool call and its full `toolResult` content, so read structured results from there. Copy it out of the profile before cleanup.

## Cleanup

Where a loop recipe applies, invoke `loop` with `op: status` and confirm `{ "available": true, "enabled": false }` before shutdown. Stop the named managed PTY process and confirm that it exited. Remove only the disposable verification profile created for the run. Preserve captured transcripts and tool output.

## Feature map

- [Loop lifecycle](features/loop-lifecycle.md)
- [Durable goal objective](features/goal-objective.md)
- [Repository contract gate](features/repository-contracts.md)
- [Durable orchestration store](features/orchestration-store.md)
- [Automatic expert lens](features/expert-lens.md)
- [Danger gate](features/danger-gate.md)
