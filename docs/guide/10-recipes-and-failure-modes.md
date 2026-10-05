# Recipes and failure modes

```text
Understand: Trace the client entry point to persistence, including owner, shared types, and failures. No edits.
Restate: /eng-mode read this thread. restate the underlying issue in your own words, in plain english. don't change any code yet.
Design: Write the caller contract and package ownership. Compare distinct shapes; stop before implementation.
Prototype: /eng-mode prototype a few options. take screenshots or videos for me to compare.
Plan: /eng-mode turn this design into a plan. small verifiable PRs, each with its own proof.
Migrate: Move every caller, prove zero old references with LSP, delete the old API, run contract checks.
Audit: Partition by real subsystem ownership. Return one schema per subsystem and synthesize after all report.
Review: Interrogate this branch against intent. Read-only; bugs and regressions, no style nits.
Repro: /eng-mode repro this with verify-project. if it repros on main, fix it and show me a video as proof.
Number: /benchmark-checklist vet this speedup before it goes in the pr description.
Correct: /correct agents keep adding config flags without registering them in the schema.
Help: /eng-help which skill should i use to review this branch?
Prove-out: Blindly compare one organic task in sanitized environments with one judge calibration.
Learning: Capture an evidence-bearing candidate ticket. Do not create a rule yet.
```

`/eng-help` answers and hands you a prompt. It does not start the work. `/correct` lands the fix in the repo as architecture, a type, a lint, or a test.

## Failure modes

- “Use every agent”: no decomposition or ownership.
- “Make it better”: no finish condition.
- “Tests passed”: proxy evidence presented as product proof.
- “Ask if needed”: reversible work blocked on the human.
- “Keep the old API”: compatibility debt without a requirement.
- Leading with your theory of the cause: the agent searches wherever you pointed. Ask it to restate the problem first.
- Taking the first design: ask for prototypes or `/architect` and pick from evidence.
- Polishing an abstract plan: settle open questions with prototypes, then review what got built.
- Arena for coverage or swarm for competition: wrong selection policy.
- Hub messages to eval children: children are disposed.
- Concurrent writers in one tree: collisions and ambiguous ownership.
- Trusting an unvetted number: run `benchmark-checklist` before the number goes anywhere.
- Correcting the same mistake by hand: `/correct` fixes the repo so no later run repeats it.
- New enforcement from one incident: no replay, category, or false-positive evidence.
- Reading a whole monorepo: context spent without a traced question.
- Reporting an unobserved command: fabricated evidence.
- Editing a skill during unrelated product work: workflow change without independent evaluation.
- Looping before you trust the loop: get the verification skill working first.