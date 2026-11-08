# Claude Code adapter

## Launch

Use a disposable `CLAUDE_CONFIG_DIR`, install `pstack@pstack-claude`, then run `bun run claude:install`. Point Claude Code at a configured endpoint through the launch environment without recording key values, unset `CLAUDECODE` when nested, and start `claude --model <model>` in a managed PTY from a disposable git repository with no remote.

## Health gate

- `claude plugin validate .` and `claude plugin validate plugins/eng-mode` pass.
- `claude plugin list --json` shows `eng-mode@eng-mode` and `pstack@pstack-claude` enabled.

## Drive

- **Alias.** Submit `/eng-mode <trivial local task>` and confirm the transcript loads `pstack:poteto-mode` and performs the task.
- **GitHub routing.** Ask for a read-only PR status on a public repository and confirm the agent uses `eng-github`, not raw `gh`. Never mutate a remote.
- **Extra model.** Run `eng-extra-model --provider cliproxy --model <model> --prompt "Reply exactly EXTRA_OK"` with `ENG_CLIPROXY_BASE_URL` set and confirm `EXTRA_OK`; unset, confirm exit 69.

## Evidence

Capture the revision, install output, plugin list, and session transcript before removing the disposable config and repository.
