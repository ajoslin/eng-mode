---
name: pre-pr-swarm
description: Pre-PR panel seat. Adversarial swarm, simplified colocated logic, no extra tests. Browser via verify-project only when the diff is UI. Use for pre-pr-swarm or the Pre-PR swarm seat.
disable-model-invocation: true
---

# Pre-PR swarm

One seat in the **Pre-PR gates** panel. Review the frozen SHA. Do not edit. Do not open a PR. Do not add tests. Do not remediate.

## Review

1. Diff the frozen SHA against the real fixed point. Include surrounding files reviewers need.
2. Fan out one adversarial `swarm` over this seat's angles: correctness and **simplified colocated logic** (keep related behavior next to its owner; delete incidental branches, wrappers, and scattered special cases; do not add layers to look modular). Reviewers do not edit.
3. **Browser.** Only if the diff is UI: prove mapped web behavior through `verify-project` after its health gate. Failed health gate, unmapped path, shared stack, or wrong surface is `INCONCLUSIVE`. If the diff is not UI, skip browser and report `not-ui`. Do not attach OMP `browser` to a harness-owned private Chromium.
4. Return findings only. No extra tests. The lead synthesizes Interrogate buckets after the batch.

This seat does not write receipts. The playbook writes `.omp/pre-pr-gates/<sha>/synthesis.json`.
