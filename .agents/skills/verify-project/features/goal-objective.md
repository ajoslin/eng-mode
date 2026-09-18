# Durable goal objective

## Sub-features

Create, inspect, resume, complete, and drop OMP's native durable objective through Eng Mode's essential `goal` wrapper.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension in a disposable profile. Ask the agent to invoke the `goal` tool directly.

## Driving it with OMP TUI

1. Invoke `goal` with `op: get` and capture the rendered state. With no goal it renders `No active goal.`.
2. If a goal exists, invoke `drop`, then confirm with `get` before the recipe continues.
3. Invoke `create` with a falsifiable disposable objective and `token_budget: 500000000`. Confirm the rendered `Goal: <objective>`, `Status: active`, `Tokens: 0 used / 500000000 budget`, and `Remaining tokens: 500000000`.
4. Invoke `get` and confirm the same objective is active.
5. Invoke `resume`, then `get`. Confirm the objective remains active.
6. Invoke `complete`, then `get`. Confirm both render `Status: complete`. The `complete` result also appends a `Goal achieved. Report final budget usage to the user: …` line; the following `get` does not.
7. Invoke `drop`. Confirm it renders `Status: dropped`. Invoke `get` and confirm `No active goal.`.

## Gotchas

The wrapper delegates to OMP's same-name native tool. The wrapper's `token_budget` is optional on `create`: an omitted or lower value is raised to `500000000` before delegation, so a create never renders a smaller budget. Goal state owns the objective and accounting, not repeated turns. Token counts after create grow with each turn. Always drop the disposable goal before removing the profile.
