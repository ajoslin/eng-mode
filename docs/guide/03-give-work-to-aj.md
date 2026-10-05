# Giving work and understanding code

A useful request has an outcome, known constraints, and a checkable finish condition. It does not prescribe steps the repository can answer.

A prompt can carry five things, each in a sentence:

- The goal. What is wrong, or what you want.
- The done check. It must be able to pass or fail. "Make it better" is not a check.
- The proof you want to see. Real command output, a video of the flow, the stored value, or a before-and-after number.
- What you already know. A symptom, a repro step, a log, or a link.
- The real constraints. "repro first", "don't change any code yet", "zero behavior change", "let me review before proceeding".

Leave out the how, and a list of skills. Leave out your theory of the cause until the agent restates the problem.

```text
Bug: The retry path writes duplicates. Reproduce, fix the cause, replay, show one record.
Investigation: Trace notification fan-out and determine whether lookup is N+1. No edits.
Design checkpoint: Add tenant preferences. Stop after domain shape and ownership.
Performance: Startup regressed from 900 ms to 1.8 s. Profile and show comparable measurements.
Cross-surface: Web and mobile must predict the same permission while the server stays authoritative. Verify both clients.
```

Name real invariants: byte-identical output, safe rolling deploys, zero old callers, or equivalent client behavior. Name the branch or PR fixed point when it matters.

Do not prescribe a chain of skills. Eng owns sequencing. Override only when needed: “investigate only” or “show design before implementation.”

For a noisy report, make the restatement the first step:

```text
/eng-mode read this thread. restate the underlying issue in your own words, in plain english. don't change any code yet.
```

A misreading shows up in the restatement, before any code exists.

## Before changing

Use the smallest method that establishes a correct model:

- `how`: current flow, types, ownership, and gotchas.
- `why`: historical rationale from code, PRs, tickets, docs, chat, and telemetry.
- `teach`: mechanics plus motivation, including the agent's own tradeoffs. "convince me it fixes the cause and not the symptom" turns the explanation into an argument you can check.
- `recall` or session pickup: inherit prior work without repeating it. In a fresh chat, `/recall` earlier work on the topic, then hand over the new input.

Start at a real entry point. Follow definitions, references, calls, persistence, and effects until the path closes. For broad systems, partition read-only exploration by genuine angles such as request path, state, persistence, clients, deployment, and proof. Scouts return evidence paths and one shared schema; the lead retains synthesis and product judgment.

When the subject changes, say "new task" and state the new outcome so Eng reroutes instead of extending stale work.