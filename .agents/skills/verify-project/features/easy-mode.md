# Easy session pin

## Sub-features

`/easy` pins the whole session to the `@eng_mode_easy` model role at medium thinking. `/easy TASK` submits `/eng-mode TASK` after pinning. An `/eng-mode … /easy` modifier strips the modifier and pins before the prompt starts. The pin persists across later prompts and refuses `escalate`, so `@panel_fable` never leads that session.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. The disposable profile must resolve `eng_mode_easy`.

## Driving it with OMP TUI

1. Send `/easy` with no arguments. Confirm `Easy mode selected for this session.` renders, the status bar changes to the `eng_mode_easy` model, and no agent turn starts.
2. Send `/easy Reply exactly EASY_OK and stop.` Confirm the transcript submits `/eng-mode Reply exactly EASY_OK and stop.`, the status bar remains on `eng_mode_easy`, and the agent replies `EASY_OK`.
3. Relaunch. Send `/eng-mode Reply exactly MODIFIER_OK and stop. /easy`. Confirm the submitted prompt has the modifier removed, the status bar changes directly to `eng_mode_easy`, and the agent replies `MODIFIER_OK` without a Fable turn.
4. Send `Call the escalate tool with reason "expert review" and evidence "needs expert review to ship", then report its exact result.` Confirm the rendered result is `refused: this session is pinned to the execution tier by /easy` and the status bar remains on `eng_mode_easy`.

## Gotchas

The modifier applies only when the prompt contains `/eng-mode` and `/easy` stands alone as a word. `/easy-mode` and prompts without `/eng-mode` are unchanged. A missing or unavailable role renders an error and does not pin the session. Relaunch before recipes that require the expert-tier launch model.
