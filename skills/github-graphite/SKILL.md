---
name: github-graphite
description: GitHub and Graphite forge adapter for PR reads, waits, creation, review, merges, CI reruns, and dependent stacks.
---

# GitHub and Graphite

Use `better-github-skill` for GitHub operations and `graphite` for dependent-stack topology and landing. Do not mix another forge provider into an operation.

## Delivery interface

Use one SHA-pinned snapshot for every decision. Run `pr-snapshot.ts --json`, then `pr-threads.ts --json`, then `pr-snapshot.ts --json` again. Accept the snapshot only when both state reads name the same head SHA and base ref; the state supplies head, base, checks, and merge state, while the middle read supplies review threads. Resolve the base ref and compare it with that exact head through `gh api 'repos/{owner}/{repo}/compare/BASE...HEAD'`. A changed head or resolved base SHA invalidates the snapshot.

Before watching a stack or queue, freeze its ordered PR references and head SHAs. The watcher record is `{ event, ref, head, base, reason }`, where `event` is exactly one of:

- `WAITING`: the frozen frontier is unchanged and a documented blocking wait is armed.
- `READY`: a fresh snapshot shows that frontier merge-ready at `head`.
- `ADVANCE`: the frozen frontier merged; move to the next frozen PR and snapshot it before rearming.
- `COMPLETE`: every PR in the frozen queue is merged. This is the only terminal event.

Arm `gh pr checks REF --watch --fail-fast` or `gh run watch RUN_ID`, record `WAITING`, and classify its return from a fresh paired snapshot. After `READY`, any mutation, or `ADVANCE`, re-read the exact head/base and rearm unless the result is `COMPLETE` or a blocker. Never treat watcher exit status alone as readiness. Do not add PRs discovered after the queue was frozen; handle them in a new watch.

For an independent PR, Shipping may request merge-when-ready with `gh pr merge REF --auto`; confirm arming only when a fresh `gh pr view REF --json headRefOid,baseRefName,autoMergeRequest` still names the requested head and reports a non-null request. Disarm with `gh pr merge REF --disable-auto`, then confirm the same field is null at the same head. A command success or stale snapshot is not confirmation.

For a dependent stack, the single stacker named for that stack owns every topology read and mutation. The stacker uses the operations in `graphite`; nobody else appends, tracks, submits, syncs, restacks, requests merge-when-ready, or disarms it.

If this skill or either routed skill does not document a required operation, stop. A failed or unsupported operation never authorizes another provider or an improvised command.

## GitHub operations

- **Read:** `pr://REF` for ordinary PR state. Use `better-github-skill`'s `pr-snapshot.ts`, `pr-threads.ts`, and `ci-failures.ts` when their richer views are needed.
- **Wait:** `gh pr checks REF --watch --fail-fast` or `gh run watch RUN_ID`. Use native goal mode only when the request requires continued watching across runs.
- **Open:** native `github` `pr_create`, after the Opening a PR gates.
- **Review:** use the review and thread commands documented by `better-github-skill`. Pass every comment or review body through a file payload, never shell-interpolated text.
- **Merge:** `gh pr merge REF` for an independent PR. Stacked PRs use Graphite landing instead.
- **Rerun CI:** after the active playbook permits a retry, run `gh run rerun RUN_ID --failed`, then `gh run watch RUN_ID`.

## Dependent stacks

Read `graphite` and follow its commands exactly. Graphite owns parentage, submit, restack, and stacked landing; GitHub continues to own PR state, checks, and review conversations.
