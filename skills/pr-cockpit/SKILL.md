---
name: pr-cockpit
description: PR workflow adapter using PR Cockpit for cached state, reviews, waits, and independent merges; GitHub CLI for PR creation and CI reruns; and Graphite for dependent stacks.
---

# PR Cockpit forge adapter

Read this skill once and use its routing for every forge and pull-request operation. Do not choose a backend yourself.

Use `owner/repo#123` as `REF`. GitHub remains authoritative; PR Cockpit is the warm local read model and the default interface after a PR exists.

Before the first forge operation in a session, run `pr-cockpit --help`. If the command is unavailable, use the repository's `setup-pr-cockpit` skill. If that skill is absent, stop.

## Operation ownership

| Operation | Owner |
|---|---|
| PR state, diff, files, checks, jobs, and logs | PR Cockpit |
| Blocking waits | PR Cockpit |
| Comments, reviews, inline comments, and thread resolution | PR Cockpit |
| Branch update, metadata changes, and independent merge | PR Cockpit |
| Create an independent PR | GitHub CLI |
| Rerun GitHub Actions | GitHub CLI |
| Create, submit, restack, and land dependent stacks | Graphite |

This is explicit composition inside one selected provider. It is not permission to substitute tools. Use `gh` and `gt` only for the operations assigned to them below. Return to PR Cockpit for observation after every GitHub or Graphite mutation.

## Delivery interface

Use `pr-cockpit REF --json` as the authoritative snapshot of head SHA, base ref/SHA, checks, threads, and merge state; use `pr-cockpit REF --diff` for the receipts-and-diff audit. Re-read `--json` immediately before a decision and compare its current head and base with the pinned pair used for verification. A changed head or base invalidates the snapshot. Missing fields or cached data stop the operation; they never mean absent or ready.

Before watching a stack or queue, freeze its ordered PR references and head SHAs. The watcher record is `{ event, ref, head, base, reason }`, where `event` is exactly one of:

- `WAITING`: the frozen frontier is unchanged and `pr-cockpit listen REF` is armed.
- `READY`: a fresh JSON snapshot shows that frontier merge-ready at `head`.
- `ADVANCE`: the frozen frontier merged; move to the next frozen PR and snapshot it before rearming.
- `COMPLETE`: every PR in the frozen queue is merged. This is the only terminal event.

After `listen` returns, re-read full JSON and classify the event; watcher exit alone proves nothing. Rearm after `READY`, any mutation or reconnect, and `ADVANCE`, unless the result is `COMPLETE` or a blocker. Do not add PRs discovered after the queue was frozen; use a new watch.

For independent merge-when-ready, Shipping requests GitHub auto-merge with `pr-cockpit auto-merge REF enable`. Confirm arming only when a fresh JSON snapshot still names the requested head and reports GitHub auto-merge active. Disarm with `pr-cockpit auto-merge REF disable` and confirm it absent at the same head. `cockpit-auto-merge` is separate local automation, not this merge-when-ready operation. Command success or stale cached state is not confirmation.

For dependent stacks, one named stack owner is the topology owner. Only that owner runs Graphite's documented topology, append, merge-when-ready, or disarm operations. Freeze order through Graphite, then observe every affected PR through Cockpit. Confirm Graphite arming only when fresh Cockpit JSON at each recorded head reports the request active; confirm disarming reports it absent. After each `ADVANCE`, compare the next PR's current head/base with its frozen snapshot before rearming `listen`.

If this skill or `graphite` does not document a required operation, stop. A failed or unsupported operation never authorizes another provider or an improvised command.

## Read

```sh
pr-cockpit REF --json
pr-cockpit REF --diff
pr-cockpit REF --file PATH
pr-cockpit REF --jobs
pr-cockpit REF --logs [CHECK]
pr-cockpit cache-run REF RUN_ID
```

The cache may refresh in the background. Re-read before authority-sensitive decisions. Missing cached data is a failure, not proof of absence. `cache-run` fetches an existing Actions run and retains unsuccessful logs; it does not rerun CI.

Use `pr-cockpit --help` for less common reads and mutations.

## Wait

```sh
pr-cockpit listen REF
pr-cockpit listen REF --ci-only
pr-cockpit listen REF --comments-only
```

