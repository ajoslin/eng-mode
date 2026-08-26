---
name: github-stack
description: Native GitHub stacked PRs via the gh stack extension. Use for stacked work, dependent PR chains, Autopilot-stack, Shipping, gh stack init/add/submit/sync/merge, or when a playbook names stack tooling.
---

# GitHub stack

A native GitHub stack is a GitHub Stack object. `gh pr create --base <branch>` is not one. Create or refresh the stack with `gh stack submit --auto` or `gh stack link`.

Stacking is a review aid, not the default branch strategy. Use one PR for ordinary coherent work. Encourage a stack when the change is large or complicated enough that one PR would be hard to review, and when its parts form a real dependency chain. Split by independently understandable concerns, not arbitrary file or line counts. Do not stack small work merely because later code depends on earlier code within the same coherent change.

Requires the `github/gh-stack` extension (`gh extension install github/gh-stack`) and `gh` ≥ 2.90. Stacked PRs are in public preview and rolling out per repository; there is no enablement toggle. `gh stack` exit 9 means the repository is not enabled yet — stop and report. Do not fake a stack with dependent PRs.

`gh stack <command> --help` is authoritative for flags.

## Commits

Commit with `omp commit`, never `git commit` / `git commit -m`. Stage first only when the index must exclude unrelated dirty files; an empty index makes `omp commit` stage everything. Pass `-c` for intent the diff does not show. `--no-changelog` when the layer must not touch changelogs. `--push` is not stack submit. Do not use `gh stack add -Am` (that commits with git).

```
omp commit -c "<why this layer>"
```

## Non-interactive commands

`gh stack` opens a TUI when stdout is a TTY. Always pass the flags:

| Use | Never |
|---|---|
| `gh stack view --json` | `gh stack view` |
| `gh stack submit --auto` | `gh stack submit` |
| `gh stack merge <target> --yes` | `gh pr merge` on a stacked PR |
| `gh stack init <branch>...` | `gh stack init` |
| `gh stack add <branch>` | `gh stack add` |
| `gh stack checkout <target>` | `gh stack checkout` |
| `gh stack up` / `down` / `top` / `bottom` | `gh stack switch` / `modify` |

`submit --auto` opens draft PRs. Add `--open` when they should be ready for review. After submit, `gh pr edit` titles and bodies; apply **unslop**.

## Core loop

```
gh stack init layer-one
# work
omp commit -c "..."
gh stack add layer-two
# work
omp commit -c "..."
gh stack submit --auto
gh stack view --json
```

Adopt existing branches bottom to top: `gh stack init --base main b1 b2 b3` then `gh stack submit --auto`. Link already-open PRs: `gh stack link <pr-or-branch>...` (bottom to top).

## Sync and land

- Sync: `gh stack sync`. Add `--prune` only when merged local branches should die.
- Rebase: stacker only. `gh stack rebase` then `gh stack push`.
- Merge: `gh stack merge <pr-or-stack> --yes`. Never `gh pr merge` a stacked PR.
- Restructure without the TUI: `gh stack unstack`, fix ancestry, `gh stack init --base <trunk> <branches...>`, `gh stack submit --auto`.

Workers never rebase and never run topology commands. One stacker per stack.
