---
name: swarm
description: Fan out independent OMP workers in one task batch, aggregate evidence, and return one report. Use for /swarm, parallel coverage, races, gauntlets, and exploration partitions.
disable-model-invocation: true
---

# Swarm

1. Frame one done predicate and aggregate output.
2. Choose partition, race, or mixed shape. Name the selection rule before dispatch.
3. Put shared context in batch `context`; each task names target, change, acceptance, and non-goals.
4. Pick the specific OMP agent type: `scout`, `sonic`, implementation agent, or specialist reviewer.
5. For writers, either assign disjoint exclusive paths or verify OMP task isolation is configured and set `isolated: true` on each writer item.
6. Dispatch all independent slices in one `task` call. Subagents skip validation; the lead validates once after integration.
7. Continue lead work. Use `hub` for messages and completion notifications; never poll.
8. Aggregate evidence. Coverage requires every mandatory slice. Note dropouts and gaps.
9. Return one result, not raw dumps. The lead owns conclusion and proof.
