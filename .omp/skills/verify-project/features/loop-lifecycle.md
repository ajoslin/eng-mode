# Loop lifecycle

## Sub-features

Start, inspect, pause, resume, and stop one bounded loop.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension and ask the agent to invoke `loop` with a prompt and limit of two.

## Driving it with OMP TUI

Observe the start result, repeated turn, and stopped status. Repeat for pause, resume, and stop.

## Gotchas

Pause clears the prompt, so resume requires it again. Continuation is proven only when the next turn runs and the limit or stop prevents another.
