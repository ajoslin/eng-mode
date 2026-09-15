---
name: gh-stack
description: GitHub stacked PRs via gh stack. Use for stack parentage, submit, rebase, merge, Autopilot-stack, Shipping, or when a playbook names gh-stack. Workers never run gh stack.
---

# gh-stack

`gh stack` owns stack parentage and stacked landing. Local tracking in `.git/gh-stack` plus `gh stack view --json` is the source of truth. GitHub `base` refs drift mid-rebase. `gh` still owns PR view, checks, and review-comment replies. Never replace those with `gh stack`. Never `gh pr merge` a stacked PR.

Stacking is a review aid, not the default branch strategy. Use one PR for ordinary coherent work. Encourage a stack when the change is large or complicated enough that one PR would be hard to review, and when its parts form a real dependency chain. Split by independently understandable concerns, not arbitrary file or line counts. Do not stack small work merely because later code depends on earlier code within the same coherent change. For layering, read `references/stack-design.md`.

If `gh stack view --json` fails because `gh` or `github/gh-stack` is missing, stop and report. Do not invent a stack with `gh pr create --base`.

Workers never run `gh stack`. One stacker per stack.

## Setup

```sh
gh extension install github/gh-stack
git config rerere.enabled true
git config remote.pushDefault origin
```

`push`, `submit`, `sync`, `rebase`, and `link` require `--remote <name>` unless `remote.pushDefault` is set.

## Delivery interface

The named stacker is the topology owner. Freeze bottom-to-top order with `gh stack view --json`. Only that stacker may append, submit, sync, rebase, merge, or unstack. If these commands cannot establish parentage, stop. GitHub base refs are not a topology fallback.

Before landing a stack, record every PR's current head SHA and base from the selected forge provider. Land with `gh stack merge <pr-or-stack> --yes`. Confirm with a fresh `gh stack view --json` plus a provider snapshot of every affected PR. Each head must still equal the recorded SHA, and each landed PR must report `MERGED` or `QUEUED`. Command success is not confirmation. Independent PRs still use GitHub auto-merge; stacked PRs never do. If a previous agent armed GitHub auto-merge on a stacked PR, disarm with `gh pr merge <n> --disable-auto` and stop.

During the frozen drain, use the selected provider's watcher and its `WAITING`, `READY`, `ADVANCE`, and terminal `COMPLETE` events. `gh stack` does not replace PR-state watching. After each `ADVANCE`, compare the next PR's current head/base with its frozen snapshot and rearm the provider watcher. Never append a newly discovered PR to the frozen queue.

If a required topology, landing, snapshot, comparison, or watcher operation is undocumented, stop. Never substitute another provider or invent a command.

## Non-interactive commands

`gh stack` opens a TUI when stdout is a TTY. Always pass the flags below.

| Use | Never |
|---|---|
| `gh stack view --json` | `gh stack view` or guessing parentage from GitHub `base` |
| `gh stack init <branch>...` | `gh stack init` with no branches |
| `gh stack add <branch>` | `gh stack add` with no branch |
| `gh stack submit --auto` | `gh stack submit` without `--auto` |
| `gh stack merge <target> --yes` | `gh pr merge` on a stacked PR |
| `gh stack checkout <target>` | `gh stack checkout` with no target |
| `gh stack up` / `down` / `top` / `bottom` | `gh stack switch` |
| `gh pr view` / checks / review replies | `gh stack` for those |

Never run `gh stack modify`. It is TUI-only. Restructure with `unstack` then `init`. Command details: `references/commands.md`. Recovery: `references/troubleshooting.md`.

SHA via `git rev-parse` or `branches[].head` from `view --json`. After submit, `gh pr edit` titles and bodies. Apply **unslop**.

## Core loop

```sh
gh stack init layer-one
git commit -m "layer one"
gh stack add layer-two
git commit -m "layer two"
gh stack submit --auto
gh stack view --json
```

Adopt existing branches bottom to top: `gh stack init --base main branch-one branch-two`, then `gh stack submit --auto`.

## Sync and land

- Sync: `gh stack sync`. Stacker only. Non-interactive divergence prints both chains, changes nothing, and exits 0 with `Sync aborted`. That is not a successful sync.
- Restack: stacker only. `gh stack rebase`. After editing a lower layer, `gh stack rebase --upstack`.
- Land: `gh stack merge <pr-or-stack> --yes`. All-or-nothing up to the target. Never `gh pr merge` a stacked PR. Never GitHub auto-merge on a stacked PR. Children target unprotected parents and would collapse.
- After a stack is queued or merged, do not `gh stack sync` or `gh stack rebase` to grow it. Independent work gets a new stack.

Workers never rebase and never run topology commands. One stacker per stack.
