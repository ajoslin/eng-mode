---
name: github
description: GitHub forge adapter for PR reads, waits, creation, review, merges, CI reruns, and dependent stacks via gh stack.
---

# GitHub

Use `better-github-skill` for GitHub operations and `gh-stack` for dependent-stack topology and landing. Do not mix another forge provider into an operation.

## Delivery interface

Use one SHA-pinned snapshot for every decision. Run `pr-snapshot.ts --json`, then `pr-threads.ts --json`, then `pr-snapshot.ts --json` again. Accept the snapshot only when both state reads name the same head SHA and base ref. The state supplies head, base, checks, and merge state, while the middle read supplies review threads. Resolve the base ref and compare it with that exact head through `gh api 'repos/{owner}/{repo}/compare/BASE...HEAD'`. A changed head or resolved base SHA invalidates the snapshot.

Before watching a stack or queue, freeze its ordered PR references and head SHAs. The watcher record is `{ event, ref, head, base, reason }`, where `event` is exactly one of:

- `WAITING`: the frozen frontier is unchanged and a documented blocking wait is armed.
- `READY`: a fresh snapshot shows that frontier merge-ready at `head`.
- `ADVANCE`: the frozen frontier merged. Move to the next frozen PR and snapshot it before rearming.
- `COMPLETE`: every PR in the frozen queue is merged. This is the only terminal event.

Arm `gh pr checks REF --watch --fail-fast` or `gh run watch RUN_ID`, record `WAITING`, and classify its return from a fresh paired snapshot. After `READY`, any mutation, or `ADVANCE`, re-read the exact head/base and rearm unless the result is `COMPLETE` or a blocker. Never treat watcher exit status alone as readiness. Do not add PRs discovered after the queue was frozen. Handle them in a new watch.

For an independent PR, Shipping lands one of two ways. Both pin the snapshot head.

- **Already `READY`:** submit an async merge (below). Treat it as the merge-when-ready request. Arming is confirmed when the response is `pending` with `details.expected_head_sha` equal to the pinned head, or already `merged` / `enqueued`.
- **Checks still running:** request auto-merge with `gh pr merge REF --auto --match-head-commit HEAD`. The async API does not wait for checks; it evaluates rules when it runs and fails. Confirm arming only when a fresh `gh pr view REF --json headRefOid,baseRefName,autoMergeRequest` still names the requested head and reports a non-null request. Disarm with `gh pr merge REF --disable-auto`, then confirm the same field is null at the same head.

A command success or stale snapshot is not confirmation.

### Async merge

GitHub's recommended programmatic merge path (GA 2026-10-01). It is the only merge API that handles stacked PRs; for stacks use `gh stack merge`, which calls it.

```sh
gh api -X PUT 'repos/{owner}/{repo}/pulls/N/merge-async' \
  -f sha=HEAD -f merge_method=squash -f merge_action=default
until s=$(gh api 'repos/{owner}/{repo}/pulls/N/merge-async/UUID' --jq .status) && [ "$s" != pending ]; do sleep 2; done; echo "$s"
```

- `sha` pins the head. A push after the request cancels the merge, so a stale snapshot cannot land.
- `merge_action`: `default` uses the base branch's merge queue when one exists, else merges directly. `direct_merge` skips the queue; `merge_queue` forces it. `merge_method`, `commit_title`, and `commit_message` apply only to direct merges.
- Submit returns `202` + `pending` with `details.uuid`, `200` when already `merged` (`details.sha` is the merge commit) or `enqueued`, `400` when closed or draft, and `409` with the existing request's uuid and options when one is already pending. Compare a `409`'s options before trusting it. `gh api` exits non-zero on `4xx` but still prints the body.
- Only open and not-draft are checked at submit. Branch protection and rulesets run when the merge executes, and a rule failure comes back as `failed` with `details.message`. That is a blocker, not a retry.
- `enqueued` is final for the request but does not mean merged. Keep the watcher armed until the PR reports `MERGED`, then emit `ADVANCE` or `COMPLETE`.
- Results expire 24 hours after their last update; the uuid then returns `404`.
- `bypass_rules: true` bypasses only rules the actor may bypass. Use it only with explicit operator authorization, like `--admin`.
- If the endpoint itself returns `404` (a host without async merge), use `gh pr merge REF --squash --match-head-commit HEAD`.

For a dependent stack, the single stacker named for that stack owns every topology read and mutation. The stacker uses the operations in `gh-stack`. Nobody else appends, submits, syncs, rebases, or merges it.

If this skill or either routed skill does not document a required operation, stop. A failed or unsupported operation never authorizes another provider or an improvised command.

## GitHub operations

- **Read:** `pr://REF` for ordinary PR state. Use `better-github-skill`'s `pr-snapshot.ts`, `pr-threads.ts`, and `ci-failures.ts` when their richer views are needed.
- **Wait:** `gh pr checks REF --watch --fail-fast` or `gh run watch RUN_ID`. Use native goal mode only when the request requires continued watching across runs.
- **Open:** native `github` `pr_create`, after the Opening a PR gates.
- **Review:** use the review and thread commands documented by `better-github-skill`. Pass every comment or review body through a file payload, never shell-interpolated text.
- **Merge:** async merge (above) for an independent `READY` PR; `gh pr merge REF --auto --match-head-commit HEAD` while checks run. Stacked PRs use `gh stack merge`.
- **Rerun CI:** after the active playbook permits a retry, run `gh run rerun RUN_ID --failed`, then `gh run watch RUN_ID`.

## Dependent stacks

Read `gh-stack` and follow its commands exactly. `gh stack` owns parentage, submit, rebase, and stacked landing. GitHub continues to own PR state, checks, and review conversations.
