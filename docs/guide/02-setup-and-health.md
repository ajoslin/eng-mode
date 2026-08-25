# Setup and runtime health

Install Eng Mode, restart OMP, then run `setup-eng-mode` in every repository. It validates exact plugin provenance, shadows, model-role fallbacks, native goal, repository contracts, and task isolation, and installs the shipped watchdog into the active agent directory.

The advisor is a truth-checker. It catches spec drift, flaws, lies, and untruths: the agent claimed something the artifact does not do. It is not taste, coding standards, or ENG principles. Luna uses `modelRoles.advisor`. Workstation `config.yml` owns `advisor.enabled` and that role; setup does not write a second config or edit roles. A project `.omp/WATCHDOG.md` is an optional extra for repo-specific traps, not a second watchdog essay.

Repositories provide:

- `.omp/skills/project-standards/SKILL.md`: law and selected tools.
- `.omp/skills/verify-project/SKILL.md`: real Launch, Doctor, Drive, Evidence, Cleanup, and a user-facing feature map.

Declarations do not prove runtime availability. Inspect settings with `omp config get <key> --json`; restart after registry changes.

| Gate | Failure when absent |
|---|---|
| `task.enableLsp` | Delegates fall back to text navigation |
| `secrets.enabled` | Credentials reach provider context |
| `checkpoint.enabled` | Discarded exploration fills main context |
| Advisor (Luna) | Claims go unchecked against the artifact |
| Resolved-model badges | Nominal seat hides fallback |
| Task isolation | Concurrent writers collide |

Agents select semantic roles, not provider IDs. Actual models matter when claiming vendor diversity. Isolation is terminal; use ordinary tasks when later hub steering is required.