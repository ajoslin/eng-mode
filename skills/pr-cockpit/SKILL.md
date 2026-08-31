---
name: pr-cockpit
description: PR Cockpit adapter for PR reads, waits, review mutations, and merges.
---

# PR Cockpit

Use `owner/repo#123` as `REF`. Use only `pr-cockpit` for forge work. Never fall back to `gh`, `gt`, native `github`, or `pr://`.

## Read and wait

```sh
pr-cockpit REF --json
pr-cockpit REF --diff
pr-cockpit REF --jobs
pr-cockpit REF --logs [CHECK]
pr-cockpit listen REF [--ci-only|--comments-only]
```

The cache is a warm read model; GitHub remains authoritative. Re-read after `listen` returns and before authority-sensitive decisions. Missing cached data is a failure, not proof of absence. Use `pr-cockpit --help` for less common reads.

## Review and mutate

Every body must come from `--body-file FILE`; never interpolate comment text into a shell command. Displayed thread handles are the mutation identifiers.

```sh
pr-cockpit comment REF --body-file FILE
pr-cockpit reply REF THREAD --body-file FILE
pr-cockpit resolve REF THREAD
pr-cockpit review REF approve [--body-file FILE]
pr-cockpit review REF request-changes --body-file FILE
pr-cockpit update-branch REF
```

Use `pr-cockpit --help` for the full mutation list. Successful mutations print JSON after GitHub accepts the change and the cache refreshes. On failure, inspect refreshed state before retrying an idempotent mutation.

## Merge

```sh
pr-cockpit merge REF
pr-cockpit merge REF --method squash|merge|rebase
```

Use `--force` only with explicit operator authorization to bypass Cockpit mergeability gates. Do not enable auto-merge unless the active playbook and operator explicitly require it.

## Unsupported operations

PR creation, CI reruns, and dependent stacks are unsupported. Stop; do not substitute another provider.

Unknown commands or invalid options exit 2. Runtime or mutation failures exit 1. Treat either as failure.
