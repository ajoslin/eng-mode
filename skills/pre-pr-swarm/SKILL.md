---
name: pre-pr-swarm
description: Serial Pre-PR gate 1. Adversarial swarm, simplified colocated logic, no extra tests, verify-project browser proof. Use for pre-pr-swarm, pre-PR gate 1, or adversarial swarm before opening a PR.
disable-model-invocation: true
---

# Pre-PR swarm

Gate 1 of **Pre-PR gates**. Remediate. Do not open a PR. Do not add tests; proof tests belong to `meaningful-contribution`.

## Pass

1. Diff against the real fixed point. Include surrounding files reviewers need.
2. Fan out one `swarm` batch of adversarial reviewers (`comment-sicko`, panel seats, or `reviewer` / `security-reviewer` as the change warrants). Partition by genuine angles: correctness, colocated-logic simplification, and mapped product surface. The lead remediates; reviewers do not edit.
3. Prefer **simplified colocated logic**: keep related behavior next to its owner and delete incidental branches, wrappers, and scattered special cases. Do not add layers to look modular.
4. Prove mapped web behavior through `verify-project` after its health gate. Do not attach OMP `browser` to a harness-owned private Chromium. Failed health gate, unmapped path, shared stack, or wrong surface is `INCONCLUSIVE`. Other surfaces use the real program, `debug`, or LSP as Eng Mode already requires.
5. Apply remediations. Recheck the same angles.

## Harsh / rerun

After remediate, the pass is **harsh** when any blocker remains or high-conviction findings exceed 3. Rerun this same gate. Max 3 passes per SHA. Exhaustion is a hard-stop; do not write a passing receipt.

A passing pass writes the gate-1 receipt the Pre-PR gates playbook specifies. A SHA-changing remediation voids older receipts.
