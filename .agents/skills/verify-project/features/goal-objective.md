# Durable goal objective

## Sub-features

Create, inspect, resume, complete, and drop OMP's native durable objective through Eng Mode's essential `goal` wrapper.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension and ask the agent to inspect or create a goal.

## Driving it with OMP TUI

Use a disposable session. Ask for a `goal get`, then create a falsifiable objective if none exists. Confirm the rendered native result. Do not use the goal as a polling or repeated-turn mechanism.

## Gotchas

The wrapper delegates to OMP's same-name native tool and enforces Eng Mode's minimum token budget. Goal state owns objective and accounting, not loop cadence.
