---
name: github-graphite
description: GitHub and Graphite forge adapter for PR reads, waits, creation, review, merges, CI reruns, and dependent stacks.
---

# GitHub and Graphite

Use `better-github-skill` for GitHub operations and `graphite` for dependent-stack topology and landing. Do not mix another forge provider into an operation.

## GitHub operations

- **Read:** `pr://REF` for ordinary PR state. Use `better-github-skill`'s `pr-snapshot.ts`, `pr-threads.ts`, and `ci-failures.ts` when their richer views are needed.
- **Wait:** `gh pr checks REF --watch --fail-fast` or `gh run watch RUN_ID`. Use native goal mode only when the request requires continued watching across runs.
- **Open:** native `github` `pr_create`, after the Opening a PR gates.
- **Review:** use the review and thread commands documented by `better-github-skill`. Pass every comment or review body through a file payload, never shell-interpolated text.
- **Merge:** `gh pr merge REF` for an independent PR. Stacked PRs use Graphite landing instead.
- **Rerun CI:** after the active playbook permits a retry, run `gh run rerun RUN_ID --failed`, then `gh run watch RUN_ID`.

## Dependent stacks

Read `graphite` and follow its commands exactly. Graphite owns parentage, submit, restack, and stacked landing; GitHub continues to own PR state, checks, and review conversations.
