---
name: eng-github
description: The only way to touch GitHub. Use for every PR read, snapshot, wait, review thread, comment, label, CI failure, rerun, merge, auto-merge, branch update, stacked PR, and raw GitHub API call. Replaces gh, gh api, gh stack, gh pr checks --watch, and pr-cockpit, which are blocked.
---

# eng-github

`eng-github` is a single CLI that talks to GitHub's REST and GraphQL APIs directly. It reads many PRs in one aliased GraphQL document, asks a cheap fingerprint question before any full read, and pauses every request for a credential until the reset time GitHub gives when it is rate limited.

Run it as:

```sh
bun <this skill's directory>/scripts/eng-github.ts COMMAND ...
```

Below, `eg` stands for that command. Every command prints JSON on stdout, except `diff` and `file`, which print the raw diff or file text. `REF` is `owner/repo#123`, a PR URL, or a bare number inside a checkout whose `origin` is on GitHub.

Raw `gh`, `gh api`, `gh stack`, `pr-cockpit`, and `curl` to `api.github.com` are blocked in Eng Mode sessions. `gh auth login`, `gh auth status`, and `gh auth token` stay available because `eg` reads its token through them. If `eg` does not document an operation, use `eg api` or `eg graphql`. Never fall back to another tool.

## Credentials

`eg` uses the first token it finds:

1. `ENG_GITHUB_TOKEN`
2. `GH_TOKEN`, then `GITHUB_TOKEN`
3. `gh auth token --hostname github.com`, adding `--user ACCOUNT` when `ENG_GITHUB_ACCOUNT` is set

Set `ENG_GITHUB_ACCOUNT` when the active `gh` account cannot write to the repository. `eg whoami` prints the login, token source, and quota without spending quota beyond one `rateLimit` read.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. The JSON on stdout is the answer. |
| 1 | GitHub refused or the request failed. stderr has the reason and the response body. |
| 2 | Bad arguments. |
| 3 | A merge conflict, failed rebase, or failed merge rule. |
| 4 | Head or stack changed since the SHA you pinned. Re-snapshot before deciding. |
| 75 | Rate limited. stderr names the reset time. Wait until then. It is never a failure and never a reason to retry sooner. |

## Rate limits

All `eg` processes on a machine share one state file per credential under `~/.local/state/eng-github/`. When GitHub returns 429, a `RATE_LIMITED` GraphQL error, or a 403 with exhausted quota or `retry-after`, `eg` records the reset time and refuses every request for that credential until then with exit 75. A secondary limit without a deadline backs off from 30 seconds up to 15 minutes. Background reads (`watch`) stop when 10% of the GraphQL quota is left, keeping that reserve for interactive commands. Mutations are spaced at least one second apart.

Never wrap `eg` in a retry loop or `sleep`. Exit 75 already tells you when to come back.

## Read

