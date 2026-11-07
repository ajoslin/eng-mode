# Eng Mode for Claude Code

A minimal adapter on [pstack-claude](https://github.com/michael-denyer/pstack-claude). pstack's `poteto-mode` owns every playbook, rule, and agent. This plugin adds only:

- `/eng-mode TASK` (or `/eng-mode:eng-mode TASK`): an alias that runs `pstack:poteto-mode` on TASK, so existing workflow prompts keep working.
- `eng-github` on PATH, and an instruction to use it wherever pstack calls raw `gh` (rate-limit pausing, fingerprints, batched snapshots, conditional caching). Nothing is blocked.
- `eng-extra-model` on PATH, for second opinions from non-Claude models through CLIProxyAPI or `codex exec`.

Install pstack first, then this plugin from a checkout:

```sh
claude plugin marketplace add michael-denyer/pstack-claude
claude plugin install pstack@pstack-claude
bun run claude:install
```

The installer reinstalls `eng-mode@eng-mode` at user scope. It uninstalls first, so a failed install leaves the plugin absent until you rerun it. Start a new Claude Code session afterwards.

## eng-extra-model

```sh
ENG_CLIPROXY_BASE_URL=http://host:8317 eng-extra-model --provider cliproxy --model MODEL --prompt "..."
ENG_CLIPROXY_BASE_URL=http://host:8317 eng-extra-model --provider cliproxy --list-models
eng-extra-model --provider codex --model MODEL < brief.md
```

Authentication uses only `ENG_CLIPROXY_API_KEY` as a bearer token; URL credentials are rejected and errors report only the origin. Exit 69: provider unavailable. Exit 2: usage or configuration error. Exit 1: provider failure. Any nonzero exit is a missing seat, not a verdict.
