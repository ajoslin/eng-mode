# Build, debug, verify, and deliver

Match evidence to the changed contract.

- LSP: definitions, references, implementations, renames, imports, server fixes.
- Debugger: live state, breakpoints, variables, threads, memory.
- Browser: actual web interaction and appearance.
- Process hub: services, watchers, debuggers, REPLs, interactive programs.
- Repository verification skill: exact product launch, health, drive, evidence, cleanup.

Compilation proves compilation. A test proves its assertions. Runtime reproduction proves its scenario. Product verification proves behavior on the real surface. Drive web and mobile changes in their clients, CLI/TUI changes in the real program, jobs through a real worker, migrations through apply/readback, and cross-runtime contracts in every affected runtime. A failed health gate or wrong surface is **inconclusive**.

Bug fixes reproduce first and remove the cause. Features name shape and ownership. Refactors pin behavior. Performance work records comparable baseline and result. Add tests only for uncovered observable contracts.

## Review and delivery

These gates answer different questions:

- `interrogate`: can independent models break it?
- Standards + Spec review: does it satisfy repository law and intent?
- Precommit cleanup: is the diff locally obvious and rule-compliant?
- Verification: does it work?
- Merge safety: are branch state, CI, threads, and dependency order safe?

None substitutes for another. Prefer focused commits via `git commit`. For all forge and PR work, read the `forgeProvider` skill returned by `eng_orch contracts` once and use only its documented interface. If it does not document an operation, stop; never fall back. State exact proof and every inconclusive surface.

A handoff records objective, fixed point, changed owners and paths, decisions, observed commands or scenarios, risks, current goal/todo state, and exact next action. Session pickup inherits this trail and does not redo completed work merely for reassurance.