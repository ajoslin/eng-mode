# Setup and runtime health

Install Eng Mode, restart OMP, then run `setup-eng-mode` in every repository. It validates exact plugin provenance, model-role fallbacks, `goal`, `loop`, repository contracts, and task isolation.

Repositories provide:

- `.agents/skills/project-standards/SKILL.md`: repository law and commands.
- `.agents/skills/verify-project/SKILL.md`: real Launch, Doctor, Drive, Evidence, Cleanup, and a user-facing feature map.

`.omp/skills` remains a backwards-compatible fallback for existing repositories.

Declarations do not prove runtime availability. Inspect settings with `omp config get <key> --json`; restart after registry changes.

## GitHub access

GitHub work uses [`eng-github`](../../skills/eng-github/SKILL.md). Setup checks Bun with `bun --version` and validates token access with `eg whoami`.

| Gate | Failure when absent |
|---|---|
| `task.enableLsp` | Delegates fall back to text navigation |
| `secrets.enabled` | Credentials reach agent context |
| `checkpoint.enabled` | Discarded exploration fills main context |
| Resolved-model badges | Nominal seat hides fallback |
| Task isolation | Concurrent writers collide |

Agents select semantic roles, not provider IDs. Actual models matter when claiming vendor diversity. Isolation is terminal; use ordinary tasks when later hub steering is required.

If the repository has no `verify-project` contract, run `create-verification-skill`. An agent that can check its own work keeps going until the check passes. An agent that can't hands every result back to you.

Eng Mode spends extra tokens on typed agents and review panels. Use `sonic` or `scout` when the brief is mechanical or read-only. Save `/eng-mode` for work that needs rigor.

When you can't tell which skill fits, type `/eng-help` with the question. It answers and does not start the work.