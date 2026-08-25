### Shipping

1. Use the stack tooling and GitHub workflow skills `project-standards` names. Do not use Graphite.
2. Snapshot each PR base, head SHA, checks, threads, and merge state. Freeze bottom-to-top order.
3. Assign independent verification per meaningful-risk PR. Return `PASS`, `PASS+NOTES`, or `FAIL` pinned to SHA. Avoid ceremonial delegation for command-only changes.
4. A new SHA voids the verdict unless `git patch-id` proves the patch identity unchanged.
5. Stop at the first PR without a current pass. Only the contiguous verified run is landable. A PR is not landable while Babysit's review-agent loop is unfinished or parked `review-agent-unavailable`. Green CI is not that loop. Land only when inventoried review-agent checks on the current SHA have completed and inventoried review-agent threads are resolved or dismissed.
6. Use the project's stack tooling to sync, submit, or merge. Never raw-auto-merge child PRs. If the base uses a merge queue, proceed only when the stack tooling proves ordered landing; otherwise stop and report the gate.
7. Once landing starts, do not mutate topology. Requested watching continues under a native `/goal`. Sleep only if the operator asked for an interval. Never hand-roll polling. Each tick re-checks inventoried review-agent checks on the current SHA before merge. The playbook decides when the gate is satisfied.
8. Report ceiling, verdicts, landed PRs, review-agent quiet SHA or `review-agent-unavailable`, and first gap.
