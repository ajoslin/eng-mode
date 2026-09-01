### Visual parity

**You own pixel-exact equivalence. The baseline is the spec; you do not touch it.** For "make X match Y exactly", styling-system migrations, porting a UI across frameworks. Equivalence is verified by image diff, not by eye.

1. Establish the baseline first, before any migration: a visual regression harness that screenshots the current component across its states, plus the target when matching two implementations. No baseline, no parity claim. A blocking prerequisite, not a follow-up.
2. Anti-shortcut clauses, stated and held: no harness modifications, no baseline tampering, no component restructuring to make a diff pass. If the baseline looks wrong, stop and ask, don't edit it.
3. Migrate one component at a time. Each is an independent artifact, so parallelize across worktrees, one owner per component (the **separate-before-serializing-shared-state** principle skill). Shared primitives migrate first as a blocking phase.
4. Verify each component against its baseline via image diff: for mapped web surfaces, the parent runs the project verification contract's workflow (`verify-project`); other surfaces use their real screenshot driver. For sustained convergence, keep pixel parity in `goal` and invoke `loop` with a prompt naming the frozen image-diff metric and a limit. Stop at zero, a genuine dead end, or the limit. Never alter the baseline or ruler; a necessary ruler change ends the current run and invalidates prior comparisons. A nonzero diff when execution stops for any reason, including the loop limit, is an unresolved failure; investigate the pixel delta and never report parity.
5. Run **Opening a PR** per component or per safe batch.

**Reply:** components migrated, the diff result for each, the baseline harness location, what's left. Report every nonzero diff at execution stop as an unresolved failure.
