# Build, debug, verify, and deliver

Match evidence to the changed contract.

- LSP: definitions, references, implementations, renames, imports, server fixes.
- Debugger: live state, breakpoints, variables, threads, memory.
- Browser: actual web interaction and appearance.
- Process hub: services, watchers, debuggers, REPLs, interactive programs.
- Repository verification skill: exact product launch, health, drive, evidence, cleanup.

Compilation proves compilation. A test proves its assertions. Runtime reproduction proves its scenario. Product verification proves behavior on the real surface. Drive web and mobile changes in their clients, CLI/TUI changes in the real program, jobs through a real worker, migrations through apply/readback, and cross-runtime contracts in every affected runtime. A failed health gate or wrong surface is **inconclusive**.

Ask for the proof as an artifact you can inspect: the failing test then the passing one, a before-and-after video, the trace, the screenshot. If the fix already merged, ask for the same check again on main.

Bug fixes reproduce first and remove the cause. Features name shape and ownership. Refactors pin behavior. Performance work records comparable baseline and result. Live runtime diagnosis uses `runtime-forensics`. Fixed traces and heaps use `trace-forensics`. Add tests only for uncovered observable contracts. A test calls the code the way its users do and asserts a literal expected value. If it would still pass when every imported function returned `undefined`, rewrite the assertion or delete the test.

A before-and-after number is easy to get wrong. Before you report or act on one, run `benchmark-checklist`. The verdict is faster, slower, no measurable difference, or inconclusive, with the run count, range, and limiter. Perf issue and Hillclimb already run it. Type it yourself when you measured something outside those playbooks.

If the repository has no `verify-project` contract, run `create-verification-skill`. Name it in the prompt when you want app proof: "repro this with verify-project. if it repros on main, fix it and show me a video." Run `maintain-verification-skill` when the map may have rotted.

## Review and delivery

These gates answer different questions:

- `interrogate`: can independent models break it?
- Standards + Spec review: does it satisfy repository law and intent?
- Precommit cleanup: is the diff locally obvious and rule-compliant?
- Verification: does it work?
- Merge safety: are branch state, CI, threads, and dependency order safe?

None substitutes for another. Prefer focused commits via `git commit`. Use [`eng-github`](../../skills/eng-github/SKILL.md) for GitHub and PR work. For example, `eng-github snapshot REF` reads a pinned PR state, `eng-github watch REF` waits for changes, and `eng-github stack submit --base BASE BRANCH...` submits a stack. State exact proof and every inconclusive surface.

A handoff records objective, fixed point, changed owners and paths, decisions, observed commands or scenarios, risks, current goal/todo state, and exact next action. Session pickup inherits this trail and does not redo completed work merely for reassurance.