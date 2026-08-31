# Context and long runs

Context is a working set, not an archive.

- Compaction compresses an oversized conversation.
- Checkpoint/rewind branches exploration; only conversation context rewinds, not files or processes.
- `artifact://` and `local://` hold large reports, matrices, and payloads behind stable references.
- Subagent handoffs return findings, evidence, decisions, and blockers—not transcripts.
- `goal` retains the outcome; `loop` owns bounded repetition; `todo` tracks finite steps.

A long run needs a falsifiable finish condition, clear permissions, isolated writers, checks after verifiable units, an evidence trail, a repetition bound, and an escape for genuine blockers. Keep the outcome in `goal`. Use `loop` only for repeated work when no command can wait for the event. “Work for four hours” is not a finish condition; “zero old callers, fixtures pass, old API deleted” is.

For large repositories, keep one normalized subsystem inventory in an artifact. Delegate bulk reading by ownership. Reuse results rather than rereading. Before compaction or handoff, record fixed point, evidence, unresolved risks, and next executable action.