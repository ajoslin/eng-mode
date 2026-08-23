# Adopt Eng Mode in a complex monorepo

Map stable ownership, not directory names. For each subsystem record owner, public entry points, canonical contracts, allowed dependencies, persistence, runtimes, proof, logs, and unknowns.

```text
clients → shared contracts → API → domain service → database
workers → domain service
shared contracts ✕ database, browser, native runtime
```

Put enforceable relationships in architecture checks; keep judgment-only ownership in repository context.

## Cross-surface example

For a session-contract change:

1. Trace the shared contract and server authority with `how`.
2. Use `architect` if ownership or the caller API changes.
3. Fix the shared contract before giving web, native, server, and persistence distinct owners.
4. Drive login and resume in both clients.
5. Correlate server and persistence evidence with one identifier.

A server test proves neither client; a web pass proves nothing about native.

## Keep context bounded

Store the subsystem inventory in an artifact. Give each scout one row and require the same output shape. Use `omp-workflows` to validate rows and build matrices; use normal tasks when follow-up matters. Checkpoint speculative traces and rewind with one retained report.

Install `project-standards` and `verify-project` before complex work. The verification feature map lists every user entry point and exact observable proof; a convenient alternate path does not verify an unreachable one. Add nested context only for genuine subtree rules.

## Prove adoption

Exercise a read-only cross-service explanation, a seam-changing design checkpoint, parallel independent services, a web-and-native change, and session pickup. Adoption fails when Eng chooses the wrong owner, substitutes proxy proof, ignores nested context, or reports unobserved evidence.