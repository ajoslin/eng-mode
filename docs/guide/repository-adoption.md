# Repository adoption checklist

Eng Mode supplies workflow. A repository supplies architecture, law, and proof.

## Required

- Standing repository context.
- `project-standards`: repository law and selected tools.
- `verify-project`: Launch, Doctor, Drive, Evidence, Cleanup.
- Domain vocabulary and ADR convention.
- Exact dev, typecheck, lint, test, and architecture commands.
- Secret and production boundaries.

## Inventory each subsystem

Record owner, entry points, allowed dependencies, canonical contracts, persistence, runtime, real verification, logs, credential path (never value), and nested context. Document common change routes, cross-runtime contracts, generated artifacts, deploy order, and rolling-deploy hazards.

Every visible or operational surface needs a runnable proof path. Missing or unhealthy surfaces return `INCONCLUSIVE`, never a proxy.

Run `setup-eng-mode` and verify subagent LSP, resolved models, advisor guidance, checkpoint, repository contracts, and task isolation assumptions. Re-run after runtime, role, or contract changes.

Prefer executable boundaries: lint for local syntax, architecture checks for dependency seams, tests for behavior, contextual rules for judgment. Require fixtures and counterexamples before adding blockers.