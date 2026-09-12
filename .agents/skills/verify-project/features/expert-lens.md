# Automatic expert lens

## Sub-features

Classify a consequential decision prompt and inject the expert-decision guidance before the agent starts.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. The disposable profile must resolve both the selected session model and the `@tiny` model used by the classifier. A disposable profile has no broker credentials. Export the `@tiny` provider's API key into the launch environment before starting OMP. When `@tiny` is an OpenRouter model, use `OPENROUTER_API_KEY="$(omp token openrouter)"`.

## Driving it with OMP TUI

1. Enter a prompt that requires a material choice among plausible alternatives and forbids tool use, such as `Choose the storage architecture for this service. Answer in two sentences without reading files or using tools.`
2. Before the agent response, capture the rendered custom message labeled `Expert lens`.
3. Treat the agent's stated trade-offs and challenge to its initial choice as supporting evidence only. The rendered contract proves the `Expert lens` label, not the hidden guidance text.
4. In a fresh turn, enter the self-contained no-write request `Rewrite the supplied heading "SYSTEM SETTINGS" in sentence case. Reply with only the rewritten heading. Do not inspect or edit files.` Confirm that no `Expert lens` message renders for that turn.

## Gotchas

The classifier defaults to ordinary when `@tiny` is unavailable, credentials are missing, the classifier errors, or its output is not exactly `expert`. Such a run does not verify expert injection. A missing `Expert lens` on the first turn usually means the key was not exported, not a product regression. Without the no-tools clause, the agent may open an `ask` dialog that holds the composer until dismissed. Stop the managed process and remove the disposable profile after capturing both turns.
