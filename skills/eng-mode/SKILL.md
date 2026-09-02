---
name: eng-mode
description: Eng's default engineering operating system. Routes feature, bug, investigation, design, review, autonomous, and shipping work through playbooks implemented with OMP goal, loop, typed agents, hub, todo, LSP, debug, browser, and the eng_orch tool. Use for nontrivial repository work or /eng-mode.
---

# Eng Mode

Correctness first. Smallest coherent change. Prove the real behavior. OMP only. No Cursor.

## Start

1. Match exactly one primary playbook before editing.
2. In the main session, multi-step work initializes `todo` with the playbook's finite steps. The first item is to read every applicable principle leaf in full. Delegates report requested transitions to the lead and never mutate parent state. For an inapplicable item, record `skip: <reason>` in the final report, then drop the task using its exact original content.
3. Apply only principles that govern a decision. In the reply, name each applied principle and the specific choice it changed. A citation without a decision is decorative and means its leaf was not applied.
4. Read the project's `project-standards` contract for repository law, domain vocabulary sources, and the repository-selected specialized skills. Read `CONTEXT.md` for domain vocabulary and nearby ADRs for settled decisions when the project keeps them. `CONTEXT.md` is never a spec.

## Repository contracts

Eng procedure is global; the repository owns standards, forge workflow selection, product verification, domain law, production restrictions, and specialized delivery behavior through two native project contracts:

- `project-standards` — the index over repository law, commands, review agents, and repository-selected skills. Its `forge-provider` frontmatter selects the PR workflow adapter. Missing selection preserves `github-graphite` for existing repositories; an explicit provider never falls back.
- `verify-project` — the product verification contract: launch, drive, evidence, health gate, and feature map for the project's real user surface.

At Eng Mode entry, call the `eng_orch` tool's `contracts` action before repository mutation or behavioral claims, and obey its structured decision:

- `proceed` — both repository-owned contract files are present and valid under `.agents/skills` or the backwards-compatible `.omp/skills` fallback; the result includes one `forgeProvider` skill name.
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
- Parallel fan-out for coverage, races, or independent slices: the `swarm` skill. Use `arena` instead when candidates compete and only one base will survive.
- Contested design or an independent adversarial review: the `interrogate` skill directly before shipping; there is no Interrogate playbook.
- Comparative skill or workflow evaluation: `playbooks/prove-out.md`, `omp-workflows`, and `arena`.
- Skill authoring: `playbooks/authoring-a-skill.md`.
- Docs, RFCs, READMEs, PR descriptions, or commit messages: the `technical-writing` skill. Apply `unslop` to every prose surface, including replies and agent-facing instructions.
- Any request about an existing PR's status, health, CI, conflicts, review threads, or readiness: `playbooks/babysit.md` and the selected forge provider. Babysit ends at merge-ready and never merges; landing belongs to Shipping.
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
- Unattended, high-risk, or multi-phase work, including work the user will review later: the `show-me-your-work` skill for a durable decision trail.
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
- Fearless parallelism: when you can go deep on one agent and trust it to write good, verifiable code, you can truly parallelize with confidence. Throughput without quality is not the goal. If you want to go fast, go deep first.
- Run owners in true parallel when work is self-contained. Only genuinely overlapping work serializes. When concurrent actors might share mutable state, apply `principle-separate-before-serializing-shared-state`: first ask whether they truly need the same mutable object. If not, eliminate the sharing.
- `swarm` covers independent slices or races. `arena` creates competing artifacts and grafts a winner. `interrogate` runs adversarial review and never auto-applies findings. Before relying on worktree isolation, verify OMP isolation is configured and set `isolated: true` only for independent writer tasks whose merged union is intended on the parent tree. Competing candidates use distinct `local://` artifacts, never isolated writer workspaces. Use `hub` for lifecycle and peer messages.
- Use the most specific OMP agent type. `scout` is read-only exploration. `sonic` handles trivial mechanical edits. `reviewer` and `security-reviewer` review. Use `judgment-agent` for vague, cross-cutting, concurrency-heavy, or algorithmically subtle implementation; use `implementation-agent` for precisely specified implementation. Agent definitions own model routing.
- The lead owns decomposition, integration, and verification. A delegate summary is not evidence.
- If delegation is interrupted, start a fresh agent with the consolidated scope and current evidence. Do not trust an interrupt-chained resume or its `done` summary because it may have dropped directives. For high-risk or contested work, request an explicit second opinion with the same brief through a different suitable agent or model route; agreement is evidence, not proof.
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

Proceed on reversible work without asking. Pause before irreversible writes such as force-pushing a shared branch, deploying, deleting data, or sending customer messages unless the user has explicitly authorized that exact action. Session instructions override these defaults when they clearly grant or restrict authority. Ask only for unreachable product preferences or proven dead ends. Give candid judgment: `no`, a narrower recommendation, or a scope rejection is acceptable when the requested approach does not earn its cost. Never weaken acceptance criteria to finish. Never create shims, deprecated aliases, or parallel legacy paths. Migrate callers and delete obsolete code.

## Principles

Read each applicable leaf in full. These descriptions decide applicability; the category labels are only an index.

- Simplicity: `principle-laziness-protocol` when refactoring, sizing a diff, or tempted to add abstraction, layers, or signal threading; `principle-subtract-before-you-add` when sequencing an addition, refactor, or rewrite; `principle-minimize-reader-load` when code is hard to trace or hides state behind layers; `principle-build-the-lever` for nontrivial work where a tool, script, generator, or codemod can do or prove the work.
- Foundations: `principle-foundational-thinking` before choosing core types, data structures, scaffold order, or shared state; `principle-redesign-from-first-principles` when integrating a new requirement into an existing design; `principle-experience-first` for product, UX, or feature-scope tradeoffs; `principle-exhaust-the-design-space` for novel interactions or architectural decisions without precedent.
- Architecture: `principle-model-the-domain` for stateful logic, repeated shape assumptions, or branching spread across files; `principle-boundary-discipline` when placing validation, error handling, or framework adapters; `principle-type-system-discipline` when designing types or signatures in typed code; `principle-make-operations-idempotent` for commands, lifecycle steps, or loops that face retries and crashes; `principle-migrate-callers-then-delete-legacy-apis` when replacing an internal interface with callers still on the old one; `principle-separate-before-serializing-shared-state` when concurrent actors might write the same file, branch, key, or object.
- Proof: `principle-prove-it-works` after completing work and before claiming done; `principle-fix-root-causes` when debugging; `principle-sequence-verifiable-units` for multi-step sweeps, migrations, and delivery ordering; `principle-outcome-oriented-execution` for planned rewrites and migrations with explicit phase boundaries.
- Delegation: `principle-guard-the-context-window` when large output, long files, repeated reads, or fan-out planning consume context; `principle-never-block-on-the-human` when tempted to ask about reversible work that evidence can settle.
- Learning: `principle-encode-lessons-in-structure` when the same instruction or correction appears again and could become a lint, metadata flag, runtime check, or script.

## Reply

Lead with the outcome, then use named sections for evidence, tradeoffs, risks, and remaining blockers. Start with consumer impact, then state what the next maintainer inherits. Name the principles that changed decisions and the choices they changed. Cite only links, files, transcript references, and artifacts actually read or produced in this session; never fabricate or imply a citation. Every claim must point to observed output or carry an `[INFERENCE]` label. Keep all content the matched playbook requires, but do not narrate routine tool use.
