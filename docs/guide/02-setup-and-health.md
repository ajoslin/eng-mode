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

## Advisor commands and alternatives

Type `/eng-advisor ` to see options with descriptions, then use the normal OMP autocomplete controls to select one. `/eng-advisor help` (also `--help` or `-h`) lists commands and explains their behavior. After `/eng-advisor dismiss `, autocomplete suggests open finding IDs with summaries; selecting one inserts its full key.

| Command | Effect |
|---|---|
| `/eng-advisor`, `/eng-advisor status`, `/eng-advisor show` | Show status, active role and prompt sources, model and effort, and open finding keys. |
| `/eng-advisor on` | Resume automatic review and check pending material. Retry initialization if it previously failed. |
| `/eng-advisor off` | Pause automatic review and cancel active or queued reviews, including manual requests. |
| `/eng-advisor review` | Review unreviewed material once on the selected model. |
| `/eng-advisor refresh` | Review the recent `maxBatchMessages` window again and allow unchanged open findings to re-emit. |
| `/eng-advisor primary`, `/eng-advisor fallback` | Select the configured primary or fallback for this session. |
| `/eng-advisor reload` | Reload configuration and guidance, retrying the primary preference. Keep pause state and findings. |
| `/eng-advisor dismiss <key-prefix>` | Dismiss one uniquely matched open finding using a key from status. Persist the dismissal in this session's history. |
| `/eng-advisor help` | Show command descriptions and usage without starting a review. |

Use `/eng-advisor review` for a one-shot review of unreviewed material on the currently selected model. It bypasses automatic cadence and failure backoff for that request and works while automatic review is paused, without unpausing it. Completion, failure, and empty or filtered input are reported explicitly. The command does not rewind history or force findings to re-emit; use `/eng-advisor refresh` to revisit recent material.

Refresh is also a one-shot request while paused, with explicit completion, failure, or empty-input feedback. It preserves transcript filtering and does not revive dismissed findings with unchanged evidence. It can re-emit an open finding even during its normal cooldown.

Requests made during a running review coalesce into one queued pass; a queued refresh takes precedence over a request for only unreviewed material. The recent window is selected when that pass starts. `/eng-advisor off` cancels active and queued manual work. A model switch or reload carries unfinished manual work to the new reviewer while preserving pause state. Cancelled results are discarded even when repository evidence is still being validated; dismissals made during that validation are preserved.

Eng-Advisor prefers `@advisor` and resolves optional `@advisor_fallback` through the same OMP model resolver used by agent alternatives. Choose the fallback model in the workstation's OMP role configuration. Eng Mode does not assign a model or provider, and setup does not create or require the optional role.

If the primary cannot resolve at initialization, a resolvable fallback starts the advisor. After a primary usage/rate-limit or authentication error, the reviewer discards the failed attempt and retries the same batch once on the fallback within the existing review deadline. Missing or duplicate alternatives are skipped. Cancellation, content-policy blocks, context overflow, and unrelated errors do not trigger a switch. A failed fallback remains a failed review.

The fallback remains active until `/eng-advisor primary`, `/eng-advisor reload`, or a new session retries the primary. `/eng-advisor status` reports the active model and effort, the reason for fallback, and the alternative's resolved, unavailable, or duplicate status. A limit-triggered switch emits one notification. An authentication-triggered switch emits a warning naming the failed primary and prompting a credential check. The authentication failure remains in status even after a successful fallback review; provider error contents are not echoed into the warning.

Switch explicitly with `/eng-advisor fallback` or `/eng-advisor primary`. Each command uses that model's configured effort and reports the selected model. The choice is session-local and leaves workstation roles, pause state, and open findings unchanged. Selecting the primary keeps automatic recovery enabled if it fails again.

The requested model must resolve before the current reviewer is replaced. Disabled, unavailable, or duplicate alternatives produce a warning and leave the current selection intact. If a review is running, the switch cancels it, discards its stale result, and retries the unconsumed batch on the new reviewer. Paused advisors stay paused; use `/eng-advisor on` when ready.

The shipped `src/advisor/eng-advisor.json` keeps the primary `thinking: low`. Its `fallback` object selects `@advisor_fallback` and inherits the primary's configured effort unless `fallback.thinking` overrides it. Both effort fields accept `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, clamped to the selected model's support. As with the primary, advisor configuration owns effort; a role's selector suffix does not override it.

Set `fallback.model` to another semantic role or selector to customize the alternative, or set `fallback: null` to disable it. Changes take effect after `/eng-advisor reload`; restart OMP after installing updated extension code. Cadence, filters, read-only inspection, credential resolution, and the separate native advisor setting are unchanged.
