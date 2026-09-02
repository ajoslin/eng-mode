# Repository contract gate

## Sub-features

Observe configured, missing, malformed, and explicitly unconfigured `project-standards` and `verify-project` contracts.

## How to get to it (user POV)

Ask the agent to call `eng_orch` with `action: contracts`, the repository root, and either read-only or code-producing mode.

## Driving it with OMP TUI

Call the tool against this checkout and inspect the rendered structured decision. This configured checkout must return `proceed` for code-producing mode.

## Gotchas

Read-only mode may proceed without standards but cannot claim policy compliance. Missing or malformed standards block mutation. Missing verification makes product-surface proof inconclusive rather than authorizing a substitute surface.
