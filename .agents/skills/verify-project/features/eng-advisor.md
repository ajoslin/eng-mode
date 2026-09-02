# Eng-Advisor

## Sub-features

Inspect the passive reviewer, its selected model, and its role-specific prompt sources. Pause and re-enable it through the TUI command.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension and a model that the disposable profile can resolve. The profile must have broker credentials and any custom model definition that Eng-Advisor needs. Do not record credential values.

## Driving it with OMP TUI

1. Wait for normal session initialization, then run `/eng-advisor status`. An early status can omit `Role prompt:` and `Model:`.
2. Confirm the rendered status starts with `Eng-Advisor: enabled` and includes `Role:`, at least one `Role prompt:`, and `Model:` with the configured model alias and thinking level.
3. Send a benign normal turn. After it finishes, wait for the scheduled review and run `/eng-advisor status`. Confirm that `Last review:` appears and `Last error:` does not. A review-time failure is prerequisite or product evidence, not a pass.
4. Run `/eng-advisor off` and capture the `Eng-Advisor paused` notice.
5. Run `/eng-advisor on` and capture the `Eng-Advisor enabled` notice.
6. Run `/eng-advisor status` again and confirm that it reports enabled with the same role.

## Gotchas

A missing model, prompt, or valid configuration can prevent Eng-Advisor initialization. A missing credential causes a review failure with cooldown and retry instead of disabling initialization. Treat either result as a failed prerequisite, not product evidence. Re-enable the advisor before cleanup, stop the managed process, then remove the disposable profile.
