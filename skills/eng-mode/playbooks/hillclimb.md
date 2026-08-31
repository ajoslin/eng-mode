### Hillclimb

**You own the metric and the experiment's integrity. Supervise and review; delegate the attempts.** For sustained, iterative improvement of one measurable thing against a target ("hillclimb on X", "make startup 50% faster", "systematically drive down <metric>", "keep trying until <metric> improves by N%"). A one-off fix is Bug fix or Perf issue; this is the loop.

Core discipline: one change, one measurement, keep or revert. Never stack untested changes, and never claim a win from code inspection. The data decides (the **prove-it-works** principle skill).

1. Ground the workload and architecture with `how`. Name realistic dimensions that move the result, choose a case that reproduces the complaint, and define the user's target. If no case reproduces it, fix the repro first.
2. Build a sensitive repeatable harness whose command prints one numeric metric. Sample enough to clear noise. Record the baseline and regression gate, then freeze the harness and its inputs.
3. Invoke `goal` for the improvement outcome. Invoke `loop` with a prompt naming the frozen metric predicate and a limit. Use a blocking watcher instead when the measurement command itself waits. The target includes both desired improvement and any minimum-attempt floor.
4. Open `show-me-your-work`. Log one row per iteration: id, hypothesis, change, before, after, delta, tests, verdict, note. Read it before each attempt.
5. Each iteration tests one mechanism-grounded hypothesis. Delegate the attempt; the lead reviews the diff. Race independent hypotheses as `local://` artifacts or sequential exclusive-branch attempts. Do not race competing writers with `isolated: true`.
6. Measure each candidate before and after with the frozen ruler and run the regression gate. Keep only movement beyond noise with behavior intact; otherwise revert that attempt in full. Never stack unmeasured changes.
7. Never edit the metric command, harness, workload, or baseline to improve the number. If the ruler no longer captures “better,” stop the current run, record why comparisons are no longer continuous, define the replacement ruler, and re-baseline before a new run.
8. After each measurement, the lead checks target, plateau, and limit. At target, record the measured evidence, stop `loop`, then complete `goal`. At plateau, record `no_progress` in the decision trail and pivot mechanisms without weakening the ruler; at the limit, OMP stops `loop` and the lead reports. Never continue through an unbounded handwritten loop.
9. Run Opening a PR with accepted commits ordered by measured contribution.

**Reply:** the metric and target, baseline to final with the percent delta, iterations run (kept vs reverted), each accepted fix on one line, the decision-trail path from `show-me-your-work`, and the best idea you would try next if pushed further.
