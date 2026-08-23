# Plan

Produce a phased implementation plan grounded in the **Principles** section of the `eng-mode` skill. The plan is the deliverable. Do not implement.

Open the finite task graph in `todo` per Eng Mode's Start rule. An active native goal owns the durable objective and continuation, not another graph. A delegated planner reports the graph to its lead instead of mutating parent state.

## 0. Triage

Skip the plan when the change is one or two files with an obvious approach. Say so and stop.

Plan when the change spans three or more files, introduces architecture, has competing approaches or unclear scope, or the user asked for one.

## 1. Re-read principles

Read the **Principles** section of the `eng-mode` skill end to end, and the leaf `principle-*` skills it indexes. The principles govern every plan decision; cross-link them.

## 2. Scope and constraints

State your read of scope and constraints in one paragraph. Use the structured `ask` tool only for genuinely ambiguous intent (the **never-block-on-the-human** principle skill); give concrete options with each open question.

Resolve what is in scope vs explicitly out, technical or platform constraints, patterns to preserve, and the definition of done.

## 3. Explore in subagents

Delegate codebase exploration (the **guard-the-context-window** principle skill).

- Use `scout` for read-only exploration. Use `implementation-agent` only when the slice writes artifacts. Agent definitions and OMP configuration own model routing; never pass prompt-level model slugs.

Each explorer returns file pointers, conventions, dependencies, test infrastructure, and entry points. No inlined dumps.

## 4. Write the plan

The user specifies where the plan lives.

Single file `NN-slug.md` for small plans. For three or more phases, a directory with `overview.md` plus phase files:

```
NN-slug/
├── overview.md
├── phase-1-scaffold.md
├── phase-2-...md
└── testing.md
```

### Phase sizing

- One function or type plus tests, or one bug fix. Not "one file".
- Two to three files touched, max.
- Prefer eight to ten small phases over three to four large ones to preserve option value (the **foundational-thinking** principle skill).
- Split if a phase has more than five test cases or three functions.

### Overview file

- **Context.** Problem and why now.
- **Scope.** Included; explicitly excluded.
- **Constraints.** Technical, platform, dependency, pattern.
- **Alternatives.** Two or three approaches sketched, choice and rationale (the **exhaust-the-design-space** principle skill). Skip when constraints dictate one.
- **Applicable skills.** Domain skills the implementer should invoke, by name.
- **Phases.** Ordered standard-markdown links to phase files.
- **Verification.** Project-level commands.
- **Implementation guidance.** Per section 6.

### Phase files

- Back-link to overview.
- **Goal.** What the phase accomplishes.
- **Changes.** Files affected and the change at a high level. What and why, not how. No code snippets.
- **Data structures.** Name the key types or schemas. One-line sketch only (the **foundational-thinking** principle skill).
- **Verification.** Per section 6.

Order phases so infrastructure and shared types land first (the **foundational-thinking** principle skill). Each phase should be independently shippable.

For changes touching existing code, apply the **redesign-from-first-principles** principle skill: if we'd built this with the new requirement on day one, what would it look like? Redesign holistically; deliver incrementally.

If a phase creates or edits a skill, route it through the Eng Mode Authoring a skill playbook; Eng Mode's autonomy rule resolves the contract from repository context instead of interviewing.

## 5. Verification per phase

Each phase needs both:

**Static.** Type check, lint, project tests pass.

**Runtime.** Exercise the feature on the matching surface:

- Web UIs the project verification contract maps: the parent runs the mapped `verify-project` workflow on its isolated allocation after the workflow's own health gate passes; OMP `browser` cannot attach to a private harness-owned Chromium.
- Other web UIs: OMP `browser`.
- CLIs and TUIs: launch the actual program through a managed process.
- Native mobile: no repository simulator-driving skill is installed. Use a real supported simulator control path when available; otherwise record the proof gap and route creation through `create-verification-skill` before claiming visible behavior.
- No real control path for the touched surface: flag it in the plan; do not claim verification.

For bug fixes, the loop is reproduce on the surface, fix, verify on the same surface. Unit tests show a branch behaves a certain way; they do not prove the bug is gone (the **prove-it-works** principle skill).

## 6. Implementation guidance

In the overview, name which eng-mode non-negotiables the implementer must apply, by name:

- the **how** skill over each unfamiliar subsystem before changing it.
- the **interrogate** skill for adversarial review on contested designs before shipping.
- the project pre-commit pass (per `project-standards`) over each diff before commit. the **unslop** skill over any prose surface.
- the **show-me-your-work** skill to keep a decision trail when the plan is large enough to need an auditable record.
- the Eng Mode `playbooks/babysit.md` workflow after opening the PR.

## 7. Hand back

Summarize phases, scope boundaries, applicable skills, and verification. Stop. The user decides when implementation starts.
