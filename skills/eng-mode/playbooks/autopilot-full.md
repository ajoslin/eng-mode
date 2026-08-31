### Autopilot-full

**Drive independent PRs through verified merge when the user grants merge authority.**

1. Mark operator-owned items. They stop at merge-ready. Execution begins only after an explicit go.
2. Run owners in true parallel and never stack. Many owners at once when PRs are self-contained: one writer per branch, disjoint files, cross-PR drift absorbed by rebase. Only genuinely overlapping work serializes. Current OMP isolated tasks apply completed output to the parent and cannot be revived, so PR owners are one-shot non-isolated writers that create and push their own exclusive branches before yielding. Each writer owns implementation, non-browser proof, the project pre-commit pass, `no-comments`, and the decision trail.
3. As each writer yields, the root records that PR's materialized head SHA and starts independent verification without waiting for sibling PRs. Mapped browser/runtime proof is parent-sequential through the project verification contract (`verify-project`); code and policy review may swarm. No clean current-head verdict means no PR or merge.
4. For each verified PR, the root runs **Opening a PR** with required evidence and then Babysit while unrelated owners continue. A new head invalidates the verdict unless patch identity is unchanged; corrections use a fresh writer on that branch, followed by re-verification.
5. An owner that merges or reaches merge-ready takes the next self-contained item from the queue. Dependent changes route to Autopilot-stack.
6. With explicit full-autonomy authority, a clean current-head verdict, **and** Babysit's review-agent loop quiet on that SHA, merge through the selected forge provider. Dependent stacks route to Autopilot-stack. Operator-owned items wait.
7. For requested watching, keep the objective in `goal`. When no blocking provider wait owns the event, invoke `loop` with a prompt and limit. Each turn audits ownership, protocol, and trails; stop `loop` when its predicate passes. User stop sends immediate zero-writes instructions through `hub` and stops `loop`.

Report owner, PR, head SHA, verdict, merges, gates, and trail paths.
