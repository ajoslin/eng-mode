---
name: swarm
description: Fan out independent OMP workers in one task batch, aggregate evidence, and return one report. Use for /swarm, parallel coverage, races, gauntlets, and exploration partitions.
disable-model-invocation: true
---

# Swarm

Fan out N independent OMP workers across coverage slices, race arms, or both. N is the total worker count, not runtime concurrency. The lead drains the workers, integrates any selected output, validates the result, and returns one auditable report.

## Start

Before launching workers, put these phases in the lead's finite task list:

1. Frame
2. Fan out
3. Aggregate
4. Report

## Frame

1. State one done predicate and name the aggregate artifact or report.
2. Choose partition, race, or mixed shape. For a race, declare `first pass`, `rank all`, or `best-of` and its comparison criteria before dispatch.
3. Set N from the request or derive it from the declared slices and arms. Record N separately from whatever concurrency the runtime provides. Do not invent a fixed maximum.
4. Give every worker one named, writable output destination. Outputs must not overlap. Writers either own disjoint exclusive paths, or use `isolated: true` only after verifying OMP task isolation is configured and only when every isolated change belongs in the merged result. Race artifacts that are not all meant to merge use separate worker-owned outputs instead of isolated parent-tree writes.
5. Pick the most specific OMP agent type for each worker: `scout`, `sonic`, `implementation-agent`, `judgment-agent`, `reviewer`, `security-reviewer`, or another applicable specialist.

## Fan out

Dispatch all N independent workers in one `task` batch. Shared batch `context` supplements each brief; it never replaces the brief. Every brief must stand alone and name:

- the goal and done predicate;
- the scope and non-goals;
- the exact slice or race arm;
- the worker's owned output destination;
- the scoped verification to perform, while skipping formatters, linters, and project-wide suites; and
- the report contract: `PASS`, `ISSUES`, or `BLOCKED`, with evidence and the output location.

Continue lead work while workers run. Task results deliver asynchronously. Use `hub` only for needed messages and completion notifications; never poll workers.

## Drain

Do not aggregate partial arrivals. Declare the drain complete only after every one of the N workers has delivered a terminal result or has been recorded as a dropout. If a worker drops out, continue with N-1 when the done predicate remains decidable. Record the dropout and its uncovered slice. If that slice is mandatory and no result covers it, the aggregate is `BLOCKED` rather than silently complete.

## Aggregate

Start only after the declared drain. Read every terminal result and owned output. Coverage requires a result for every mandatory slice. For a race, the lead applies the selection rule declared during Frame, records why the selected arm won, and applies that arm's output to the canonical target when application is part of the requested work. Do not paste raw worker dumps or let a worker self-select the winner.

The lead reviews integration and validates the aggregate once on the required surface. Worker summaries are evidence pointers, not proof by themselves.

## Report

Return one compact report containing:

| Worker | Slice or arm | Status | Output | Evidence |
|---|---|---|---|---|
| name | exact ownership | PASS / ISSUES / BLOCKED | path or artifact | one-line observed result |

Follow the table with evidenced issue one-liners, explicit gaps and dropouts, the race rule and selected arm when used, and the lead's aggregate validation result.
