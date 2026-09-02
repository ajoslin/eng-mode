# Durable orchestration store

## Sub-features

Create a throwaway `eng_orch` store and inspect its units, ledger, inbox, gates, frontier, standing orders, and rendered status.

## How to get to it (user POV)

Create a unique store path outside the checkout. Launch OMP with the local Eng Mode extension and ask the agent to use that exact `store` value for every action.

## Driving it with OMP TUI

Use `<store>` for the same temporary store path in every call.

1. Invoke `{ action: "init", store: <store>, spawner: "verify-owner" }`. Confirm the result renders the store path. Invoke `{ action: "status", store: <store> }` to capture the initial state.
2. Invoke `{ action: "unit_add", store: <store>, id: "verify-unit", track: "verify-track", brief: "disposable verification unit" }`, then `{ action: "unit_set", store: <store>, id: "verify-unit", state: "done", branch: "verify-branch", pr: 101, sha: "verify-sha" }`. Invoke `{ action: "unit_get", store: <store>, id: "verify-unit" }`, `{ action: "unit_list", store: <store>, track: "verify-track" }`, and `{ action: "unit_counts", store: <store> }`. Confirm they render that unit and state.
3. Invoke `{ action: "ledger_record", store: <store>, pr: 101, sha: "verify-sha", verdict: "type-check-only", evidence: "disposable evidence", verifier: "verify-agent" }`. Invoke `{ action: "ledger_check", store: <store>, pr: 101, sha: "verify-sha" }` and confirm it renders the row. Invoke `{ action: "ledger_summary", store: <store> }` and confirm the `type-check-only` count is one.
4. Invoke `{ action: "inbox_push", store: <store>, spawner: "verify-owner", agent: "verify-agent", unit: "verify-unit", status: "done", report: "disposable report" }`. Invoke `{ action: "inbox_peek", store: <store> }` and `{ action: "inbox_count", store: <store> }`. Confirm the pointer renders and the count is one.
5. Invoke `{ action: "inbox_claim", store: <store>, spawner: "verify-owner" }`. Capture its `id` as `<claim-1>`. Invoke `{ action: "inbox_reclaim", store: <store>, spawner: "verify-owner", claim: <claim-1> }`. Invoke `{ action: "inbox_count", store: <store> }` and confirm the count is one.
6. Invoke `{ action: "inbox_claim", store: <store>, spawner: "verify-owner" }` again. Capture its `id` as `<claim-2>`. Invoke `{ action: "inbox_ack", store: <store>, spawner: "verify-owner", claim: <claim-2> }`. Invoke `{ action: "inbox_count", store: <store> }` and confirm the count is zero.
7. Invoke `{ action: "gate_park", store: <store>, id: "verify-gate", question: "Continue verification?", options: "yes|no", defaultAnswer: "yes" }`. Invoke `{ action: "gate_list", store: <store> }` and confirm it shows the open gate. Invoke `{ action: "gate_resolve", store: <store>, id: "verify-gate", answer: "yes" }` and capture its returned answer. Later, use `status` to confirm the resolved gate.
8. Treat frontier mutation as `verified-unreachable` unless a dedicated non-production Graphite repository, disposable nonempty stack, and Graphite authentication are available. If available, invoke `{ action: "frontier_set", store: <store>, repo: <disposable-repository-path>, prs: <disposable-stack-prs> }` with the actual PR identifiers from that stack. Invoke `{ action: "frontier_show", store: <store> }` and confirm it renders those identifiers and SHAs. Never use this checkout or production identifiers.
9. Invoke `{ action: "standing_add", store: <store>, line: "Use disposable verification data" }`, then `{ action: "standing_show", store: <store> }`. Confirm the numbered line renders.
10. Invoke `{ action: "status", store: <store> }`. Confirm the result renders units, ledger, gates including the resolved gate, frontier, `summary`, and `changed`.

## Gotchas

Never point this recipe at a production store or repository. Do not disclose credentials or production identifiers in evidence. Steps outside frontier verification use invented disposable PR and SHA values. Step 8 requires actual identifiers from its dedicated non-production Graphite stack. After capturing evidence, stop the managed process and delete only the throwaway store and disposable profile. If step 8 used dedicated non-production resources, remove only the disposable stack and repository that this run created.
