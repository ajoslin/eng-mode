# Plan

Produce a delivery-ready phased implementation plan grounded in the **Principles** section of the `eng-mode` skill. The plan is the deliverable. Do not implement, open branches, or mutate product files.

Open the finite planning graph in `todo` per Eng Mode's Start rule. Delegated planners report requested transitions to the lead instead of mutating parent state.

## 0. Triage

Skip the plan when the change is one or two files with an obvious approach. Say so and stop.

Plan when the change spans three or more files, introduces architecture, has competing approaches or unclear scope, or the user asked for one.

## 1. Re-read principles

Read the **Principles** section of the `eng-mode` skill end to end, and the leaf `principle-*` skills it indexes. The principles govern every plan decision; cross-link them.

## 2. Scope and constraints

State your read of scope and constraints in one paragraph. Use the structured `ask` tool only for genuinely ambiguous intent (the **never-block-on-the-human** principle skill); give concrete options with each open question. Prefer a reversible default and record it when repository evidence resolves the question.

Resolve what is in scope vs explicitly out, technical or platform constraints, patterns to preserve, and the observable definition of done. Name the execution playbook for each delivery unit and the repository-selected forge provider once for the plan. A provider operation absent from that skill is a blocker, not permission to fall back.

## 3. Explore in subagents

Delegate codebase exploration (the **guard-the-context-window** principle skill).

Each explorer returns file pointers, conventions, dependencies, test infrastructure, and entry points. No inlined dumps.

## 4. Write the plan

The operator-specified plan path wins. Otherwise use the repository's documented planning location; when neither exists, default to `docs/plans/<plan-name>/` for a multi-phase plan or `docs/plans/<plan-name>.md` for a small plan. Do not create a second planning convention beside an existing one.

Keep a multi-phase plan as `overview.md` plus phase artifacts. Each phase artifact maps to one independently reviewable PR and is the canonical evidence record for that PR; the overview summarizes and links rather than duplicating phase evidence. Use a single file only when one PR is the complete delivery.

### Phase and PR sizing

Make every phase one independently shippable PR/evidence unit. Prefer more small coherent units over a few large ones, but do not split a behavior across PRs that cannot each produce an observable result (the **foundational-thinking** and **sequence-verifiable-units** principle skills). A dependent phase names the exact upstream phase and base; an independent phase names the common base.

### Overview file

- **Context.** Problem and why now.
- **Scope.** Included; explicitly excluded.
- **Constraints.** Technical, platform, dependency, and established patterns.
- **Alternatives.** Two or three approaches, the choice, and rationale (the **exhaust-the-design-space** principle skill). Skip only when constraints dictate one; retain rejected alternatives in an appendix.
- **Execution.** Ordered PR graph, execution playbook per phase, selected forge provider, topology owner for dependent stacks, and whether delivery is independent or stacked.
- **Applicable skills.** Domain skills the implementer should invoke, by name.
- **Phases.** Ordered standard-markdown links to phase files, with dependency and owner at a glance.
- **Project verification.** Exact repository gates and real surfaces shared by the phases. Do not replace phase receipts with this summary.
- **Arm.** The explicit operator `go`, any durable `goal` predicate, bounded `loop`/watch policy, and zero-write state before authorization.
- **Implementation guidance.** Per section 6.
- **Appendices.** Alternatives, risks, evidence index, and handback.

### Canonical per-PR phase artifact

Every phase file contains this skeleton. Omit no field; write `not applicable: <reason>` where appropriate.

