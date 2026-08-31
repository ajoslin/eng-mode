---
name: eng-mode
description: Eng's default engineering operating system. Routes feature, bug, investigation, design, review, autonomous, and shipping work through playbooks implemented with OMP goal, loop, typed agents, hub, todo, LSP, debug, browser, and the eng_orch tool. Use for nontrivial repository work or /eng-mode.
---

# Eng Mode

Correctness first. Smallest coherent change. Prove the real behavior. OMP only. No Cursor.

## Start

1. Match exactly one primary playbook before editing.
2. In the main session, multi-step work initializes `todo` with the playbook's finite steps. Delegates report requested transitions to the lead and never mutate parent state. For an inapplicable item, record `skip: <reason>` in the final report, then drop the task using its exact original content.
3. Read each principle skill that changes a decision. Do not cite principles decoratively.
4. Read the project's `project-standards` contract for repository law, domain vocabulary sources, and the repository-selected specialized skills. Read `CONTEXT.md` for domain vocabulary and nearby ADRs for settled decisions when the project keeps them. `CONTEXT.md` is never a spec.

## Repository contracts

Eng procedure is global; the repository owns standards, forge workflow selection, product verification, domain law, production restrictions, and specialized delivery behavior through two native project contracts:

- `project-standards` — the index over repository law, commands, review agents, and repository-selected skills. Its `forge-provider` frontmatter selects the PR workflow adapter. Missing selection preserves `github-graphite` for existing repositories; an explicit provider never falls back.
- `verify-project` — the product verification contract: launch, drive, evidence, health gate, and feature map for the project's real user surface.

At Eng Mode entry, call the `eng_orch` tool's `contracts` action before repository mutation or behavioral claims, and obey its structured decision:

- `proceed` — both repository-owned `.omp/skills` contract files are present and valid; the result includes one `forgeProvider` skill name.
- `standards-unavailable-read-only` — read-only investigation may proceed but makes no policy-compliance claim.
- `blocked-standards` — code-producing work stops before any edit, write, or writer delegation; this includes an unknown forge provider.
- `inconclusive-verification` — behavioral claims on the product surface are `INCONCLUSIVE`; never substitute OMP `browser` for an unknown or private project driver.
- `unconfigured` — a contract is an explicit `UNCONFIGURED` sentinel; run `setup-eng-mode`.

On `proceed`, read the returned `forgeProvider` skill once. Use only that skill for all forge and PR work. If it does not document an operation, stop; never fall back.

The contracts decision is auditable on-disk validation, not model self-report. `setup-eng-mode` validates only the selected provider skill's documented prerequisites. Outside Eng invocation, OMP and repository context remain authoritative.

## Router

- Read-only mechanics or architecture: `playbooks/investigation.md`, then `how`.
- Historical rationale: `playbooks/investigation.md`, then `why`. ADRs are first-class evidence.
- Reported defect: `playbooks/bug-fix.md`, which imports `diagnosing-bugs`.
- New or changed behavior: `playbooks/feature.md`.
- Behavior-preserving structure: `playbooks/refactoring.md`.
- Performance regression: `playbooks/perf-issue.md` or `playbooks/hillclimb.md` for repeated metric improvement.
- Live runtime diagnosis: `playbooks/runtime-forensics.md`; fixed trace or heap artifacts: `playbooks/trace-forensics.md`.
- Pixel-exact equivalence work: `playbooks/visual-parity.md`.
- Empirical behavior or state-model fork: `playbooks/prototype.md` and the `prototype` skill.
- Competing module designs: the `architect` skill with writable `arena` candidates; read-only panel seats may judge but never produce candidates.
- Comparative skill or workflow evaluation: `playbooks/prove-out.md`, `omp-workflows`, and `arena`.
- Skill authoring: `playbooks/authoring-a-skill.md`.
- PR health through squash-merge when green and approved: `playbooks/babysit.md` and the selected forge provider.
- Landing: `playbooks/shipping.md` and the selected forge provider.
- One long falsifiable task: `playbooks/autonomous-run.md`.
- Independent PR program with merge authority: `playbooks/autopilot-full.md`.
- Dependent review-first PR chain: `playbooks/autopilot-stack.md` and the selected forge provider.
- Project-scale program: `playbooks/orchestrate.md` and the `eng_orch` tool. Work one agent could finish inside the session budget is Autonomous run, not Orchestrate. Do not use OMP's `orchestrate` magic keyword; it supplies no scheduler or transport.
- Large planned program without active execution: `playbooks/multi-phase-plan.md`.
- Recent workspace context: `recall`; one known session uses `playbooks/session-pickup.md`.
- Personal working-convention mining: `automate-me`.
- Audited disk reclamation: `playbooks/worktree-cleanup.md`.
- Pause current work: `playbooks/pause-safely.md`.
- Independent adversarial review: the `interrogate` skill directly; there is no Interrogate playbook.
- Harsh maintainability review, explicit only: the `thermo-nuclear-code-quality-review` skill directly; there is no Thermo-nuclear playbook.
- Proven-working-code bar, explicit only: the `meaningful-contribution` skill directly; there is no Meaningful-contribution playbook.
- Pre-open quality: `playbooks/pre-pr-gates.md` (synthesis; not Pullfrog).
- Missing or rotten product verification: `create-verification-skill` and `maintain-verification-skill`.
- No fitting playbook or large migration: `figure-it-out`.
- Any code-producing playbook ends with `playbooks/opening-a-pr.md` when delivery includes a PR.

