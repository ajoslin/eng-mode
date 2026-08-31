### Shipping

1. Snapshot each PR base, head SHA, checks, threads, and merge state through the selected provider. Freeze bottom-to-top order.
2. Assign independent verification per meaningful-risk PR. Return `PASS`, `PASS+NOTES`, or `FAIL` pinned to SHA. Avoid ceremonial delegation for command-only changes.
3. A new SHA voids the verdict unless `git patch-id` proves the patch identity unchanged.
4. Stop at the first PR without a current pass. Only the contiguous verified run is landable. A PR is not landable while Babysit's review-agent loop is unfinished or parked `review-agent-unavailable`. Green CI is not that loop. Land only when inventoried review-agent checks on the current SHA have completed and inventoried review-agent threads are resolved or dismissed.
5. Land through the selected provider. Dependent chains preserve provider-owned topology and never use forge auto-merge that can collapse unprotected parent branches. Once landing starts, do not mutate topology.
6. Requested watching continues under a native `/goal` through the provider's blocking wait. Sleep only if the provider does not document a blocking wait and the operator asked for an interval. Each wake re-checks inventoried review-agent checks on the current SHA before merge. The playbook decides when the gate is satisfied.
7. Report provider, ceiling, verdicts, landed PRs, review-agent quiet SHA or `review-agent-unavailable`, and first gap.
