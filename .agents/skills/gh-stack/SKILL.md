---
name: gh-stack
description: GitHub stacked PRs via gh stack. Use for stack parentage, submit, rebase, merge, Autopilot-stack, Shipping, or when a playbook names gh-stack. Workers never run gh stack.
---

# gh-stack

`gh stack` owns stack parentage and stacked landing. Local tracking in `.git/gh-stack` plus `gh stack view --json` is the source of truth. GitHub `base` refs drift mid-rebase. `gh` still owns PR view, checks, and review-comment replies. Never replace those with `gh stack`. Never `gh pr merge` a stacked PR.

Stacking is a review aid, not the default branch strategy and never a size gate. Whether to stack is decided once, in **When to stack** below. Every other skill, playbook, and product repo points here instead of restating it.

If `gh stack view --json` fails because `gh` or `github/gh-stack` is missing, stop and report. Do not invent a stack with `gh pr create --base`.

Workers never run `gh stack`. One stacker per stack.

## When to stack

Use one PR for ordinary coherent work. Size a change by its meaningful hand-written diff: the logic a reviewer has to reason about. Raw LOC is not the measure. Generated code, lockfiles, snapshots, vendored files, and mechanical churn (codemods, renames, moves, formatting) do not count.

- **Around 1,000–3,000 lines of hand-written logic, encourage a stack.** Split by reviewable concern into dependent layers that each make sense on their own. Plan the layers before writing code (`references/stack-design.md`).
- **Never require one.** A single PR stays correct at any size when the work does not separate into independently understandable concerns.
- **Mechanical refactors are exempt.** A codemod, rename, move, regeneration, or lockfile bump may ship as one large PR, even at 10k–100k lines. When practical, put the hand-written logic that rides along in its own stacked PR, so review attention lands there and the mechanical layer can be skimmed.
- **Split by concern, not by count.** Never cut layers by file or line count. Do not stack small work just because later code depends on earlier code within the same coherent change.

## Setup

Requires `gh` 2.0+ and `github/gh-stack` v0.1.0+ (`gh stack merge`, built on GitHub's async merge API). Keep both current.

```sh
gh extension install github/gh-stack   # or: gh extension upgrade stack
git config rerere.enabled true
git config remote.pushDefault origin
```

`push`, `submit`, `sync`, `rebase`, and `link` require `--remote <name>` unless `remote.pushDefault` is set.

## Delivery interface

The named stacker is the topology owner. Freeze bottom-to-top order with `gh stack view --json`. Only that stacker may append, submit, sync, rebase, merge, or unstack. If these commands cannot establish parentage, stop. GitHub base refs are not a topology fallback.

Before landing a stack, record every PR's current head SHA and base from the selected forge provider. Land with `gh stack merge <pr-or-stack> --yes`. Confirm with a fresh `gh stack view --json` plus a provider snapshot of every affected PR. Each head must still equal the recorded SHA, and each landed PR must report `MERGED` or `QUEUED`. Command success is not confirmation. `gh stack merge` submits through GitHub's async merge API (`PUT /repos/{owner}/{repo}/pulls/{n}/merge-async` on the target, which takes every open PR below it). The request is atomic: the whole set merges, is queued, or none of it is. Only open and not-draft are checked at submit. Branch protection and rulesets run when the merge executes, so a rule failure surfaces as a failed result, not a refusal. With a merge queue on the base, the set is queued and the queue picks the method; queued PRs can land in separate groups, so keep watching until each reports `MERGED`. Independent PRs land through `github` **Merge**; stacked PRs never use GitHub auto-merge or `gh pr merge`. If a previous agent armed GitHub auto-merge on a stacked PR, disarm with `gh pr merge <n> --disable-auto` and stop.

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
- Land: `gh stack merge <pr-or-stack> --yes --squash` (or the repo's method). All-or-nothing up to the target. If `merge` is an unknown command, run `gh extension upgrade stack`; never fall back to per-PR merges. Never `gh pr merge` a stacked PR. Never GitHub auto-merge on a stacked PR. Children target unprotected parents and would collapse.
- After a stack is queued or merged, do not `gh stack sync` or `gh stack rebase` to grow it. Independent work gets a new stack.

Workers never rebase and never run topology commands. One stacker per stack.