## Design and delegation

- Any stateful code names its canonical data shape first. Apply `principle-model-the-domain`.
- Nontrivial changes use `how` to trace each unfamiliar subsystem before design or editing.
- A new or changed module interface routes through `architect`. `architect` imports `codebase-design`, grounds with `how` and `why`, then uses `arena` for distinct whole-shape candidates.
- `swarm` covers independent slices or races. `arena` creates competing artifacts and grafts a winner. `interrogate` runs adversarial review and never auto-applies findings.
- Parallelize only genuinely independent slices whose merged union is intended. Dispatch one `task` batch. Before relying on worktree isolation, verify OMP isolation is configured and set `isolated: true` only for independent writer tasks whose outputs should apply to the parent tree. Competing candidates use distinct `local://` artifacts, never isolated writer workspaces. Use `hub` for lifecycle and peer messages.
- Use the most specific OMP agent type. `scout` is read-only exploration. `sonic` handles trivial mechanical edits. `reviewer` and `security-reviewer` review. Use `judgment-agent` for vague, cross-cutting, concurrency-heavy, or algorithmically subtle implementation; use `implementation-agent` for precisely specified implementation. Agent definitions own model routing.
- The lead owns decomposition, integration, and verification. A delegate summary is not evidence.
- `todo`, `goal`, and `loop` are lead-owned. Delegates report requested transitions through `hub` or their final result.

## Goals, loops, and state

- `goal` owns the durable objective.
- `loop` owns bounded repetition. Invoke `loop` with a prompt and limit; stop it when done and pause it when blocked.
- Prefer a blocking watcher when one command already waits for the event.
- `todo` owns the finite task graph.
- `show-me-your-work` owns durable decision trails. Use it for unattended, high-risk, or multi-phase runs. ADRs record only hard-to-reverse, surprising decisions with a real tradeoff.

## Verification

- Reproduce bugs before hypotheses. Verify fixes on the same surface.
- Product web behavior the project verification contract maps uses `verify-project`: its own driver, its own isolated allocation, and its startup/reset and first-state health gate. Do not attach OMP `browser` to a harness-owned private Chromium. A failed health gate, unmapped path, shared dev stack, or wrong surface is `INCONCLUSIVE`. Missing or unconfigured verification is an `eng_orch contracts` outcome, never a license to substitute browser proof. Other web UI uses OMP `browser`. Runtime state uses `debug` or the relevant profiler. Symbol work uses `lsp`. CLI/TUI work runs the actual program through a managed process when interactive.
- Tests follow the project test law `project-standards` names. Use `tdd` only when a cheap red test represents an uncovered observable contract at a correct public seam.
- Read the stack-specific skills `project-standards` names before changing code they govern.
- Before commit or handoff, run the pre-commit pass `project-standards` names, then use `git commit`. Before review, run `no-comments`. Review-automation findings use the Babysit playbook's review-agent loop and the triage reference `project-standards` indexes. Never merge while that loop is unfinished. Use the Standards + Spec review skill `project-standards` names; use `interrogate` when independent adversarial pressure is warranted.
- Green CI is evidence, not a behavioral verdict.

## Autonomy

Proceed on reversible work. Ask only for destructive external actions, unreachable product preferences, or proven dead ends. Never weaken acceptance criteria to finish. Never create shims, deprecated aliases, or parallel legacy paths. Migrate callers and delete obsolete code.

## Principles

Read the matching leaf in full.

- Simplicity: `principle-laziness-protocol`, `principle-subtract-before-you-add`, `principle-minimize-reader-load`, `principle-build-the-lever`.
- Foundations: `principle-foundational-thinking`, `principle-redesign-from-first-principles`, `principle-experience-first`, `principle-exhaust-the-design-space`.
- Architecture: `principle-model-the-domain`, `principle-boundary-discipline`, `principle-type-system-discipline`, `principle-make-operations-idempotent`, `principle-migrate-callers-then-delete-legacy-apis`, `principle-separate-before-serializing-shared-state`.
- Proof: `principle-prove-it-works`, `principle-fix-root-causes`, `principle-sequence-verifiable-units`, `principle-outcome-oriented-execution`.
- Delegation: `principle-guard-the-context-window`, `principle-never-block-on-the-human`.
- Learning: `principle-encode-lessons-in-structure`.

## Reply

Lead with outcome. Name evidence, tradeoffs, risks, and remaining blockers. Claims must point to observed output or be labeled inference. Do not narrate routine tool use.
