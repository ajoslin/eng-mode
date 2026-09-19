# Troubleshooting Eng Mode

- **Delegate lacks LSP:** inspect `task.enableLsp`; enable and restart.
- **Checkpoint missing:** inspect `checkpoint.enabled`; restart after enabling.
- **Wrong panel model:** enable resolved-model badges; use actual vendors and fallbacks.
- **Isolated worker cannot revive:** expected; isolation is terminal.
- **Eval child cannot receive hub:** expected; use normal tasks for steering.
- **UI tests pass but proof is inconclusive:** drive the mapped feature through the repository health gate.
- **Wrong playbook:** restate problem, finish condition, and edit permission—not skill ceremony.
- **Skill or agent shadow:** remove unintended repository copies; rerun setup.
- **Secret placeholder reaches a tool:** inspect redacted output only; never paste the secret into context.
- **Context grows:** checkpoint, artifact matrices, delegate bulk reading, rewind with one evidence report.
- **Loop does not continue:** inspect `loop` status. Resume a paused loop with its prompt, or start a stopped loop with a new limit.
- **Learning project ambiguous:** configure exact team/project ID or key/name. `capture-learning` refuses ambiguity and searches before creation.
- **`/compact-adviser` missing or `Key: missing`:** set `TYPESAFE_API_KEY` (env or a `.env` OMP loads), then rerun `bun --cwd "$HOME/dev/eng-mode" run compact-adviser` and restart. Without a key setup leaves the plugin disabled on purpose.
- **jev-sift is missing from MCP tools:** jev-sift is opt-in. Set `JEV_API_KEY` or `TYPESAFE_API_KEY`, or provide `~/.config/jev-sift/api-key`, then run `bun run jev-sift` from this checkout and restart OMP. Without a key, setup removes only the `jev-sift` entry.
- **jev-sift cannot authenticate:** inspect the server's status and key source without printing the key. The MCP entry does not store credentials. Make the key available to the OMP process or use the key file, then restart.
- **jev-sift skips a required file:** read that file directly and record the miss. Do not use a higher threshold to claim better quality from token savings alone. See the [evaluation methodology](../notes/jev-sift-spike.md).
- **jev-sift results are from mock mode:** mock scores are synthetic. Run `bun run jev-sift:eval --live` with an authorized key before making relevance-quality claims. See the [results record](../notes/jev-sift-eval-results.md).

For cross-session work, preserve goal, fixed point, evidence, risks, and next action.