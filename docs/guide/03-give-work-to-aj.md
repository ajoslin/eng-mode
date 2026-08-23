# Giving work and understanding code

A useful request has an outcome, known constraints, and a checkable finish condition. It does not prescribe steps the repository can answer.

```text
Bug: The retry path writes duplicates. Reproduce, fix the cause, replay, show one record.
Investigation: Trace notification fan-out and determine whether lookup is N+1. No edits.
Design checkpoint: Add tenant preferences. Stop after domain shape and ownership.
Performance: Startup regressed from 900 ms to 1.8 s. Profile and show comparable measurements.
Cross-surface: Web and mobile must predict the same permission while the server stays authoritative. Verify both clients.
```

Name real invariants: byte-identical output, safe rolling deploys, zero old callers, or equivalent client behavior. Name the branch or PR fixed point when it matters.

Do not prescribe a chain of skills. Eng owns sequencing. Override only when needed: “investigate only” or “show design before implementation.”

## Before changing

Use the smallest method that establishes a correct model:

- `how`: current flow, types, ownership, and gotchas.
- `why`: historical rationale from code, PRs, tickets, docs, chat, and telemetry.
- `teach`: mechanics plus motivation.
- `recall` or session pickup: inherit prior work without repeating it.

Start at a real entry point. Follow definitions, references, calls, persistence, and effects until the path closes. For broad systems, partition read-only exploration by genuine angles such as request path, state, persistence, clients, deployment, and proof. Scouts return evidence paths and one shared schema; the lead retains synthesis and product judgment.

When the subject changes, state the new outcome so Eng reroutes instead of extending stale work.