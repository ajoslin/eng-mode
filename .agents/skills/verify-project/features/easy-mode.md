# Easy mode

## Sub-features

Switch the session to the `@eng_mode_easy` model role at low thinking through the `/easy` command, and strip a trailing or leading `/easy` modifier from an `/eng-mode` prompt before it submits.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. The disposable profile must resolve the `eng_mode_easy` model role. Copy the workstation `config.yml` into the profile before launch if that role is not set there.

## Driving it with OMP TUI

1. Send `/easy` with no arguments. Confirm the notice `Easy mode selected.` renders and the status bar model changes to the `eng_mode_easy` model, such as `GPT 5.6 Sol`. No agent turn starts.
2. Send `/easy Reply exactly EASY_OK and stop.` Confirm the transcript shows the submitted prompt as `/eng-mode Reply exactly EASY_OK and stop.` and the agent replies `EASY_OK`.
3. Send `/eng-mode Reply exactly MODIFIER_OK and stop. /easy`. Confirm the transcript shows `/eng-mode Reply exactly MODIFIER_OK and stop.` with the modifier removed and the agent replies `MODIFIER_OK`.

## Gotchas

The modifier only applies when the prompt contains `/eng-mode` and `/easy` stands alone as a word. `/easy-mode` or a prompt without `/eng-mode` submits unchanged. When the role is missing or the model cannot be activated, an error notice renders (`Model role @eng_mode_easy is not configured.` or `... is unavailable.`) and nothing submits. The model switch persists for the rest of the session. Relaunch or switch models before other recipes that expect the launch model.
