# Context and long runs

Context is a working set, not an archive.

- Compaction compresses an oversized conversation. `compact-adviser` (installed by `setup-eng-mode` when a TypeSafe key exists, mode `auto`) compacts at Jev-judged checkpoints; `/compact-adviser status` shows the key source and cooldown, `/compact-adviser hint` or `off` overrides the default.
- Checkpoint/rewind branches exploration; only conversation context rewinds, not files or processes.
- `artifact://` and `local://` hold large reports, matrices, and payloads behind stable references.
- Subagent handoffs return findings, evidence, decisions, and blockers—not transcripts.
- `goal` retains the outcome; `loop` owns bounded repetition; `todo` tracks finite steps.

A long run needs a falsifiable finish condition, clear permissions, isolated writers, checks after verifiable units, an evidence trail, a repetition bound, and an escape for genuine blockers. Keep the outcome in `goal`. Use `loop` only for repeated work when no command can wait for the event. “Work for four hours” is not a finish condition; “zero old callers, fixtures pass, old API deleted” is.

For large repositories, keep one normalized subsystem inventory in an artifact. Delegate bulk reading by ownership. Reuse results rather than rereading. Before compaction or handoff, record fixed point, evidence, unresolved risks, and next executable action.

## Experimental relevance filtering

jev-sift is an opt-in experimental MCP companion. It classifies candidate content before a larger model reads it. `compact-adviser` decides when to compact conversation history. Installing one does not replace or enable the other.

To opt in from this checkout, provide `JEV_API_KEY` or `TYPESAFE_API_KEY` and run `bun run jev-sift`. The installer also accepts `~/.config/jev-sift/api-key`. It registers the `jev-sift` stdio MCP server without writing the key into MCP configuration. Restart OMP after setup. Without a key, setup removes only the `jev-sift` MCP entry.

Treat relevance scores as advice. A rejected file may still contain a required dependency or constraint. Keep checkpoint and rewind for exploration, and read uncertain candidates before making a correctness claim.

See the [spike methodology and recommendation criteria](../notes/jev-sift-spike.md) and [evaluation results](../notes/jev-sift-eval-results.md). The live trial supports opt-in use for further testing, not a default threshold or automatic filtering.