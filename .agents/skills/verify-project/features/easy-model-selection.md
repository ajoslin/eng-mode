# Easy model selection

## Sub-features

Select the configured `eng_mode_easy` role when the first prompt of a session contains `/easy`, keep the thinking level, and ignore `/easy` on every later prompt.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension, an explicit `--model`, and an explicit `--thinking` level that differs from the `eng_mode_easy` role's own suffix. The status bar shows the current model name and a thinking glyph; that pair is the evidence.

## Driving it with OMP TUI

1. In a fresh session, capture the status bar, then submit `/easy Reply exactly MODEL_OK and stop.`.
2. Confirm the rendered user prompt is `Reply exactly MODEL_OK and stop.` with `/easy` removed, the reply is `MODEL_OK`, and the status bar now names the `eng_mode_easy` model with the thinking glyph unchanged.
3. Stop that session. In a second fresh session with the same launch flags, submit `Reply exactly BASE_OK and stop.` and confirm the model is unchanged.
4. Submit `/easy Reply exactly LATE_OK and stop.`. Confirm the rendered prompt keeps `/easy`, the reply is `LATE_OK`, and the model is still the launch model.

## Gotchas

Selection happens only when the session branch has no prior user message and the session has not already selected. `/easy` is stripped from the prompt only when selection happens. A missing role fails the turn with `/easy requires a configured eng_mode_easy model role.`; a role without credentials fails with `/easy could not select eng_mode_easy: no API key available.`. The role's own thinking suffix is not applied; the launch thinking level is restored after the switch.
