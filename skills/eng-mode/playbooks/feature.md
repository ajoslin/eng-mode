### Feature

1. Restate the outcome in the project's domain language. Read relevant `CONTEXT.md`, nearby ADRs, and use `how` to trace each unfamiliar subsystem the feature touches.
2. Read `domain-modeling` while naming canonical data shape, ownership, invariants, transitions, boundaries, and any changed domain terminology.
3. For a changed module interface, run `architect`; otherwise record `architect skipped: <reason>`. The skip is the audit that the design was not folded into implementation. For an empirical fork, run `prototype`.
4. Set the throughput checkpoint with four items: blocking first steps; independent workstreams; shared mutable state; smallest safe decomposition. Keep every item; write `n/a: <reason>` when it does not apply. Keep coherent work local; delegate only independent slices.
5. Implement the smallest end-to-end slice. Apply the stack-specific and test-law skills that `project-standards` names, where applicable. Migrate callers and delete obsolete paths.
6. Prove user-visible behavior on the actual surface. Wrong-surface, failed health gate, unmapped path, or shared-stack evidence is `INCONCLUSIVE`. Add a permanent test only for an uncovered observable contract.
7. Update `CONTEXT.md` inline only when domain terms changed. Create an ADR only when all three `domain-modeling` ADR tests pass.
8. Run the pre-commit pass `project-standards` names, then appropriate review. If delivery includes a PR, run **Opening a PR**; it owns GitHub and stack delivery through the tooling skills `project-standards` names.
9. Report user impact, maintainer shape, decisions, evidence, and review.
