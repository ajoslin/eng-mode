---
name: meaningful-contribution
description: Pre-PR panel seat. Proven working code, revert-fail proof, honest names. Use for meaningful-contribution, the Pre-PR contribution seat, or the bdsqqq meaningful contribution bar.
disable-model-invocation: true
---

# Meaningful contribution

One seat in the **Pre-PR gates** panel. Review the frozen SHA. Do not edit. Do not open a PR. Do not remediate. Do not add tests during the panel; flag missing proof so the lead can Act on the synthesized set after the batch.

Source bar: [bdsqqq meaningful contribution](https://gist.github.com/bdsqqq/1e7e6f454271d5f856a1176d0e800d89). A contribution is proven working code, not a patch that happens to compile.

## Review

1. **Seen it work.** Has the changed behavior been run on the real artifact? A look at the diff is not proof.
2. **Revert-fail.** For each meaningful behavior, is there an automated test at a correct public seam that fails when the implementation is reverted and passes when restored? No revert-fail means the test does not prove the change. Follow the project test law `project-standards` names when judging seams.
3. **Edges.** Are off-happy-path and worst-path contracts named and covered, or recorded as unreachable?
4. **Honest names and types.** Names are contracts. Types tell the truth. A name that needs "actually it's Y" is a lie.

## Flag

- Missing revert-fail evidence
- Tests that would stay green if the change were reverted
- Lying names, optional/cast soup that hides the invariant
- PR-shaped summaries with no observed run
- Shifting proof burden onto reviewers

Return findings only. The lead synthesizes Interrogate buckets after the batch. This seat does not write receipts.
