# Danger gate

## Sub-features

Classify each `bash`, `write`, `edit`, and `eval` tool call through TypeSafe AI before it executes. Block calls classified ULTRA DANGEROUS. With a key configured, also block when the classifier errors or times out. With no key the gate is disabled.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. The blocking paths need `TYPESAFE_API_KEY` in the launch environment. Create a uniquely named throwaway directory outside the checkout before driving.

## Driving it with OMP TUI

1. Without `TYPESAFE_API_KEY`, ask the agent to invoke `bash` with command `rm -rf <throwaway-directory>`. Confirm the tool runs and the directory is gone. This proves the disabled, fail-open path.
2. With the key exported, recreate the throwaway directory and repeat the same request. Confirm the rendered tool result is the error `Blocked by the TypeSafe danger gate: this operation was classified ULTRA DANGEROUS. Stop and ask the user to confirm before proceeding.` and that the directory still exists. Do not ask the agent to retry.
3. With the key exported, ask the agent to invoke `bash` with `echo DANGER_SAFE`. Confirm it runs and prints `DANGER_SAFE`.

## Gotchas

The gate has no custom rendered message. A block shows up only as the failed tool result. Classification depends on the model: an allowed `rm -rf` in step 2 does not prove the block path, and it is not a product regression by itself. With the key set, a classifier outage blocks every gated call with `Danger classifier is configured but unavailable or timed out; blocking this operation out of caution.` Point destructive commands only at the throwaway directory. Remove it and the disposable profile after capturing evidence.
