### Session pickup

**You own the resume point. Read the prior trail, don't redo it.** For "take over this", "resume this conversation", "continue from <transcript URI>", "you're taking over", "pick up where X left off", or a pushed branch you're meant to continue.

A pickup is inheritance. The prior agent already paid the cost of reading the code, running the repros, making the design choices. Redoing loses the bias check and burns context. Resist the urge to re-derive; read.

1. Locate the prior trail from the exact `.audit/<slug>-resume.md` path retained in the goal/decision trail or supplied conversation, a specific `history://<id>` or `agent://<id>` URI, or a pushed branch. Read the resume note or overview and last messages first, then scan back for decision points. Never treat `history://` as a filesystem directory or scan unrelated sessions. Parse a long transcript in a subagent and keep the reduced timeline in the main thread (the **principle-guard-the-context-window** skill).
2. Reconstruct operational state: branch and worktree, landed commits and diff against base, open tasks, decisions, and any named project-relative verification-ledger path in the goal or decision trail. For Orchestrate programs, reload `.audit/orchestrate/<slug>/` via `orch` (`units.tsv`, SHA-keyed ledger, `frontier.json`). Reconcile each ledger row's recorded SHA and typed verdict (`live-ui-verified | unit-test-verified | type-check-only | verifier-blocked | verifier-failed`) against live PR heads before integration, landing, or completion. The prior trail is authoritative input; do not re-derive settled decisions.
3. Diff done vs pending. Compare what shipped against what was planned, name the resume point, do not re-run the prior repro or redo completed work. A "let me verify from scratch" pass is the tell that you're treating the trail as untrustworthy when it's actually authoritative.
4. Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup playbook ends here; the routed playbook owns the rest.
5. Verify the inherited final outcome against the original goal on the real artifact (the **principle-prove-it-works** skill); do not repeat intermediate repros that step 3 preserves. A passing prior self-report is not the proof.

**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome.
