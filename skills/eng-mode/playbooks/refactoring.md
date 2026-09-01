### Refactoring

**Contract:** structure changes; observable behavior does not. Route a discovered bug to **Bug fix** and new or changed behavior to **Feature** as separate work. Route a large, cross-cutting restructure through `figure-it-out` or the planning playbook that fits its delivery shape.

1. Read `how` and pin observable behavior before moving structure. Reuse an existing behavior test or equivalence harness; if none exists, first add a characterization test, snapshot, or recorded baseline. Typecheck and lint alone are not a behavior pin.
2. Define the target module layout, types, and call graph. Apply **principle-model-the-domain** only when the code is missing a real structure, such as a typed model, state machine, registry, or reducer that removes scattered assumptions or invalid states. Use **principle-foundational-thinking** and **principle-redesign-from-first-principles** to reshape that missing structure as if it had existed from the start. Keep clear, local, boring code as-is; run `architect` when the interface or seam changes.
3. Subtract before reshaping: remove dead weight, one-caller wrappers, redundant validators, and orphan references. Revert speculative cleanup that does not serve the named target.
4. Execute small pin-green steps. Use OMP LSP references, rename, and rename-file for symbol work. When renaming, also spot-check strings, prose, configuration, and back-references that symbol tooling cannot prove. If mechanical edits are delegated, give a precise file/name/behavior brief and review the actual diff yourself.
5. For an interface cutover, inventory and migrate every caller, then delete the legacy interface in the same overall cutover. Keep each migration step pinned and green, but never run old and new paths in parallel; add no shim, alias, or compatibility path.
6. Prove direct behavioral equivalence on the real artifact: replay the pinned baseline, compare old and new outputs, or exercise the same user surface before and after. Compilation is necessary when applicable, never sufficient. If equivalence fails, revert or route the behavior change to its proper playbook.
7. Apply the reader-load gate: show fewer layers, less hidden state, fewer call-graph hops, or a smaller interface. If reader load does not fall, revert the refactor.
8. Keep delivery ordered as subtraction, reshape, then cleanup commits, with the pin green after each slice. Run the pre-commit pass `project-standards` names; if delivery includes a PR, run **Opening a PR**.

**Reply:** contract and target shape; behavior pin and direct equivalence evidence; reader-load delta; shipped changes; reverted changes; risks or blockers; `No new behavior`.
