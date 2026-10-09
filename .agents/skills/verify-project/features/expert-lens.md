# Automatic expert lens

## Sub-features

Classify a consequential decision prompt and inject the expert-decision guidance before the agent starts.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension with `TYPESAFE_API_KEY` exported into the launch environment. The classifier is TypeSafe AI (`jev-latest` through `src/typesafe.ts`), not an OMP model role. Without the key the classifier reports `disabled` and no lens renders.

## Driving it with OMP TUI

1. Enter a prompt that requires a material choice among plausible alternatives and forbids tool use, such as `Choose the storage architecture for this service. Answer in two sentences without reading files or using tools.`
2. Before the agent response, capture the rendered custom message labeled `Expert lens`.
3. Treat the agent's stated trade-offs and challenge to its initial choice as supporting evidence only. The rendered contract proves the `Expert lens` label, not the hidden guidance text.
4. Immediately after the lensed turn, enter another consequential prompt, such as `Choose the deployment architecture for this service. Answer in two sentences without reading files or using tools.` Confirm that no new `Expert lens` message renders because the 50,000-token cooldown is active.
5. In a fresh turn, enter the self-contained no-write request `Rewrite the supplied heading "SYSTEM SETTINGS" in sentence case. Reply with only the rewritten heading. Do not inspect or edit files.` Confirm that no `Expert lens` message renders for that turn.

## Gotchas

No lens renders when `TYPESAFE_API_KEY` is unset (verdict `disabled`), when the classifier throws or exceeds its 5-second deadline (verdict `error`), or when it returns `ordinary`. The classifier also skips prompts that already contain guidance, and skips every prompt while the active session branch shows the last guidance followed by fewer than 50,000 non-cached assistant input and output tokens and no compaction or `/clear` boundary. A missing lens during cooldown does not verify classification. A missing `Expert lens` on the first turn usually means the key was not exported, not a product regression. Without the key, step 1 still proves the fail-open path: the turn runs normally with no `Expert lens` message. Without the no-tools clause, the agent may open an `ask` dialog that holds the composer until dismissed. Stop the managed process and remove the disposable profile after capturing the turns.
