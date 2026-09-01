# Setup and runtime health

Install Eng Mode, restart OMP, then run `setup-eng-mode` in every repository. Plugin load already exposes the judgment-layer allowlist at `<repo>/.agents/skills` as symlinks into the plugin, plus a relative `verify-project` contract link when that file exists; setup reports that overlay and does not treat those dests as `.omp/skills` shadows. Precedence stays `.omp/skills` 100, `omp-plugins` 90, agents 70. It validates exact plugin provenance, shadows, model-role fallbacks, `goal`, `loop`, repository contracts, and task isolation.

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