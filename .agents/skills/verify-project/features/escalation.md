# Model tier handoff and escalation

## Sub-features

An `/eng-mode` prompt starts the session on the `@panel_fable` model role at low thinking. The `handoff` tool ends the turn, switches the session to `@eng_mode_easy` at medium thinking, and starts a fresh turn on the cheap model; below 80k context tokens the conversation is kept intact, above it the conversation is compacted into the brief first. The `escalate` tool compacts the conversation on the cheap model, switches back to `@panel_fable`, and is terminal: a later `handoff` is refused. Calling a tool on its own tier returns `already on the … tier` with no side effects. Thirty tool calls on the expert tier without a `handoff` or a file edit render an `Exploration check` steer once. Two consecutive failing gate commands in `bash` on the cheap tier render an `Escalation check` steer. Escalation remains refused until that two-failure streak or forty cheap-tier tool calls, and then succeeds only when `evidence` quotes the most recent failed command and one rendered failure line.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. The disposable profile must resolve `eng_mode_easy` and `panel_fable`. Copy the workstation `config.yml` and `models.yml` into the profile's `agent/` directory before launch.

## Driving it with OMP TUI

1. Send `/eng-mode Reply exactly EXPERT_OK and stop.` Confirm the status bar model stays on the `panel_fable` model and the agent replies `EXPERT_OK`.
   Then send `Read package.json thirty-two times, one read call each, then reply DONE.` Confirm `◆ Exploration check` renders exactly once after the thirtieth call and the model answers it in its reply.
2. Send `Call the handoff tool with brief "run bun test ./nonexistent.test.ts twice, one call each, then report" and do nothing else.` Confirm the `Handoff` tool invocation renders, the status bar model changes to the `eng_mode_easy` model, and a new user turn beginning `You are the execution tier.` starts. Confirm its brief says to execute and fix failures, not to escalate for topic, scope, or expert review. The cheap model runs both commands (exit 1 each), then `◆ Escalation check` renders.
3. Ask the cheap model to call `escalate` first with evidence `needs expert review to ship`. Confirm the result starts with `refused: evidence must quote`. Then ask it to call `escalate` with evidence containing the exact failed command and one rendered failure line from step 2. Confirm the status bar returns to the `panel_fable` model and a user turn beginning `You are the expert tier.` is answered. Send `Call the handoff tool with brief "again" and report its exact result text.` Confirm the result starts with `refused`.

## Gotchas

When the session holds fewer than 20k context tokens, escalation skips compaction (OMP's `prepareCompaction` has nothing to summarize below `keepRecentTokens` and the TUI would render `Compaction failed`), so early escalations show no compaction entry. A handoff shows one only above 80k context tokens. Evidence must quote the exact `bash` command string and one rendered output line from that result. A missing-file `bun test` run currently renders `Test filter "./nonexistent.test.ts" had no matches` rather than `File not found`. Model switches persist for the rest of the session. Relaunch before other recipes that expect the launch model.
