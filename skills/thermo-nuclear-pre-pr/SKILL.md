---
name: thermo-nuclear-pre-pr
description: Pre-PR panel seat. Apply thermo-nuclear-code-quality-review except the 1k-line cap. Use for thermo-nuclear-pre-pr or the Pre-PR thermo-nuclear seat.
disable-model-invocation: true
---

# Thermo-nuclear Pre-PR

One seat in the **Pre-PR gates** panel. Review the frozen SHA. Do not edit. Do not open a PR. Do not add tests. Do not remediate.

Read and apply `thermo-nuclear-code-quality-review` in full **except**:

- Drop the 1k-line cap.
- Do not fail on file length alone. File size may be a note, never an Act-on finding by itself.

Keep every other rule: ambitious code-judo simplification, no spaghetti-condition growth, no rubber-stamping working-but-messier code, direct over magical, type and boundary cleanliness, canonical-layer reuse, and the parent skill's approval bar minus file-length explosion.

The parent `thermo-nuclear-code-quality-review` skill remains the source rubric and a separate explicit-only review. This seat is the Pre-PR application of that rubric.

Return findings only. The lead synthesizes Interrogate buckets after the batch. This seat does not write receipts.
