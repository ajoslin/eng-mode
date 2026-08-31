### Autopilot-full

**Drive independent PRs through verified merge when the user grants merge authority.**

1. Mark operator-owned items. They stop at merge-ready. Execution begins only after an explicit go.
2. Current OMP isolated tasks apply completed output to the parent and cannot be revived. Do not fan out independent PR owners through task isolation. The root creates and checks out one clean PR branch at a time, then dispatches a one-shot non-isolated writer for implementation, non-browser proof, the project pre-commit pass, `no-comments`, and the decision trail.
3. After the writer yields, the root records the materialized head SHA and runs independent verification. Mapped browser/runtime proof is parent-sequential through the project verification contract (`verify-project`); code and policy review may swarm. No clean current-head verdict means no PR or merge.
4. The root runs **Opening a PR** with required evidence and then Babysit. A new head invalidates the verdict unless patch identity is unchanged; corrections use a fresh writer on that branch, followed by re-verification.
5. Finish one branch before checking out the next. Dependent changes route to Autopilot-stack.
6. With explicit full-autonomy authority, a clean current-head verdict, **and** Babysit's review-agent loop quiet on that SHA, merge through the selected forge provider. Dependent stacks route to Autopilot-stack. Operator-owned items wait.
7. For requested watching, keep the objective in `goal`. When no blocking provider wait owns the event, invoke `loop` with a prompt and limit. Each turn audits ownership, protocol, and trails; stop `loop` when its predicate passes. User stop sends immediate zero-writes instructions through `hub` and stops `loop`.

Report owner, PR, head SHA, verdict, merges, gates, and trail paths.
