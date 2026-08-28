---
name: graphite
description: Graphite stacked PRs via gt. Use for stack parentage, submit, restack, merge-when-ready, Autopilot-stack, Shipping, or when a playbook names Graphite. Workers never run gt.
---

# Graphite

`gt` owns stack parentage and landing. GitHub `base` refs drift mid-restack; local Graphite tracking is the source of truth. `gh` still owns PR view, checks, review-comment replies, and `gh pr merge --disable-auto`. Never replace those with `gt`.

Stacking is a review aid, not the default branch strategy. Use one PR for ordinary coherent work. Encourage a stack when the change is large or complicated enough that one PR would be hard to review, and when its parts form a real dependency chain. Split by independently understandable concerns, not arbitrary file or line counts. Do not stack small work merely because later code depends on earlier code within the same coherent change.

If `gt` is missing or `gt --no-interactive auth` fails, stop and report. Do not invent a stack with `gh pr create --base` or `gh stack`.

Workers never run `gt`. One stacker per stack.

## Commits

Commit with `omp commit`, never `git commit` / `git commit -m`. Stage first only when the index must exclude unrelated dirty files; an empty index makes `omp commit` stage everything. Pass `-c` for intent the diff does not show. `--no-changelog` when the layer must not touch changelogs. `--push` is not stack submit. Do not use `gt create -m` (that commits with git).

```
omp commit -c "<why this layer>"
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
omp commit -c "..."
gt --no-interactive create layer-two
# work
omp commit -c "..."
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
