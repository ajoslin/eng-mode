# Setup and runtime health

Install Eng Mode, restart OMP, then run `setup-eng-mode` in every repository. It validates exact plugin provenance, shadows, model-role fallbacks, `goal`, `loop`, repository contracts, and task isolation.

Repositories provide:

- `.agents/skills/project-standards/SKILL.md`: law and selected tools.
- `.agents/skills/verify-project/SKILL.md`: real Launch, Doctor, Drive, Evidence, Cleanup, and a user-facing feature map.

`.omp/skills` remains a backwards-compatible fallback for existing repositories.

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

## Advisor alternatives

Eng-Advisor prefers `@advisor` and resolves optional `@advisor_fallback` through the same OMP model resolver used by agent alternatives. Choose the fallback model in the workstation's OMP role configuration. Eng Mode does not assign a model or provider, and setup does not create or require the optional role.

If the primary cannot resolve at initialization, a resolvable fallback starts the advisor. After a primary usage or rate-limit error, the reviewer discards the failed attempt and retries the same batch once on the fallback within the existing review deadline. Missing or duplicate alternatives are skipped. Cancellation, authentication failures, context overflow, and unrelated errors do not trigger a switch. A failed fallback remains a failed review.

The fallback remains active until `/eng-advisor reload` or a new session retries the primary. `/eng-advisor status` reports the active model and effort, the reason for fallback, and the alternative's resolved, unavailable, or duplicate status. A limit-triggered switch emits one notification.

The shipped `src/advisor/eng-advisor.json` keeps the primary `thinking: low`. Its `fallback` object selects `@advisor_fallback` and inherits the primary's configured effort unless `fallback.thinking` overrides it. Both effort fields accept `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, clamped to the selected model's support. As with the primary, advisor configuration owns effort; a role's selector suffix does not override it.

Set `fallback.model` to another semantic role or selector to customize the alternative, or set `fallback: null` to disable it. Changes take effect after `/eng-advisor reload`; restart OMP after installing updated extension code. Cadence, filters, read-only inspection, credential resolution, and the separate native advisor setting are unchanged.