`listen` blocks until substantive cached state changes, then exits. It may return immediately when a blocker is already cached. Re-read full state after it returns. Do not poll when `listen` can represent the wait.

## Review and mutate

Every body must come from `--body-file FILE`; never interpolate untrusted text into a shell command. Displayed thread handles are the mutation identifiers.

```sh
pr-cockpit comment REF --body-file FILE
pr-cockpit reply REF THREAD --body-file FILE
pr-cockpit resolve REF THREAD
pr-cockpit unresolve REF THREAD
pr-cockpit review REF approve [--body-file FILE]
pr-cockpit review REF request-changes --body-file FILE
pr-cockpit review REF comment --body-file FILE
pr-cockpit inline-comment REF --path PATH --line N --side LEFT|RIGHT --body-file FILE
pr-cockpit update-branch REF
pr-cockpit ready-for-review REF
pr-cockpit close REF
pr-cockpit edit-body REF --body-file FILE
pr-cockpit edit-title REF "TITLE"
pr-cockpit assign REF LOGIN...
pr-cockpit unassign REF LOGIN...
pr-cockpit request-reviewers REF LOGIN...
pr-cockpit unrequest-reviewers REF LOGIN...
```

Successful mutations print JSON after GitHub accepts the change and Cockpit refreshes its cache. On failure, inspect refreshed state before retrying an idempotent mutation.

## Create an independent pull request

PR Cockpit does not create pull requests. After the Opening a PR gates pass, push the branch and create the PR with GitHub CLI:

```sh
git push -u origin HEAD
gh pr create --base BASE --head HEAD --title "TITLE" --body-file FILE
```

Always pass the body through `--body-file`. After creation, obtain the canonical `owner/repo#number` reference from the command result, then wait for and read the PR through Cockpit:

```sh
pr-cockpit REF --json
```

If the new PR has not reached the cache, allow the local refresh to complete and retry the Cockpit read. Do not continue routine PR work through `gh`.

## Rerun CI

Only rerun CI after the active playbook classifies the failure and permits a retry. PR Cockpit observes Actions but does not start reruns.

```sh
gh run rerun RUN_ID --failed
pr-cockpit listen REF --ci-only
pr-cockpit REF --json
```

Use `gh` only to start the rerun. Observe subsequent state through PR Cockpit. Never retry the same unchanged failure merely because a command is available.

## Independent merge

```sh
pr-cockpit merge REF
pr-cockpit merge REF --method squash
pr-cockpit merge REF --method merge
pr-cockpit merge REF --method rebase
```

Use `--force` only with explicit operator authorization to bypass Cockpit mergeability gates. Do not enable auto-merge unless the active playbook and operator authorize it.

PR Cockpit also exposes two per-PR automation controls:

```sh
pr-cockpit auto-merge REF enable
pr-cockpit auto-merge REF disable
pr-cockpit cockpit-auto-merge REF enable
pr-cockpit cockpit-auto-merge REF disable
```

These are not a repository-wide merge queue and do not model dependent-stack order.

## Dependent stacks

Graphite exclusively owns dependent-stack topology: parentage, creation, submission, restacking, and ordered landing. Read the `graphite` skill before using `gt`. Workers never run `gt`; one stack owner serializes topology changes.

Always use non-interactive commands. Typical operations include:

```sh
gt --no-interactive log short --stack --reverse
gt --no-interactive info BRANCH
gt track -p PARENT
gt --no-interactive create BRANCH
gt submit --no-interactive
gt submit --merge-when-ready --always --update-only --no-interactive
```

Do not emulate a stack with unrelated `gh pr create --base` calls. Do not use GitHub auto-merge on dependent PRs when it can merge a child before its parent. After every Graphite mutation, read affected PR state through PR Cockpit.

## Failure rules

- Unknown PR Cockpit commands or invalid options exit `2`; runtime or mutation failures exit `1`. Treat either as failure.
- A failed PR Cockpit read does not authorize a `gh` read fallback.
- A failed GitHub PR creation or CI rerun does not authorize another creation or rerun path.
- A failed Graphite operation does not authorize manual stack emulation.
- Never mix another forge provider into the operation routing defined here.
