### Autonomous run

1. Form the observable predicate, scope, verification surface, human gates, and terminal evidence before work. `/goal` owns the durable objective; if none is active, form the objective and get a goal started. Put the finite execution graph in `todo`.
2. Use ordinary execution for finite work and native `/goal` continuation for unattended work. Interval or polling work is `/goal do x until y, sleep 30 minutes between iterations`. Require an explicit bound. Never a substitute for the predicate.
3. Each iteration makes the smallest evidence-backed change. Keep wins; discard changes that do not advance the predicate. Never edit the ruler or its inputs. If the target or measure is invalid, stop, record the discontinuity, define a replacement, and establish a new baseline before continuing.
4. Transition the finite graph through `todo`. Use `show-me-your-work` for durable decisions; duplicate no state.
5. Handle reversible discoveries. For destructive actions, unreachable product choices, time-gated waits, operational failures, or a proven dead end, make the checkpoint durable and require the operator to `/goal pause`; never complete or drop a blocked goal.
6. Call native `goal complete` only after the verification contract passes. The lead owns the terminal verdict unless the routed playbook separately requires independent review. Never weaken the predicate to finish.
