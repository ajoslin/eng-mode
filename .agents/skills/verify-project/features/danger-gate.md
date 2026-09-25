# Danger gate

## Sub-features

Classify each `bash`, `write`, `edit`, and `eval` tool call through TypeSafe AI before it executes. For calls classified ULTRA DANGEROUS, an attached user decides in a confirm dialog; approval runs the call, denial blocks it. Without a UI (subagents, headless sessions) the call is blocked. Teardown of disposable resources (dev stacks, scratch or per-run databases, temp directories) is classified DANGEROUS and runs without a prompt. With a key configured, also block when the classifier errors or times out. With no key the gate is disabled.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. The blocking paths need `TYPESAFE_API_KEY` in the launch environment. Create a uniquely named throwaway directory outside the checkout before driving.

## Driving it with OMP TUI

1. Without `TYPESAFE_API_KEY`, ask the agent to invoke `bash` with command `rm -rf <throwaway-directory>`. Confirm the tool runs and the directory is gone. This proves the disabled, fail-open path.
2. With the key exported, recreate the throwaway directory and repeat the same request. Confirm a "Danger gate: ULTRA DANGEROUS operation" dialog appears showing `bash: rm -rf <throwaway-directory>`. Decline it: the rendered tool result is `Blocked by the TypeSafe danger gate: the user declined this ULTRA DANGEROUS operation. Do not retry it; ask the user how to proceed.` and the directory still exists. Ask again and approve: the directory is gone. In a subagent or headless session the same call is blocked with `…no user is attached to confirm it…`.
3. With the key exported, ask the agent to invoke `bash` with `echo DANGER_SAFE`. Confirm it runs and prints `DANGER_SAFE`.

## Gotchas

The gate has no custom rendered message. A block shows up only as the failed tool result. Classification depends on the model: an allowed `rm -rf` in step 2 does not prove the block path, and it is not a product regression by itself. With the key set, a classifier outage blocks every gated call with `Danger classifier is configured but unavailable or timed out; blocking this operation out of caution.` Point destructive commands only at the throwaway directory. Remove it and the disposable profile after capturing evidence.
