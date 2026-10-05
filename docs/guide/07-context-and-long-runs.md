# Context and long runs

Context is a working set, not an archive.

- Compaction compresses an oversized conversation. `compact-adviser` (installed by `setup-eng-mode` when a TypeSafe key exists, mode `auto`) compacts at Jev-judged checkpoints; `/compact-adviser status` shows the key source and cooldown, `/compact-adviser hint` or `off` overrides the default.
- Checkpoint/rewind branches exploration; only conversation context rewinds, not files or processes.
- `artifact://` and `local://` hold large reports, matrices, and payloads behind stable references.
- Subagent handoffs return findings, evidence, decisions, and blockers—not transcripts.
- `goal` retains the outcome; `loop` owns bounded repetition; `todo` tracks finite steps.

A long run needs a falsifiable finish condition, clear permissions, isolated writers, checks after verifiable units, an evidence trail, a repetition bound, and an escape for genuine blockers. Keep the outcome in `goal`. Use `loop` only for repeated work when no command can wait for the event. “Work for four hours” is not a finish condition; “zero old callers, fixtures pass, old API deleted” is.

Leave a loop running alone only after all four hold:

- You have done the task once, or watched an agent do it, so you know what good looks like.
- The agent has the tools and signals you'd use yourself: the verification skill, the profiler, the logs.
- Every stage proves its work and can stop when the work misses the bar.
- You have read a few transcripts and turned repeated failures into tools, skills, or checks.

Until then, watch it.

To stop a run on purpose, tell the agent to pause, or that you're about to go offline or restart OMP. Pause safely finishes or backs out of the current step, commits a checkpoint, and writes a resume note. Session pickup starts from that note. "keep going" never triggers a pause.

For large repositories, keep one normalized subsystem inventory in an artifact. Delegate bulk reading by ownership. Reuse results rather than rereading. Before compaction or handoff, record fixed point, evidence, unresolved risks, and next executable action.