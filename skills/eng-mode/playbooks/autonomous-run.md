### Autonomous run

**You own the exit condition. Define done, then drive to it without stopping.** For "going to bed", "run until done", or sustained work against one predicate.

1. Define one durable objective and checkable exit predicate: scope, verification surface, human gates, and terminal evidence. Invoke `goal` for the objective and put the finite execution graph in `todo`.
2. Prefer a blocking watcher when a command can wait for the event. Otherwise invoke `loop` with a prompt and limit.
3. Each iteration re-observes current reality. Make the smallest evidence-backed change, verify it against the predicate, keep progress, and discard non-wins. Never edit the ruler or its inputs. Use `show-me-your-work` for durable decisions; duplicate no state.
4. On destructive actions, unreachable product choices, operational failures, or a proven dead end, checkpoint and pause or stop `loop`; never weaken the predicate.
5. When the predicate and verification contract pass, stop `loop`, then complete `goal`. The lead owns both verdicts.

**Reply:** the objective, exit predicate, iterations run, what landed, what was discarded, final evidence, and terminal goal/loop states.
