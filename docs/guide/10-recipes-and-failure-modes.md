# Recipes and failure modes

```text
Understand: Trace the client entry point to persistence, including owner, shared types, and failures. No edits.
Design: Write the caller contract and package ownership. Compare distinct shapes; stop before implementation.
Migrate: Move every caller, prove zero old references with LSP, delete the old API, run contract checks.
Audit: Partition by real subsystem ownership. Return one schema per subsystem and synthesize after all report.
Review: Interrogate this branch against intent. Read-only; bugs and regressions, no style nits.
Prove-out: Blindly compare one organic task in sanitized environments with one judge calibration.
Learning: Capture an evidence-bearing candidate ticket. Do not create a rule yet.
```

## Failure modes

- “Use every agent”: no decomposition or ownership.
- “Make it better”: no finish condition.
- “Tests passed”: proxy evidence presented as product proof.
- “Ask if needed”: reversible work blocked on the human.
- “Keep the old API”: compatibility debt without a requirement.
- Arena for coverage or swarm for competition: wrong selection policy.
- Hub messages to eval children: children are disposed.
- Concurrent writers in one tree: collisions and ambiguous ownership.
- New enforcement from one incident: no replay, category, or false-positive evidence.
- Reading a whole monorepo: context spent without a traced question.
- Reporting an unobserved command: fabricated evidence.
- Editing a skill during unrelated product work: workflow change without independent evaluation.