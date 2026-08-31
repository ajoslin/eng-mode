### Pre-PR gates

**One panel, one synthesis, no reruns. Receipt-backed. Not Pullfrog. Not a merge gate.**

Opening a PR hard-stops unless a synthesis receipt exists at `.omp/pre-pr-gates/<sha>/synthesis.json` for the SHA the panel froze. Feature, Bug fix, Refactoring, and Autopilot one-shots inherit this because they open through Opening a PR.

1. Freeze `sha=$(git rev-parse HEAD)`. Seats review this SHA only. Do not invoke a forge open.
2. Dispatch **one** `task` for `pre-pr-swarm` on the frozen SHA and the same diff. No remediating before synthesis. No harsh-rerun loop. If the seat drops, continue and record the dropout.
3. Browser work lives on the `pre-pr-swarm` seat and runs only when the diff is UI. Otherwise that seat reports `browser: not-ui` and still reviews colocated logic. Do not attach OMP `browser` to a harness-owned private Chromium.
4. After the seat settles, the lead synthesizes every finding into Interrogate buckets. Deduplicate. Do not rerun the panel.

- **Act on.** Correctness, security, observable contract, or documented project invariant.
- **Consider.** Real concern; cost or timing unclear.
- **Noted.** Valid but not actionable now.
- **Dismissed.** Wrong, nit, or missing context. State why.

5. Write one receipt at `.omp/pre-pr-gates/<sha>/synthesis.json`. Do not commit it. Do not write `gate-{1,2,3}.json`.

```json
{
  "sha": "<frozen HEAD>",
  "seats": {
    "pre-pr-swarm": "ran"
  },
  "browser": "ran",
  "actOn": [],
  "consider": [],
  "noted": [],
  "dismissed": [],
  "remediate": "none",
  "headAfterRemediate": null,
  "ts": "<ISO-8601>"
}
```

   `browser` is `ran` or `not-ui`. A receipt is valid when `sha` is the frozen panel SHA and the four buckets are present.

**After.** Remediate the full synthesized Act-on set — one finding or many. Then return to Opening a PR. If that remediate changes `HEAD`, set `remediate` to `act-on` and `headAfterRemediate` to the new SHA. Do not rerun the panel. Consider / Noted / Dismissed do not block open. `interrogate` stays never-auto-apply and is not this panel. Pullfrog, CI, and Babysit do not substitute. Do not merge.
