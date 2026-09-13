# Loop lifecycle

## Sub-features

Start, inspect, pause, resume, and stop one bounded loop. Verify automatic shutdown at the iteration limit.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. Instruct the agent to invoke `loop` with `op: start`, a prompt such as `Reply exactly LOOP_TICK`, and `limit: "2"`, then reply `LOOP_TICK` after the tool starts.

## Driving it with OMP TUI

1. Start the loop. Confirm the rendered result shows `enabled: true`, `state: "running"`, the prompt, and `limit: { kind: "iterations", initial: 2, remaining: 2 }`. The status bar shows `Loop running N/2` while the loop is active; that counter is a status-bar line, not a transcript message.
2. Count the initial response and two bounded continuations. Capture three `LOOP_TICK` responses in total, followed by `Loop limit reached. Loop mode disabled.`. That notice is a transient status-bar line, not a transcript message; capture the terminal output when it appears.
3. Invoke `loop` with `op: status`. Confirm the rendered result is `{ "available": true, "enabled": false }`.
4. In one agent turn, start another bounded loop and invoke `pause` immediately before yielding control. Confirm `state: "paused"` and `prompt: null`.
5. Invoke `resume` with a replacement prompt. Confirm `state: "running"` and the replacement prompt.
6. Invoke `stop`, then `status`. Confirm both render `{ "available": true, "enabled": false }`.

## Gotchas

Pause clears the prompt, so `resume` requires a new `prompt`. The limit counts continuations after the initial response. In the session transcript the loop-driven continuations appear as plain `user` messages carrying the loop prompt. Stop any active loop before cleanup, then remove the disposable profile.
