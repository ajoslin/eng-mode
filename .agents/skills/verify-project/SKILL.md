---
name: verify-project
description: Launch and drive the Eng Mode extension in a disposable OMP TUI session to verify registered tools and lifecycle behavior.
---

# Verify the Eng Mode OMP extension

## Launch

Install dependencies with `bun install --frozen-lockfile`. Select a configured model and start the real extension in a managed PTY from the repository root:

```sh
omp --profile eng-mode-verification-<unique-suffix> --model <provider/model> --no-extensions --session-dir <scratch-dir>/sessions -e "$PWD/src/extension.ts"
```

The disposable profile must resolve the selected model, the `@tiny` classifier role, and `eng_mode_easy`. A named profile reads its config from `~/.omp/profiles/<name>/agent/`; copy the workstation `~/.omp/agent/config.yml` and `models.yml` there before launch. A disposable profile has no broker credentials. Export the `@tiny` provider's API key into the launch environment without recording the value. When `@tiny` is an OpenRouter model, use `OPENROUTER_API_KEY="$(omp token openrouter)"`. Readiness is the OMP composer accepting input (the `❯` prompt). Stop only the managed process that this run started. Remove the disposable profile after evidence is captured.

`--session-dir` points OMP at a scratch directory; the session JSONL written there records every rendered tool call, tool result, custom message, and model change, and is the durable record of a drive. PTY scrollback is a redraw stream dominated by status-bar repaints; use it to confirm transient status-bar lines and rendered labels, and the session JSONL for exact tool arguments and result text.

## Doctor

Before driving the TUI, run `bun run check`. In the TUI, send `/tools` and confirm `escalate`, `handoff`, `loop`, `goal`, and `xd://eng_orch` are present. A load error, missing tool, or duplicate-tool warning fails the health gate; do not continue with behavioral claims.

## Drive

Interact through the managed PTY, not internal function calls. Ask the agent to invoke one named tool with explicit arguments, then inspect the rendered result. Follow the recipe in each mapped feature file. `eng_orch` is an `xd://` device: the transcript shows it as a `write` to `xd://eng_orch` with the JSON arguments as content, and the tool result is the rendered JSON. Send each drive as one composer line; a multi-line paste stays in the composer without submitting. Several tool invocations can share one composer line; the agent runs them in order and the session JSONL keeps each call and result separate.

The expert model may call `handoff` on its own during a long drive (it did so mid-way through the repository-contracts recipe). That is the escalation feature working, not a failure: the drive continues on `eng_mode_easy`, and the transcript shows the `Handoff` invocation and the `You are the execution tier.` turn. Relaunch before recipes that require the launch model.

## Evidence

Capture:

- the exact extension revision and launch command;
- the successful tool inventory/health gate;
- the rendered invocation and result, from the session JSONL;
- each repeated turn;
- the terminal status proving the limit or explicit stop prevented another turn.

A unit-test transcript is supporting evidence, not a substitute for this TUI path. A model response that describes a call without a rendered tool invocation is not evidence.

## Cleanup

Where a loop recipe applies, invoke `loop` with `op: status` and confirm `{ "available": true, "enabled": false }` before shutdown. Stop the named managed PTY process and confirm that it exited. Copy the session JSONL out of the scratch session directory before removing anything. Remove only the disposable verification profile created for the run. Preserve captured transcripts and tool output.

## Feature map

- [Loop lifecycle](features/loop-lifecycle.md)
- [Durable goal objective](features/goal-objective.md)
- [Repository contract gate](features/repository-contracts.md)
- [Durable orchestration store](features/orchestration-store.md)
- [Automatic expert lens](features/expert-lens.md)
- [Model tier handoff and escalation](features/escalation.md)
- [Easy session pin](features/easy-mode.md)
