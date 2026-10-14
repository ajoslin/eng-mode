### Multi-phase or multi-PR plan

**You own the delivery map, not execution.** Follow [../references/plan.md](../references/plan.md) and produce its overview plus canonical per-PR phase artifacts. Every phase is one evidence-bearing PR unit with an explicit dependency, accountable owner, branch/base, observable result, file boundary, verification receipt, review gate, and merge or handback operation.

Explore in subagents per the reference's explore step. Pick each `task` item's `effort` for the job, per the Design and delegation section.

Name the execution playbook for every phase. Use `eng-github` for PR and stack operations. When layout, interface, interaction, or timing is uncertain, place a throwaway Prototype phase before production writing and require its branch, head SHA, matching-surface screenshots or observed timings, selected direction, and disposal record.

Each phase's verdict and merge gate follows `playbooks/autopilot-full.md` step 4 and `playbooks/shipping.md` step 3. A full three-lane round runs once, at the code-ready head, and again only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head that runs the repository gates and re-proves the load-bearing behavior. A new head otherwise gets a fresh verdict, except for lane results the patch-id rule carries.

The operator's plan path wins. Otherwise use the repository's documented planning location, then the reference's default. Keep overview material concise and treat each phase artifact as the canonical evidence record for its PR. Append alternatives, risks, evidence index, and execution handback.

End unarmed. Implementation remains zero-write until the operator's recorded `go`. Describe, but do not create, the execution `goal`, bounded `loop` or `eng-github watch`, wake condition, limit, and disarm condition. A lightweight plan checker may be named only when repository tooling already supports it. Otherwise use the reference's reviewer checklist.

**Reply:** plan paths, ordered PR/dependency graph, owners and branches/bases, execution playbooks and `eng-github` commands, prototype gates, exact verification surfaces and evidence lanes, review and delivery gates, risks, handback recipient, and confirmation that no execution mechanism was armed.
