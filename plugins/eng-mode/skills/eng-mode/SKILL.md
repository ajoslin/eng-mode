---
name: eng-mode
description: Backwards-compatible alias for pstack's poteto-mode in Claude Code. Use for /eng-mode TASK.
argument-hint: "TASK"
---

# Eng Mode alias

Arguments: `$ARGUMENTS`

Load the `pstack:poteto-mode` skill with the Skill tool and run it on the arguments above exactly as if the user had typed `/poteto-mode $ARGUMENTS`. pstack owns every playbook, rule, and agent. If `pstack:poteto-mode` cannot be loaded, stop and report that pstack is not installed (`claude plugin install pstack@pstack-claude`).

Only two additions apply:

- **GitHub.** Wherever pstack runs raw `gh`, `gh api`, or `curl` against `api.github.com`, use the equivalent `eng-github` command instead (load the `eng-mode:eng-github` skill for its commands; use `eng-github api` or `eng-github graphql` when no dedicated command exists). In Claude Code, run its blocking `watch` once with Bash `run_in_background: true` and await it with `TaskOutput`; ignore the skill's OMP `bash`/`wait` examples and its claim that raw `gh` is blocked. Inside T3 Code (`T3CODE_OMP_SESSION=1`), use `gh` directly.
- **Other model vendors.** For a second opinion from a non-Claude model, run `eng-extra-model --provider cliproxy --model MODEL --prompt "..."` (needs `ENG_CLIPROXY_BASE_URL`; `--list-models` lists models) or `--provider codex`. The prompt must be self-contained. Any nonzero exit is a missing seat: report its stderr, never substitute your own answer. Use Bash `timeout: 600000` for judge-sized calls.
