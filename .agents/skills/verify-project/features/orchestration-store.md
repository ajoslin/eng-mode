# Durable orchestration store

## Sub-features

Create a throwaway `eng_orch` store and inspect its units, ledger, inbox, gates, frontier, standing orders, and rendered status.

## How to get to it (user POV)

Create a unique store path outside the checkout. Launch OMP with the local Eng Mode extension and ask the agent to use that exact `store` value for every action.

## Driving it with OMP TUI

Use `<store>` for the same temporary store path in every call.

1. Invoke `{ action: "init", store: <store>, spawner: "verify-owner" }`. Confirm the result renders `{ "store": <store> }`. Invoke `{ action: "status", store: <store> }` and confirm empty `units`, `ledger`, `gates`, a frontier with `generation: 0`, and `changed: "first render"`.
2. Invoke `{ action: "unit_add", store: <store>, id: "verify-unit", track: "verify-track", brief: "disposable verification unit" }` and confirm the new unit renders with `state: "pending"` and empty `branch`, `pr`, and `sha`. Invoke `{ action: "unit_set", store: <store>, id: "verify-unit", state: "done", branch: "verify-branch", pr: 101, sha: "verify-sha" }`. Invoke `{ action: "unit_get", store: <store>, id: "verify-unit" }`, `{ action: "unit_list", store: <store>, track: "verify-track" }`, and `{ action: "unit_counts", store: <store> }`. Confirm they render that unit with `state: "done"` and `pr: "101"`, and that counts render `{ "done": 1 }`.
3. Invoke `{ action: "ledger_record", store: <store>, pr: 101, sha: "verify-sha", verdict: "type-check-only", evidence: "disposable evidence", verifier: "verify-agent" }`. Invoke `{ action: "ledger_check", store: <store>, pr: 101, sha: "verify-sha" }` and confirm it renders the row. Invoke `{ action: "ledger_summary", store: <store> }` and confirm the `type-check-only` count is one.
4. Invoke `{ action: "inbox_push", store: <store>, spawner: "verify-owner", agent: "verify-agent", unit: "verify-unit", status: "done", report: "disposable report" }`. Invoke `{ action: "inbox_peek", store: <store> }` and `{ action: "inbox_count", store: <store> }`. Confirm the pointer renders and the count is one.
5. Invoke `{ action: "inbox_claim", store: <store>, spawner: "verify-owner" }`. Capture its `id` as `<claim-1>`; the result also lists the claimed `pointers`. Invoke `{ action: "inbox_reclaim", store: <store>, spawner: "verify-owner", claim: <claim-1> }` and confirm it renders `claims: [<claim-1>]`, the returned pointer, and `skipped: []`. Invoke `{ action: "inbox_count", store: <store> }` and confirm the count is one.
6. Invoke `inbox_claim` again and capture `<claim-2>`. Invoke `{ action: "inbox_reclaim", store: <store>, spawner: "verify-owner" }` with no `claim`. This is the bulk recovery path; confirm it renders `claims: [<claim-2>]` and `skipped: []`, and that `inbox_count` is one.
7. Invoke `inbox_claim` a third time and capture `<claim-3>`. Invoke `{ action: "inbox_ack", store: <store>, spawner: "verify-owner", claim: <claim-3> }`. Invoke `{ action: "inbox_count", store: <store> }` and confirm the count is zero.
8. Invoke `{ action: "gate_park", store: <store>, id: "verify-gate", question: "Continue verification?", options: "yes|no", defaultAnswer: "yes" }` and confirm `kind: "open"`. Invoke `{ action: "gate_list", store: <store> }` and confirm it shows the open gate. Invoke `{ action: "gate_resolve", store: <store>, id: "verify-gate", answer: "yes" }` and confirm `kind: "resolved"` with `answer: "yes"`. Later, use `status` to confirm the resolved gate.
9. Invoke `{ action: "frontier_show", store: <store> }` on the untouched store and confirm `{ "generation": 0, "prs": [], "lowestUnmerged": null }`. Treat frontier mutation as `verified-unreachable` unless a dedicated non-production Graphite repository, disposable nonempty stack, and Graphite authentication are available. If available, invoke `{ action: "frontier_set", store: <store>, repo: <disposable-repository-path>, prs: <disposable-stack-prs> }` with the actual PR identifiers from that stack, then `frontier_show` again and confirm it renders those identifiers and SHAs. Never use this checkout or production identifiers.
10. Invoke `{ action: "standing_add", store: <store>, line: "Use disposable verification data" }` and confirm `{ "number": 1, "line": ... }`, then `{ action: "standing_show", store: <store> }`. Confirm the numbered line renders.
11. Invoke `{ action: "status", store: <store> }`. Confirm the result renders units, ledger, gates including the resolved gate, frontier, `summary` with `unitStates`, `ledgerVerdicts`, `frontierGeneration`, and `openGateIds`, and `changed`. `changed` diffs only unit-state counts, ledger-verdict counts, frontier generation, and the open-gate list against the previous `status` render, so after this recipe it reads `units done 0->1; ledger type-check-only 0->1`; a resolved gate and standing orders do not appear in it.

## Gotchas

Never point this recipe at a production store or repository. Do not disclose credentials or production identifiers in evidence. Steps outside frontier verification use invented disposable PR and SHA values. Numeric `pr` arguments render back as strings (`"101"`). Step 9 requires actual identifiers from its dedicated non-production Graphite stack. After capturing evidence, stop the managed process and delete only the throwaway store and disposable profile. If step 9 used dedicated non-production resources, remove only the disposable stack and repository that this run created.

Store writes serialize per handle, and closing a handle drains accepted writes. Live lock takeover is not supported. A legacy flat `.orch.lock` file or unknown lock ownership blocks access. Stop all writers and verify that none remain before manually removing that lock. New-format locks recover only when their recorded owner process is dead. Unit states and ledger rows are bookkeeping, not authorization to merge.

Bulk inbox recovery (`inbox_reclaim` without `claim`) reports preserved malformed or conflicting claims in `skipped`. Confirm those IDs and reasons render, valid owned pointers return to the inbox, and preserved claim files remain unchanged. With only well-formed claims, as in step 6, `skipped` is empty.
