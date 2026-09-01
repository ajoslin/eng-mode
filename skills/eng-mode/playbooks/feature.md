### Feature

**You own the design. Plan, review, and verify. Delegate implementation; stay in the lead.**

1. Restate the outcome in the project's domain language. Read relevant `CONTEXT.md` and nearby ADRs, then use `how` to trace each unfamiliar subsystem the feature touches.
2. Read `domain-modeling`. Name the canonical data shape, its owner, invariants, transitions, boundaries, and changed terminology before implementation.
3. Run `architect` for every feature. If it genuinely adds no design value, keep `architect skipped: <reason>` in the final report. Never fold the design decision silently into implementation. For an empirical behavior or state-model fork, run `prototype`. If multiple valid shapes remain, use `arena` to compare complete alternatives. Record the result in the alternatives table below.
4. Write the throughput checkpoint as four todo items. Keep every item; use `n/a: <reason>` rather than dropping one:
   - **Blocking first steps.** Finish gates before fan-out.
   - **Independent workstreams.** Parallelize disjoint files, subsystems, or layers whose merged union is intended.
   - **Shared mutable state.** Split the write target first. Serialize only when one shared writer is a real invariant.
   - **Smallest safe decomposition.** Name the smallest coherent slices. If one worker is safest, state why.
5. Give implementation to a typed agent with exact file and symbol scope, the canonical data shape and organizing structure, caller migrations, and observable success criteria. The lead reads the resulting diff against the brief and source before accepting it. Keep code-coupled work, such as one feature or migration, under one owner. That owner may fan out independent work only after the blocking gate. Parent-level fan-out is for independent artifacts, investigations, or experiments.
6. Implement the smallest end-to-end slice. Apply the stack-specific and test-law skills that `project-standards` names. Migrate every caller and delete obsolete paths; do not leave compatibility routes.
7. Prove user-visible behavior on the actual surface through `verify-project` where mapped. Wrong-surface, failed-health-gate, unmapped-path, or shared-stack evidence is `INCONCLUSIVE`. Add a permanent test only for an uncovered observable contract.
8. Build, verify, and commit each small unit before the next, following `principle-sequence-verifiable-units`. Rewrite the throughput checkpoint at each phase boundary and assign a fresh owner rather than chaining interrupts across phases.
9. If the design remains contested, run `interrogate` before delivery. The lead decides what to apply and reviews the final diff.
10. Update `CONTEXT.md` inline only when domain terms changed. Create an ADR only when all three `domain-modeling` ADR tests pass.
11. Run the pre-commit pass `project-standards` names, then the required review. If delivery includes a PR, run **Opening a PR**; it owns forge and stack delivery through the selected provider.

**Alternatives**

| Alternative | Canonical shape and seam | Why chosen or rejected | Open decision |
|---|---|---|---|

**Reply:** what you built; what you chose and why; user impact; maintainer shape; implementation owner and fan-out; diff review; verification and commit sequence; contested-design review; open decisions; `architect skipped: <reason>` when applicable; and the completed alternatives table.
