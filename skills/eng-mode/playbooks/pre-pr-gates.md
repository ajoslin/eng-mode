### Pre-PR gates

**Serial remediating quality gates before any PR open. Receipt-backed. Not Pullfrog. Not a merge gate.**

Opening a PR hard-stops unless current `HEAD` has three passing receipts at `.omp/pre-pr-gates/<sha>/gate-{1,2,3}.json`. Feature, Bug fix, Refactoring, and Autopilot one-shots inherit this because they open through Opening a PR.

1. Resolve `sha=$(git rev-parse HEAD)`. Do not call `github` or `pr://` open.
2. Run gates **1 → 2 → 3**. Skip a gate only when a valid passing receipt already exists for this exact `sha`.
3. Each gate: read its skill and run one pass, then remediate, then recheck. After remediate, the pass is **harsh** when any blocker remains or high-conviction findings exceed 3; rerun the **same** gate. Max 3 passes per gate per SHA. Exhaustion is a hard-stop.
4. Write a passing receipt only after a non-harsh pass, at `.omp/pre-pr-gates/<sha>/gate-<n>.json`:

```json
{
  "gate": 1,
  "skill": "pre-pr-swarm",
  "sha": "<full HEAD>",
  "status": "pass",
  "pass": 1,
  "blocker": 0,
  "highConviction": 2,
  "remediated": true,
  "ts": "<ISO-8601>"
}
```

   A receipt is valid only when `status` is `pass`, `sha` equals current `HEAD`, and `gate` matches the filename. Do not commit receipts.
5. A SHA-changing remediation voids every receipt for the previous `HEAD`. Restart at gate 1 on the new `HEAD`. After 3 full serial restarts without all three current-`HEAD` receipts, hard-stop.
6. Gate map: `1` `pre-pr-swarm`; `2` `meaningful-contribution`; `3` `thermo-nuclear-pre-pr`. `interrogate` stays never-auto-apply and is not a gate. These gates remediate. Pullfrog, CI, and Babysit do not substitute.
7. Return to Opening a PR only when all three receipts exist for current `HEAD`. Do not merge.
