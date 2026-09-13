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

The disposable profile must resolve the selected model, the `@tiny` classifier role, and `eng_mode_easy`. The profile lives at `~/.omp/profiles/<profile-name>/agent/`; copy the workstation `~/.omp/agent/config.yml` and `models.yml` there before launch. A disposable profile has no broker credentials. Export the `@tiny` provider's API key into the launch environment without recording the value. When `@tiny` is an OpenRouter model, use `OPENROUTER_API_KEY="$(omp token openrouter)"`. Readiness is the OMP composer accepting input. Stop only the managed process that this run started. Remove the disposable profile after evidence is captured.

## Doctor

Before driving the TUI, run `bun run check`. In the TUI, send `/tools` and confirm `loop`, `goal`, and `xd://eng_orch` are present. A load error, missing tool, or duplicate-tool warning fails the health gate; do not continue with behavioral claims.

## Drive

Interact through the managed PTY, not internal function calls. Ask the agent to invoke one named tool with explicit arguments, then inspect the rendered result. Follow the recipe in each mapped feature file. `eng_orch` is an `xd://` device: the transcript shows it as a `write` to `xd://eng_orch` with the JSON arguments as content, and the tool result is the rendered JSON. Send each drive as one composer line; a multi-line paste stays in the composer without submitting.

## Evidence

Capture:

- the exact extension revision and launch command;
- the successful tool inventory/health gate;
- the rendered invocation and result;
- each repeated turn;
- the terminal status proving the limit or explicit stop prevented another turn.

The managed PTY log is a redraw stream: grep it for exact rendered strings and status-bar notices, but do not treat it as a transcript. The structured transcript is the profile's session file at `~/.omp/profiles/<profile-name>/agent/sessions/<cwd-slug>/<timestamp>_<id>.jsonl`. It records each tool call with its arguments, each tool result verbatim, `custom_message` entries with their `customType`, and `model_change`/`thinking_level_change` events. Copy that file out of the profile before Cleanup removes it.

A unit-test transcript is supporting evidence, not a substitute for this TUI path. A model response that describes a call without a rendered tool invocation is not evidence.

## Cleanup

Where a loop recipe applies, invoke `loop` with `op: status` and confirm `{ "available": true, "enabled": false }` before shutdown. Stop the named managed PTY process and confirm that it exited. Copy the session transcript out first, then remove only the disposable verification profile created for the run. Preserve captured transcripts and tool output.

## Feature map

- [Loop lifecycle](features/loop-lifecycle.md)
- [Durable goal objective](features/goal-objective.md)
- [Repository contract gate](features/repository-contracts.md)
- [Durable orchestration store](features/orchestration-store.md)
- [Automatic expert lens](features/expert-lens.md)
- [Easy mode](features/easy-mode.md)
