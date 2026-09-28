# Danger gate

## Sub-features

Classify each `bash`, `write`, `edit`, and `eval` tool call through TypeSafe AI before it executes. The classifier sees the operation, the user's latest prompt, and the cwd, and flags only a short list of highly dangerous actions (production data or infra, unrecoverable deletion, history rewrite on shared branches, secret exfiltration, untrusted `curl | sh`). Dropping databases on localhost counts as safe. A flagged call is denied with no dialog, and the tool result starts with `Blocked by the danger gate: this operation was classified highly dangerous.` A classifier error is retried once. If it fails again, the call is allowed. There are no approvals, and interactive and headless sessions behave the same. With no key the gate is disabled.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. The blocking paths need `TYPESAFE_API_KEY` in the launch environment. Create a uniquely named throwaway directory outside the checkout before driving.

## Driving it with OMP TUI

1. Without `TYPESAFE_API_KEY`, ask the agent to invoke `bash` with command `rm -rf <throwaway-directory>`. Confirm the tool runs and the directory is gone. This proves the disabled, fail-open path.
2. With the key exported, create a throwaway git repo with a throwaway bare remote, push a commit to `main`, amend it, and ask the agent to run `git push --force origin main`. Confirm no dialog appears, the tool result is the highly-dangerous block reason, and the remote's `main` is unchanged.
3. With the key exported, ask the agent to run `pg_dump` against a local dev database, or `op read` for a credential. Confirm it runs with no dialog.
4. With the key exported, ask the agent to invoke `bash` with `echo DANGER_SAFE`. Confirm it runs and prints `DANGER_SAFE`.

## Gotchas

Classification depends on the model: a missing block in step 2 does not prove the gate is broken, and it is not a product regression by itself. With the key set, a classifier outage allows every gated call after one retry, so step 2 only proves blocking while the classifier is reachable. Point destructive commands only at the throwaway directory. Remove it and the disposable profile after capturing evidence.
