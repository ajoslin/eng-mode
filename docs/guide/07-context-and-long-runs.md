# Context and long runs

Context is a working set, not an archive.

- Compaction compresses an oversized conversation.
- Checkpoint/rewind branches exploration; only conversation context rewinds, not files or processes.
- `artifact://` and `local://` hold large reports, matrices, and payloads behind stable references.
- Subagent handoffs return findings, evidence, decisions, and blockers—not transcripts.
- Goal retains the durable outcome; todo exposes finite current steps.

A long run needs a falsifiable finish condition, permissions and forbidden actions, writer isolation, checks after verifiable units, a decision/evidence trail, and a genuine-blocker escape. “Work for four hours” is not a finish condition; “zero old callers, fixtures pass, old API deleted” is.

For large repositories, keep one normalized subsystem inventory in an artifact. Delegate bulk reading by ownership. Reuse results rather than rereading. Before compaction or handoff, record fixed point, evidence, unresolved risks, and next executable action.