| Command | Returns |
|---|---|
| `eg snapshot REF...` | One GraphQL document for up to 25 PRs. Per PR: `headSha`, `baseRef`, `baseSha`, `behindBy`, `state`, `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `autoMerge`, `labels`, `checks` (name, status, conclusion, required), `threads` (id, resolved, outdated, path, line, author, body, comment count), latest review per author, and stack membership. One ref prints one object; several print an array. |
| `eg fingerprint REF...` | The cheap change detector `watch` uses: state, head, mergeability, check counts by state, comment and review counts with newest timestamps. |
| `eg threads REF [--unresolved]` | Every review thread with all comments, paginated. Thread `id` is the handle for `reply` and `resolve`. |
| `eg comments REF` | Issue comments and review bodies, oldest first. |
| `eg diff REF [--name-only]` | The PR diff, or changed paths with additions and deletions. |
| `eg file REF PATH [--ref SHA]` | File contents at the PR head or at `SHA`. |
| `eg ci REF` | Failing checks, their failing jobs and steps, and the last 80 log lines per failed job. Full logs are written to files whose paths are printed. When a job's log is unavailable, its `log` names the HTTP status and its `path` is `null`. |
| `eg runs [--branch B] [--workflow W] [--limit N]` | Recent workflow runs with conclusions. |
| `eg pr list [--state open] [--head BRANCH] [--limit N]` | PRs in the current repository. |
| `eg whoami` | Login, token source, and remaining REST and GraphQL quota. |

`snapshot` replaces the old paired snapshot. It is one request, so its head, base, checks, and threads come from one GraphQL execution. Treat it as the pinned snapshot for every decision. A later snapshot with a different `headSha` or `baseSha` invalidates it.

## Wait

```sh
eg watch REF... [--until any|ci|comments] [--interval 120] [--timeout 1800]
```

`watch` blocks. Every interval it reads the fingerprints of all watched PRs in one request and exits as soon as one of them has news. It prints `{ "event", "ref", "head", "base", "reason" }`. The events are:

- `checks-failed`: a check newly failed, was cancelled, or needs approval. Repeated failures of the same check do not wake it again.
- `checks-passed`: every required check passed, or every check when none are required.
- `activity`: someone other than you commented, reviewed, or replied to a thread.
- `conflict`: the PR became unmergeable.
- `head-changed`: a new head was pushed.
- `merged` or `closed`.
- `timeout`: nothing changed before `--timeout`.

`--until ci` ignores `activity`. `--until comments` ignores the check events. Only changes after `watch` starts wake it. Handle what is already there first.

The interval defaults to 120 seconds and cannot go below 30, because checks take minutes and every request spends quota shared by every machine on the account. While the credential is rate limited, `watch` sleeps until the reset and keeps watching. It exits 1 only after 8 consecutive failures that are not rate limits.

Run `watch` as one managed background process and wait for it to exit. Do not run `snapshot`, `ci`, or `sleep` in a loop while it is armed.

```
hub start name=pr-watch application=bun args=[<skill dir>/scripts/eng-github.ts, watch, REF, --until, ci]
hub wait name=pr-watch for=exit timeout=1800
eg snapshot REF
```

A wake is news, not readiness. Classify it from a fresh `snapshot`.

## Watcher events for queues

Before watching a stack or queue, freeze its ordered PR references and head SHAs. Record each wake as `{ event, ref, head, base, reason }` with exactly one of:

- `WAITING`: the frozen frontier is unchanged and `watch` is armed.
- `READY`: a fresh `snapshot` shows that frontier merge-ready at `head`.
- `ADVANCE`: the frozen frontier merged. Move to the next frozen PR and snapshot it before rearming.
- `COMPLETE`: every PR in the frozen queue merged. This is the only terminal event.

Pass every frozen PR to one `watch` so they share one fingerprint request. Rearm after `READY`, any mutation, and `ADVANCE`, unless the result is `COMPLETE` or a blocker. Do not add PRs discovered after the queue was frozen.

## Review and mutate

Every body comes from `--body-file FILE`. Never build a shell command from comment text.

```sh
eg pr create --base BASE --head BRANCH --title "TITLE" --body-file FILE
eg pr edit REF [--title "TITLE"] [--body-file FILE] [--add-label L]... [--remove-label L]... [--ready] [--draft]
eg comment REF --body-file FILE
eg reply REF THREAD_ID --body-file FILE
eg resolve REF THREAD_ID
eg unresolve REF THREAD_ID
eg review REF approve|request-changes|comment [--body-file FILE]
eg close REF
eg update-branch REF --head SHA
eg rerun RUN_ID [--failed]
```

`pr create` opens ready for review unless `--draft` is passed and prints the new PR's snapshot. Confirm the URL, `headSha`, `baseRef`, and `isDraft: false` from that output.

## Merge

```sh
eg merge REF --head SHA [--method squash|merge|rebase] [--action default|direct|queue]
eg auto-merge REF enable --head SHA [--method squash|merge|rebase]
eg auto-merge REF disable
```

`merge` submits GitHub's async merge with `sha` pinned to `--head`, then polls with backoff (1, 2, 4 seconds and so on, capped at 10) for up to five minutes. A push after the request cancels it, so a stale snapshot cannot land. It prints the final status: `merged`, `enqueued`, `failed` with GitHub's message (exit 3), or `pending` if the deadline passed. `enqueued` means the merge queue owns it. Keep watching until `merged`.

`auto-merge enable` arms GitHub auto-merge with `expectedHeadOid` set to `--head` and prints a fresh snapshot. Arming is confirmed only when that snapshot shows `autoMerge` non-null at the same `headSha`. Disarm with `auto-merge disable` and confirm `autoMerge` is null.

`--action default` uses the merge queue when the base branch has one. `direct` skips it. `queue` forces it. `--admin` sets `bypass_rules` and requires explicit operator authorization.

## Stacks

GitHub stacks are the source of truth for stack topology. `eg` reads and changes them through the stacks REST API and moves branches with local git.

```sh
eg stack view REF|--stack N
eg stack submit --base BASE BRANCH...
eg stack add --stack N BRANCH...
eg stack rebase --stack N --heads PR=SHA,...
eg stack merge --stack N --target PR --heads PR=SHA,... [--method squash]
eg stack unstack --stack N
```

- `view` prints the stack's number, base, and layers bottom to top with PR number, branch, head SHA, state, and draft flag. It prints `null` when the PR is not in a stack.
- `submit` and `add` give new PRs the first commit subject as the title and an empty body. Set the body afterwards with `eg pr edit REF --body-file FILE`.
- `submit` pushes each branch, creates any missing PR with its base set to the branch below it, and creates the stack from those PRs bottom to top. Existing PRs with a wrong base are retargeted.
- `add` pushes and appends branches on top of an existing stack the same way.
- `rebase` checks that every open layer's head still equals `--heads`, then rebases each layer's own commits onto the new tip of the layer below, starting from the stack base, and pushes with `--force-with-lease` pinned to the recorded SHA. A layer's own commits are those after the recorded head of the layer below it, merged or closed layers included. The bottom layer of the stack starts after its merge-base with `origin/BASE` as it was before the fetch. When that cutoff is not an ancestor of the layer, it refuses with exit 4. It stops at the first conflict with exit 3, naming the layer and the files. Resolve, then run it again with the new heads. Run it from a clean worktree with no rebase, merge, cherry-pick, or revert in progress; otherwise it exits 2. After the push it moves each local branch that still points at its recorded head to the new head; the checked-out branch moves with `git reset --keep`. Each layer's `local` reports `updated`, `absent`, `diverged` (local commits, left alone), or `checked-out-elsewhere` (another worktree, left alone).
- `merge` checks `--heads` against every open layer up to `--target`, then submits the async merge on the target. GitHub lands every layer below it in order.
- `unstack` dissolves the stack on GitHub. PRs and branches stay.

Exit 4 from any stack command means the stack changed since your `--heads`. Run `stack view` and decide again.

Only the named stack owner runs `stack submit`, `add`, `rebase`, `merge`, or `unstack`. Workers never run them. One owner per stack. Never use `auto-merge` on a stacked PR, because a child targets an unprotected parent and would collapse into it.

### When to stack

Use one PR for ordinary coherent work. Size a change by its hand-written logic, not raw lines. Generated code, lockfiles, snapshots, vendored files, and mechanical churn do not count.

- Around 1,000 to 3,000 lines of hand-written logic, encourage a stack split by reviewable concern. Plan the layers before writing code.
- Never require one. A single PR is correct at any size when the work does not separate into independently understandable concerns.
- Mechanical refactors are exempt. When practical, put the hand-written logic that rides along in its own layer.
- Split by concern, not by file or line count.

## Raw API

```sh
eg api [--method GET|POST|PUT|PATCH|DELETE] PATH [--field key=value]... [--input FILE] [--paginate]
eg graphql --query-file FILE [--var key=value]... [--paginate]
```

These go through the same credential, pause, budget, and conditional-request cache as every other command. `--paginate` follows `Link` headers for REST and `pageInfo.endCursor` for GraphQL queries that declare `$endCursor`. Use them only for operations the commands above do not cover.

## Failure rules

- Exit 75 means wait for the printed reset. Do not retry sooner, switch tools, or poll quota.
- Exit 4 means re-snapshot. Never act on the old SHA.
- A failed `eg` command never authorizes raw `gh`, `curl`, or a hand-built stack.
