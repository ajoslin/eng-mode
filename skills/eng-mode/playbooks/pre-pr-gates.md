### Pre-PR gates

**One seat, one question, one synthesis, no reruns. Receipt-backed. Not Pullfrog. Not a merge gate.**

Opening a PR hard-stops unless a synthesis receipt exists at `.omp/pre-pr-gates/<sha>/synthesis.json` for the SHA the seat froze. Feature, Bug fix, Refactoring, and Autopilot one-shots inherit this because they open through Opening a PR.

1. Freeze `sha=$(git rev-parse HEAD)`. The seat reviews this SHA only. Do not invoke a forge open.
2. **Skip when the diff cannot hide a behavioral defect.** Docs-only, comment-only, or e2e-test-only diffs that already passed the Standards + Spec review skip the seat. Write the receipt with `"fresh-eyes": "skipped"` and the reason. Everything else runs the seat.
3. **Name the question.** Write the one failure class you judge riskiest for this diff, concretely, before dispatching. If you cannot name one, the diff is not ready to review.
4. Dispatch **one** `task` to a registered agent, `reviewer` by default, or `judgment-agent` for concurrency or algorithmic risk, with the `fresh-eyes` skill and the brief it requires: frozen SHA, base, diff command, the question. Eight-minute cap. No remediating before synthesis. No harsh-rerun loop. If the seat drops, record `"fresh-eyes": "dropped"` and continue.
5. No browser on this seat. Product proof runs through `verify-project` before this gate. A UI diff without that proof is not ready to open.
6. After the seat settles, synthesize every finding into Interrogate buckets. Deduplicate. Do not rerun the seat.

- **Act on.** Correctness, security, observable contract, or documented project invariant.
- **Consider.** Real concern, cost or timing unclear.
- **Noted.** Valid but not actionable now.
- **Dismissed.** Wrong, nit, or missing context. State why.

7. Write one receipt at `.omp/pre-pr-gates/<sha>/synthesis.json`. Do not commit it.

```json
{
  "sha": "<frozen HEAD>",
  "seats": {
    "fresh-eyes": "ran"
  },
  "question": "<the one question asked>",
  "answer": "holds",
  "actOn": [],
  "consider": [],
  "noted": [],
  "dismissed": [],
  "remediate": "none",
  "headAfterRemediate": null,
  "ts": "<ISO-8601>"
}
```

   `seats.fresh-eyes` is `ran`, `skipped`, or `dropped`. `answer` is `holds` or `fails`. Omit both `question` and `answer` when skipped or dropped. A receipt is valid when `sha` is the frozen SHA and the four buckets are present.

**After.** Remediate the full synthesized Act-on set, one finding or many. Then return to Opening a PR. If that remediate changes `HEAD`, set `remediate` to `act-on` and `headAfterRemediate` to the new SHA. Do not rerun the seat. Consider / Noted / Dismissed do not block open. `interrogate` stays never-auto-apply and is not this gate. Pullfrog, CI, and Babysit do not substitute. Do not merge.
