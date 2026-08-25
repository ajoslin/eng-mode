---
name: meaningful-contribution
description: Serial Pre-PR gate 2. Proven working code, revert-fail proof tests, honest names. Use for meaningful-contribution, pre-PR gate 2, or the bdsqqq meaningful contribution bar.
disable-model-invocation: true
---

# Meaningful contribution

Gate 2 of **Pre-PR gates**. Remediate. This is the only Pre-PR gate allowed to add proof tests. Do not open a PR.

Source bar: [bdsqqq meaningful contribution](https://gist.github.com/bdsqqq/1e7e6f454271d5f856a1176d0e800d89). A contribution is proven working code, not a patch that happens to compile.

## Pass

1. **Seen it work.** Run the changed behavior on the real artifact. Mapped web uses `verify-project`. A look at the diff is not proof.
2. **Proof tests.** For each meaningful behavior you just ran, add or reuse an automated test at a correct public seam. Then revert the implementation (keep the test), watch that test fail, restore the implementation, and watch it pass. No revert-fail means the test does not prove the change. Follow the project test law `project-standards` names.
3. **Edges.** Name what happens off the happy path, including the worst path. Cover those contracts or record why they are unreachable.
4. **Honest names and types.** Names are contracts. Types tell the truth. A name that needs "actually it's Y" is a lie; rename or reshape. Abstractions must fit the surrounding model.
5. Apply remediations. Recheck proof, revert-fail, edges, and names.

## Does not pass

- Missing revert-fail evidence
- Tests that stay green when the change is reverted
- Lying names, optional/cast soup that hides the invariant
- PR-shaped summaries with no observed run
- Shifting proof burden onto reviewers

## Harsh / rerun

After remediate, the pass is **harsh** when any blocker remains or high-conviction findings exceed 3. Rerun this same gate. Max 3 passes per SHA. Exhaustion is a hard-stop; do not write a passing receipt.

A passing pass writes the gate-2 receipt the Pre-PR gates playbook specifies. A SHA-changing remediation voids older receipts.
