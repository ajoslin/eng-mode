---
name: thermo-nuclear-pre-pr
description: Serial Pre-PR gate 3. Apply thermo-nuclear-code-quality-review except the 1k-line cap; remediate. Use for thermo-nuclear-pre-pr, pre-PR gate 3, or a remediating thermo-nuclear pass before opening a PR.
disable-model-invocation: true
---

# Thermo-nuclear Pre-PR

Gate 3 of **Pre-PR gates**. Remediate. Do not open a PR. Do not add tests; proof tests belong to `meaningful-contribution`.

Read and apply `thermo-nuclear-code-quality-review` in full **except**:

- Drop the 1k-line cap.
- Do not fail on file length alone. File size may be a note, never a blocker or a harsh-count finding by itself.

Keep every other rule: ambitious code-judo simplification, no spaghetti-condition growth, no rubber-stamping working-but-messier code, direct over magical, type and boundary cleanliness, canonical-layer reuse, and the parent skill's approval bar minus file-length explosion.

This skill remediates. The parent `thermo-nuclear-code-quality-review` skill remains a separate explicit-only rubric and does not write receipts.

## Harsh / rerun

After remediate, the pass is **harsh** when any blocker remains or high-conviction findings exceed 3. Rerun this same gate. Max 3 passes per SHA. Exhaustion is a hard-stop; do not write a passing receipt.

A passing pass writes the gate-3 receipt the Pre-PR gates playbook specifies. A SHA-changing remediation voids older receipts.