- Back-link to the overview and phase/PR identifier.
- **Observable result.** User- or operator-visible outcome delivered by this PR; not an implementation activity.
- **Depends.** Prior phase/PR and required evidence, or `none`; explain what context crosses the dependency.
- **Owner and branch.** One accountable owner, named successor rule if autonomy is required, branch, and exact base branch/PR.
- **Execution.** Eng Mode execution playbook and selected provider operation used to open or append the PR. Name the topology owner for a dependent stack.
- **Files and boundaries.** Paths the phase may change, seams it owns, paths it must not change, and interaction with adjacent phases. Describe what and why, not line-by-line implementation; no code snippets.
- **Data structures.** Key types or schemas in a one-line sketch (the **foundational-thinking** principle skill), or `not applicable`.
- **Prototype prerequisite.** For uncertain layout, interface, interaction, or timing, require the Prototype playbook before production writing. Record the throwaway branch, artifact path, head SHA, matching-surface screenshots for every visual variant or logs/timings for behavioral variants, selected direction, and disposal. Otherwise state why no prototype is needed.
- **Verification receipt.** Exact surface and expected observation, commands or project-contract flow, evidence location, verifier, PR number, and head SHA. Include relevant unit/static evidence, live matching-surface evidence, and performance baseline/result; mark irrelevant lanes `not applicable`. Never promote green CI or a unit test into live proof.
- **Review gate.** Required project review/pre-PR gates, reviewers or review skills, actionable-finding disposition, and acceptance condition at the same head SHA.
- **Merge or handback.** Independent merge or provider-owned stack operation, merge authority, ordering, handback recipient, and the evidence delivered. Babysit may establish readiness but never supplies merge authority.

Order phases so subtraction, infrastructure, and shared types land before dependents (the **foundational-thinking** principle skill). Each phase must be independently reviewable and produce its own receipt; a new head SHA invalidates SHA-pinned evidence unless the active execution/provider contract explicitly permits patch-identity proof.

For changes touching existing code, apply the **redesign-from-first-principles** principle skill: if we'd built this with the new requirement on day one, what would it look like? Redesign holistically; deliver incrementally.

If a phase creates or edits a skill, name the Eng Mode Authoring a skill playbook as its execution playbook; Eng Mode's autonomy rule resolves the contract from repository context instead of interviewing.

## 5. Verification per PR/evidence unit

Specify only checks supported by `project-standards`, `verify-project`, existing repository tooling, or the named execution playbook. The receipt must identify the exact surface, head SHA, observed result, and artifact or output location.

- **Unit/static evidence:** the narrowest relevant tests plus required type, build, or repository gates.
- **Live evidence:** exercise the changed behavior on its matching real surface. If the project contract does not map that surface or its health gate fails, record `INCONCLUSIVE`; do not substitute a convenient proxy.
- **Performance evidence:** when timing, resource use, or responsiveness is part of the result, freeze the workload and ruler, then record baseline and post-change measurements on the same surface.

For bug fixes, reproduce on the real surface, fix, and verify on that same surface. Unit tests show a branch behaves a certain way; they do not prove the reported bug is gone (the **prove-it-works** principle skill).

The plan may require a lightweight structural checker only when the repository already documents one: name its exact command and what fields it checks. Otherwise define a reviewer checklist against the canonical skeleton; do not invent a script, command, or CI job.

## 6. Implementation guidance

In the overview, name which Eng Mode non-negotiables govern execution: contracts before mutation, clean cutover, one writer per exclusive branch, matching-surface proof, current-head evidence, provider-only topology operations, and no merge without explicit authority. State any planned intermediate breakage and the verification boundary that contains it (the **outcome-oriented-execution** principle skill).

## 7. Arm and hand back

Planning ends in an explicit **zero-write** state: no implementation delegation, production edit, branch creation, PR opening, watcher, `loop`, or execution `goal` starts before the operator says `go`. Record the exact phrase or event that counts as `go`.

On `go`, the lead re-runs repository contracts, initializes the finite execution graph in `todo`, and creates a durable `goal` only when the named execution playbook calls for one. Arm a blocking provider watcher when it owns the event; otherwise define a bounded `loop` cadence and stop condition. An armed run records its goal predicate, loop/watch owner, limit, wake event, and disarm condition. Do not arm either mechanism while handing back the plan.

Summarize the ordered PR graph, owners, scope boundaries, applicable skills, prototype gates, verification surfaces, review gates, delivery operations, risks, and evidence index. State where the overview and canonical phase artifacts live and who receives execution handback. Stop in zero-write state until `go`.
