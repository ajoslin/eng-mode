# Automatic expert lens

## Sub-features

Classify a consequential decision prompt and inject the expert-decision guidance before the agent starts.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. The disposable profile must resolve both the selected session model and the `@tiny` model used by the classifier, with credentials available through the broker.

## Driving it with OMP TUI

1. Enter a prompt that requires a material choice among plausible alternatives, such as `Choose the storage architecture for this service.`
2. Before the agent response, capture the rendered custom message labeled `Expert lens`.
3. Treat the agent's stated trade-offs and challenge to its initial choice as supporting evidence only. The rendered contract proves the `Expert lens` label, not the hidden guidance text.
4. In a fresh turn, enter the self-contained no-write request `Rewrite the supplied heading "SYSTEM SETTINGS" in sentence case. Reply with only the rewritten heading. Do not inspect or edit files.` Confirm that no `Expert lens` message renders for that turn.

## Gotchas

The classifier defaults to ordinary when `@tiny` is unavailable, credentials are missing, the classifier errors, or its output is not exactly `expert`. Such a run does not verify expert injection. Stop the managed process and remove the disposable profile after capturing both turns.
