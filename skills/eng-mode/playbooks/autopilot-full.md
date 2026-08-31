### Autopilot-full

**Drive independent PRs through verified merge when the user grants merge authority.**

1. Mark operator-owned items. They stop at merge-ready. Execution begins only after an explicit go.
2. Run independent writers in true parallel. Each one-shot writer owns one exclusive branch, then yields.
3. The root verifies each yielded head, opens its PR, runs Babysit, and merges it when authorized. Unrelated writers continue.
4. A new head invalidates its verdict unless patch identity is unchanged. Corrections use a fresh writer, then re-verification.
5. The root owns the queue. After a merge, or when an operator-owned PR reaches merge-ready, it gives the next independent item to a fresh writer. Dependent changes route to Autopilot-stack.
6. Merge only with full-autonomy authority, a clean current-head verdict, and a quiet Babysit review-agent loop. Operator-owned items wait.
7. For requested watching, keep the objective in `goal`. When no blocking provider wait owns the event, invoke `loop` with a prompt and limit. Each turn audits ownership, protocol, and trails; stop `loop` when its predicate passes. User stop sends immediate zero-writes instructions through `hub` and stops `loop`.

Report writer, PR, head SHA, verdict, merges, gates, and trail paths.
