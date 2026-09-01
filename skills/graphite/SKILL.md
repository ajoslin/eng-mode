---
name: graphite
description: Graphite stacked PRs via gt. Use for stack parentage, submit, restack, merge-when-ready, Autopilot-stack, Shipping, or when a playbook names Graphite. Workers never run gt.
---

# Graphite

`gt` owns stack parentage and landing. GitHub `base` refs drift mid-restack; local Graphite tracking is the source of truth. `gh` still owns PR view, checks, review-comment replies, and `gh pr merge --disable-auto`. Never replace those with `gt`.

Stacking is a review aid, not the default branch strategy. Use one PR for ordinary coherent work. Encourage a stack when the change is large or complicated enough that one PR would be hard to review, and when its parts form a real dependency chain. Split by independently understandable concerns, not arbitrary file or line counts. Do not stack small work merely because later code depends on earlier code within the same coherent change.

If `gt` is missing or `gt --no-interactive auth` fails, stop and report. Do not invent a stack with `gh pr create --base` or `gh stack`.

Workers never run `gt`. One stacker per stack.

## Delivery interface

The named stacker is the topology owner. Freeze bottom-to-top order with `gt --no-interactive log short --stack --reverse`; inspect each tracked branch with `gt --no-interactive info <branch>`. Only that stacker may append with `gt track -p <parent>` followed by `gt submit --no-interactive`, or sync, restack, arm, and disarm landing. If these commands cannot establish parentage, stop; GitHub base refs are not a topology fallback.

Before requesting merge-when-ready, record every PR's current head SHA and base from the selected forge provider. Request it with `gt submit --merge-when-ready --always --update-only --no-interactive`. Confirm arming with a fresh provider snapshot of every affected PR: each head must still equal the recorded SHA and each PR must report an active merge-when-ready request. Command success is not confirmation. If confirmation fails or the head/base changes, disarm every affected PR with `gh pr merge <n> --disable-auto`, confirm each request is absent in a fresh provider snapshot, and stop. This disarm is recovery for Graphite's request, not permission to arm GitHub auto-merge directly.

During the frozen drain, use the selected provider's watcher and its `WAITING`, `READY`, `ADVANCE`, and terminal `COMPLETE` events; Graphite does not replace PR-state watching. After each `ADVANCE`, compare the next PR's current head/base with its frozen snapshot and rearm the provider watcher. Never append a newly discovered PR to the frozen queue.

If a required topology, arming, disarming, snapshot, comparison, or watcher operation is undocumented, stop. Never substitute another provider or invent a command.

## Commits

Stage the intended paths and commit with plain Git:

```sh
git commit -m "<message>"
```

## Non-interactive commands

Always pass `--no-interactive`.

| Use | Never |
|---|---|
| `gt --no-interactive log short --stack --reverse` | Guess parentage from GitHub `base` |
| `gt --no-interactive info <branch>` | `gt` from a worker |
| `gt submit --no-interactive` | `gt submit` without `--no-interactive` |
| `gt submit --merge-when-ready --always --update-only --no-interactive` | GitHub auto-merge on a stacked PR |
| `gt track -p <parent>` | `gh pr create --base` |
| `gh pr view` / checks / review replies | `gt` for those |

SHA via `git rev-parse`. After submit, `gh pr edit` titles and bodies; apply **unslop**.

## Core loop

```
gt --no-interactive create layer-one
# work
git commit -m "layer one"
gt --no-interactive create layer-two
# work
git commit -m "layer two"
gt submit --no-interactive
gt --no-interactive log short --stack --reverse
```

Adopt existing branches bottom to top: `gt track -p <parent>` per layer, then `gt submit --no-interactive`.

## Sync and land

- Sync: `gt --no-interactive sync`. Stacker only.
- Restack: stacker only. `gt --no-interactive restack`.
- Land: `gt submit --merge-when-ready --always --update-only --no-interactive`. `--always` is required; a no-op submit silently arms nothing. Never `gh pr merge` a stacked PR. Never GitHub auto-merge on a stacked PR. Children target unprotected parents and would collapse. If a previous agent armed GitHub auto-merge, disarm with `gh pr merge <n> --disable-auto`.
- After MWR is armed, do not `gt sync`, restack, or `gt submit --stack`. Independent work gets re-parented onto trunk.

Workers never rebase and never run topology commands. One stacker per stack.
