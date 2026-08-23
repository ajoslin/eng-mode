# Setup and runtime health

Install Eng Mode, restart OMP, then run `setup-eng-mode` in every repository. It validates exact plugin provenance, shadows, model-role fallbacks, native goal, repository contracts, and task isolation.

Repositories provide:

- `.omp/skills/project-standards/SKILL.md`: law and selected tools.
- `.omp/skills/verify-project/SKILL.md`: real Launch, Doctor, Drive, Evidence, Cleanup, and a user-facing feature map.

Declarations do not prove runtime availability. Inspect settings with `omp config get <key> --json`; restart after registry changes.

| Gate | Failure when absent |
|---|---|
| `task.enableLsp` | Delegates fall back to text navigation |
| `secrets.enabled` | Credentials reach provider context |
| `checkpoint.enabled` | Discarded exploration fills main context |
| Advisor + `.omp/WATCHDOG.md` | Passive review stays generic |
| Resolved-model badges | Nominal seat hides fallback |
| Task isolation | Concurrent writers collide |

Agents select semantic roles, not provider IDs. Actual models matter when claiming vendor diversity. Isolation is terminal; use ordinary tasks when later hub steering is required.