### Hillclimb

**You own the metric and the experiment's integrity. Supervise and review; delegate the attempts.** For sustained, iterative improvement of one measurable thing against a target ("hillclimb on X", "make startup 50% faster", "systematically drive down <metric>", "keep trying until <metric> improves by N%"). A one-off fix is Bug fix or Perf issue; this is the loop.

Core discipline: one change, one measurement, keep or revert. Never stack untested changes, and never claim a win from code inspection. The data decides (the **prove-it-works** principle skill).

1. Ground the workload and architecture with `how`. Name realistic dimensions that move the result, choose a case that reproduces the complaint, and define the user's target. If no case reproduces it, fix the repro first.
2. Build a sensitive repeatable harness whose command prints one numeric metric. Sample enough to clear noise. Record the baseline and regression gate, then freeze the harness and its inputs.
3. Use a native goal for unattended persistence. If the operator starts `/loop`, give it an explicit iteration or duration bound and repeat the single-attempt brief; OMP repeats the prompt but does not own the metric or stop policy. The target includes both desired improvement and any minimum-attempt floor.
4. Open `show-me-your-work`. Log one row per iteration: id, hypothesis, change, before, after, delta, tests, verdict, note. Read it before each attempt.
5. Each iteration tests one mechanism-grounded hypothesis. A scoped `implementation-agent` may implement a precise attempt; use `judgment-agent` for subtle algorithms or concurrency. Race independent hypotheses as `local://` artifacts or sequential exclusive-branch attempts. Do not race competing writers with `isolated: true`.
6. Measure each candidate before and after with the frozen ruler and run the regression gate. Keep only movement beyond noise with behavior intact; otherwise revert that attempt in full. Never stack unmeasured changes.
7. Never edit the metric command, harness, workload, or baseline to improve the number. If the ruler no longer captures “better,” stop the current run, record why comparisons are no longer continuous, define the replacement ruler, and re-baseline before a new run.
8. After each measurement, the lead checks target, plateau, and bound. At target, complete the native goal and tell the operator to `/loop stop` if needed. At plateau, pivot mechanisms without weakening the ruler; at the declared bound, stop and report. Never continue through an unbounded handwritten loop.
9. Run Opening a PR with accepted commits ordered by measured contribution.

**Reply:** the metric and target, baseline to final with the percent delta, iterations run (kept vs reverted), each accepted fix on one line, the decision-trail path from `show-me-your-work`, and the best idea you would try next if pushed further.
