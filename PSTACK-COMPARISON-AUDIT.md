# PSTACK-COMPARISON-AUDIT.md

Eng Mode vs pstack (cursor/plugins `main`). Read-only synthesis of 24 workflow audits, 24 principle/helper audits, and 7 domain reports. No source edits.

## 1. Scope and method

**Baseline.** Upstream is cursor/plugins `main` (`pstack/skills/poteto-mode/` and matching principle/helper skills). Live main at domain-audit time was `b9ddc83`. Three file audits compared against the local Cursor cache pin `397c8660da6d3d873a91e18c2ca2f22cac1f0ac1`; six architecture/core-principle audits used live raw main. DomainCorePrinciples independently `curl`+`diff`'d the nine simplicity/foundations files against both SHAs: cache equals main for the audited set, so every parity claim stands against live main. DomainFeatureDesign re-verified every upstream citation against the cache pin. DomainVerificationMeta, DomainDiagnosisPerf, DomainAutonomy, DomainRouting, and DomainDelivery rechecked contested live files. This synthesis re-read the contested local files (SKILL.md, babysit, autonomous-run, pause-safely, hillclimb, session-pickup, perf-issue, prove-out, visual-parity, arena, interrogate, swarm, shipping, autopilot-full, autopilot-stack, opening-a-pr, worktree-cleanup, orchestrate, feature, prototype, refactoring, bug-fix, authoring-a-skill, plan.md, investigation, trace-forensics, runtime-forensics).

**48 audited local files.** 24 workflow audits (multi-phase-plan.md is a pointer; the substantive file is references/plan.md, counted as one audited unit) + 21 principle skills + 3 helpers (swarm, arena, interrogate). `pre-pr-gates.md` is local-only and not in the 48; it is recorded under ADDED BY OURS.

**Classification.** MISSING FROM OURS = upstream contract absent or materially weakened. ADDED BY OURS = local-only, tagged KEEP (justified OMP/repository adaptation) or DELETE (philosophical drift). DELETE FROM OURS = local wording to remove or replace. Tool-name substitutions (Cursor `Task`/`gt`/`gh`/`/loop`/`poteto-agent` → OMP `task`/`hub`/`goal`/`loop`/`eng_orch`/typed agents/selected provider) are adaptations, not drift, **if** the operational invariant survives. Prefer restoration from pstack over invented policy. Provider-neutral equivalents are required where Cursor syntax cannot run; they must still name the invariant (watcher schema, arming proof, topology owner).

**Reconciliations against stale file audits.** AuditPause's seven findings are fully remediated in current pause-safely.md (hub checkpoint/ack, task-owned commit isolation, `.audit/<slug>-resume.md` + trail registration, goal/loop contract, reply proof fields) — verified. AuditOrchestrate missing item 3 (arena gate, present-once framing, native-goal create/fallback) is now in orchestrate.md Frame — verified. AuditPerf's "restore `architect first`" is a false positive: perf-issue.md still says `run architect first` — verified. AuditPrototype's sole DELETE (target-adjacent throwaway) is overridden: skills/prototype/SKILL.md rule 1 and UI.md require in-app hosting, with compensating controls (named throwaway, never on main, production untouched, capture-on-branch). AuditFeature's "delegation contradiction" is two layers: slice ownership (keep) vs code-writing delegation (restore). Swarm `isolated:true` vs arena `local://` is a deliberate merge-intent asymmetry encoded in three files; do not harmonize.

## 2. Executive verdict

**Incorrect as a one-to-one port. Principle layer is exact. Operational layer is not.**

21/21 principle skills are byte-identical to upstream. investigation.md and trace-forensics.md are exact parity. pause-safely.md is now operationally faithful. runtime-forensics.md, visual-parity.md, perf-issue.md, prove-out.md, session-pickup.md, and orchestrate.md are mostly faithful with justified OMP adaptations and a handful of cheap restorations.

The port is not merge-ready. One P0 authorization break (Babysit `drive` squash-merges; upstream `drive` ends at merge-ready and landing is Shipping). One cross-playbook actor-model inversion (Autopilot-full one-shot writer yields; root opens, babysits, merges, and refills — OMP isolation does not require this). Several undefined gates/actors (`STACK-READY`, watcher schema, review-agent inventory, `orch`). Two local contradictions (hillclimb PR order; arena description "isolated"). One tool-name bug (`orch` vs registered `eng_orch`). Compression dropped who-does-what from Feature, Refactoring, Hillclimb, Autonomous run, Authoring, Swarm, and Arena.

A workflow expert rejects shipping on the local playbooks alone because ownership, evidence thresholds, and authorization boundaries are implicit. A distributed-systems expert rejects unnamed verifiers, undefined terminal events, and a coordinator that is both independent verdict and merger. Restore the upstream *contracts*; keep the OMP *mechanisms*.

## 3. Philosophy one-to-one

| Philosophy | Upstream | Local | Verdict |
|---|---|---|---|
| Correctness first; smallest coherent change; prove real behavior | poteto-mode L5–8 | SKILL.md L7 | **FAITHFUL** |
| Environment boundary | Cursor plugin | "OMP only. No Cursor." L8 | **FAITHFUL** (intentional; not a conflict) |
| Exact one-playbook match before edit | Start L12 | Start L12 | **FAITHFUL** |
| Lead-owned finite `todo`/`goal`/`loop`; delegates never mutate parent | Start + autonomy | Start L13; Design L79 | **FAITHFUL** (OMP primitives) |
| Principle-driven decisions; first todo reads Principles in full; replies name principles that changed a decision | L15–35 | Start L14 (non-decorative citation only) | **PARTIAL** — bootstrap + reply attribution **MISSING**. Expert rejects: citations become decorative. |
| One-to-one trigger rows (`how`, prototype-before-question, swarm, interrogate-for-contested-designs, unslop, technical-writing, deslop, control skills, Babysit-for-every-PR-status, Shipping, bugbot triage, show-me-your-work) | L17–35 | Router L40–67, scattered | **PARTIAL**. No swarm row. Interrogate trigger is "independent adversarial review" not "contested designs". technical-writing skill exists locally but is unrouted. Babysit row is framed as "PR health through squash-merge" — feeds the P0. deslop → project pre-commit + `no-comments` is KEEP if documented. Expert rejects implicit/distributed triggers: routing becomes inconsistent and unverifiable. |
| Principle applicability text (when a leaf governs a decision) | L37–75 | L102–111 name-only lists | **MISSING**. Category compression KEEP; applicability must return. Expert rejects a name-only index: an agent cannot tell when a leaf applies. |
| 20 principle leaves | 20 names | 21/21 present, byte-identical | **FAITHFUL** |
| Design ownership; delegate implementation; lead reviews | feature preamble | SKILL.md L78 lead owns decomposition/integration/verification | **PARTIAL** in SKILL; **MISSING** in Feature playbook. Expert rejects undefined design authority. |
| Subagent policy: typed agent, model routing, interruption recovery, second opinions, explicit lead review | L87–93 `poteto-agent` | L74–79 typed agents, hub, "delegate summary is not evidence" | **PARTIAL**. `poteto-agent` MUST NOT be copied. Recovery + second opinions **MISSING**. Expert rejects a stale interrupted chain: unverified actor, lost directives. |
| Autonomy: proceed on reversible; pause irreversible writes; honor session overrides; accept "no" | L77–85 | L98–100 proceed/ask/never-weaken/no-shims | **PARTIAL**. Irreversible-write pause, session overrides, candid rejection **MISSING**. Expert rejects unattended runs crossing an unsafe side-effect boundary, and social-agreement bias expanding scope. |
| Reply: outcome, evidence, tradeoffs; named sections; consumer+maintainer impact; no fabricated citations; observed-or-inference | L95–106 | L113–115 | **PARTIAL**. Local inference-labeling is stronger — KEEP. Named sections, impact framing, citation integrity **MISSING**. Expert rejects brevity-only guidance. |
| Same-surface proof; green CI is not a verdict; delegate summary is not evidence | verification | L91–96 | **FAITHFUL**, locally **strengthened** (`INCONCLUSIVE` classes, health gate). |
| Migrate callers, delete legacy, no shims | migration discipline | Autonomy L100 | **FAITHFUL** |
| Separate before serializing shared state | principle | Design L75 + principle file exact | **FAITHFUL**. Operational fork (worktrees vs `isolated:true` merge-on-parent) is KEEP; do not copy disposable-worktree fanout. |
| Merge authority: Babysit never merges; Shipping lands; Autopilot-full owner merges only after root swarm | babysit close; shipping; autopilot-full §4–5 | babysit L10 drive squash-merges; autopilot-full L7 root merges | **DRIFT**. P0 + actor inversion. Expert rejects implicit merge authority and a correlated verifier-merger. |

## 4. File-by-file audit (48 files)

Verdict key: **EXACT** = byte/semantic identity. **FAITHFUL** = contract intact, only justified adaptations. **MOSTLY** = contract intact plus cheap restorations. **PARTIAL** = core intent retained, material contracts missing. **NOT** = actor/authorization/proof protocol inverted or gutted.

### 4.1 Workflow and helpers (27 audited units)

| File | Verdict | MISSING FROM OURS | ADDED (KEEP unless DELETE) | DELETE |
|---|---|---|---|---|
| `skills/eng-mode/SKILL.md` | PARTIAL | Trigger rows (swarm; contested-design interrogate; technical-writing; principles-in-full bootstrap; reply attribution); applicability text; irreversible-write pause, session overrides, accept-no; subagent recovery + second opinions; reply named-sections/impact/citation integrity | Repository contracts + `eng_orch` decision states; forge-provider selection; rejection of OMP magic `orchestrate`; hub/typed-agents/lifecycle; verify-project / no-browser-on-private-Chromium; `no-comments`; inference-labeling | None. Router "PR health through squash-merge" wording must be rewritten with the Babysit P0, not deleted. |
| `playbooks/authoring-a-skill.md` | NOT | `create-skill` handoff; explicit predicates (`name`/`description` exist, referenced files exist, cross-skill links resolve); structural-vs-subjective tests; voice/source (delete-first, imperative, encode-lessons); reply (summary, decisions, validation notes); modify-scope heading | Context gate; Eng vocabulary; one-level refs + scripts; OMP trigger/near-miss probe (**supplemental**, not a substitute); conditional pre-commit; **conditional** Opening-a-PR (KEEP — unconditional PR would violate local delivery) | Replace L6 generic categories with predicates. Demote L7 routing exercise to supplemental. Do not delete the probe. |
| `playbooks/autonomous-run.md` | NOT | Pre-iteration checkable predicate examples; watcher-subagent + heartbeat fallback (partially covered by `loop` limit); commit-on-predicate-advance, revert speculative, sequence-verifiable-units; repair-or-park recoverable faults; per-iteration trail row; plateau-is-not-stop / pivot / surface stuck; loop-limit terminal + predicate in Reply | Goal/todo graph; loop prompt+limit; freeze ruler; checkpoint-before-pause; stop-loop-then-complete-goal; lead ownership | L8 "operational failures" as a stop — **contradicts** upstream and orchestrate.md L125–127 (retries/flake never reach the human). |
| `playbooks/autopilot-full.md` | NOT | Persistent per-PR owner (build→register→self-proof→triage→cleanup→restack→babysit→merge); root = verdicts/countersign/audit only; branch-from-main / overlap-only serialization / short private stack; swarm at every merge-ready SHA (gates, live floor, receipts/diff) + owner fix-forward; 30-min wake-chain, liveness, stuck replacement, pin countersign, retro/post-merge sweep; owners hold briefs on stop; reply with owner/state/SHA/swarm/next/countersign/trails; state-then-wait + full-program goal on explicit go | Operator-owned stop-at-merge-ready; explicit go; parallel independent writers; patch-id exception; Autopilot-stack routing; full-autonomy+current-verdict+quiet-review gate; goal/loop watching; zero-writes stop | One-shot writer that yields; root opens/Babysits/merges/refills; "fresh writer" as the correction path; root self-verify as swarm substitute. OMP isolation does **not** justify this. opening-a-pr.md already forbids a one-shot opener from babysitting. |
| `playbooks/autopilot-stack.md` | NOT | Per-PR owner lifecycle minus merge; `STACK-READY` = exact SHA + swarm quorum + verdict on PR; parallel self-contained owners; root-only topology commands (force-with-lease after ls-remote; track-then-submit; workers never `gt` — already in `skills/graphite/SKILL.md` but not carried here); restack/patch-id/reverify/countersign; selection criteria; root/tip reply | Ordinary work stays one PR; never land (operator lands); OMP isolation warning; parent-sequential `verify-project`; Opening-a-PR + selected provider; goal/loop/hub hold | Root one-branch-at-a-time serialization of independent layers (head-of-line blocking). |
| `playbooks/babysit.md` | NOT | Request-to-mode map + first-line declaration; small/docs → `check`; finish-stack-then-babysit; one-babysitter preflight; concrete topology bans + one sanctioned follow-up PR; conflict = report owning branch/rebase + drift, do not resolve; authoritative watcher schema, rearm, READY/WAITING/ADVANCE/COMPLETE; frozen queued-stack snapshot; Bugbot-equivalent red-first triage, owning-PR placement, fixed payloads, disproof, pass-count, escalation, terminal rubric sweep; watcher-table reply | Provider abstraction; OMP goal/loop/hub ownership; review-agent inventory loop (**KEEP additive**; define schema); expanded report fields | **P0:** L10 `drive` squash-merges. L5 "work … conflicts". Broad loop-stop competing with terminal events. |
| `playbooks/bug-fix.md` | PARTIAL | Scientific bar restated in-playbook (reject/revert speculative fixes; verbatim red→green); failing-repro-before-fix commit order; lead ownership/delegation; binary-search of ranked hypotheses (lives in diagnosing-bugs, not required here); parallel how+why fan-out; unit-test limitation | diagnosing-bugs routing; verify-project health gate + INCONCLUSIVE; OMP browser/debug/CLI; ADR/LSP/domain-modeling; vertical-slice / test-law; conditional PR | None |
| `playbooks/feature.md` | PARTIAL | "You own the design. Delegate implementation"; architect **default-on** (skip recorded, never folded silently); concrete four-item throughput semantics (gate-before-fan-out, disjointness, invariant serialization, why-one-worker); delegated implementation brief (scope, data shape, success criteria) + lead reviews diff + arena for multiple valid shapes; sequence-verifiable commits; `interrogate` if contested; code-coupled single owner, internal fan-out after blocking, fresh owner at phase boundary; reply built/chose/open-decisions + alternative tables | Domain-language restating; domain-modeling step; empirical-fork → prototype; project-standards / test-law; strong verification law; CONTEXT/ADR discipline; richer report fields; coherent-work-local **as slice ownership** | None. Clarify L6 so "local" means lead owns integration, not "the lead writes the code". |
| `playbooks/hillclimb.md` | NOT | Metric direction + target∧attempt-floor predicate + agree-defaults; sensitivity proof (contrasting workloads, ruler discriminates target vs easy); median-of-N; ruler change invalidates every earlier number (partially at L13); `decision.tsv` name/kept-reverted/gitignored survival; hypothesis→architecture-model linkage; tight scope, one-commit-per-accepted-fix staging only changed paths, unattended borrows **wake** not **stop** from Autonomous run; plateau escalation (reject streak, near-miss combine, source reread, radical mechanism, revert behavior-breaking wins, keep number-holding simplifications); stop = predicate met OR remaining ideas genuinely marginal; never while cheap untried remain; surface stuck | Native goal/loop; freeze-ruler invalidation/re-baseline; `no_progress`; bounded-loop prohibition; `local://` or sequential exclusive-branch (KEEP the `isolated:true` ban) | L15 "ordered by measured contribution" — restore landed order. Contribution stays in the Reply. |
| `playbooks/investigation.md` | **EXACT** | — | — | — |
| `playbooks/multi-phase-plan.md` + `references/plan.md` | PARTIAL | Per-PR Depends / observable "You see" / review gate / merge evidence; prototype-before-write + evidence appendix; structural checker; technical-writing then unslop routing; named evidence artifact per runtime check; execution-playbook name on the overview; default plan location | Pointer + OMP plan.md: lead-owned todo; principle cross-links; structured scope; explorer return contract; data-structure sketches; foundational-first; skill-authoring route; operator handback; static/runtime + no-control-path flag | Replace L31–33 "user specifies where / overview+phase files" as the *sole* format. Keep overview/phase content as sections. Do **not** restore fixed ten-lane swarm — risk-scaled verification in orchestrate/shipping is argued OMP philosophy. |
| `playbooks/opening-a-pr.md` | PARTIAL | Invocation rationale (code-producing-only vs every-playbook); non-destructive recovery mechanics; pre-open rebase / future-PR invariant; Conventional Commits title; Why/Scope/Tradeoffs/Blast Radius/Verification body; ready/not-draft + status read; post-open continue-building / finish-phase / feedback-drift pushback; parent duties after URL return | Receipt-backed Pre-PR gates (frozen SHA, no panel rerun, Not Pullfrog, Not a merge gate); OMP isolation / exclusive-branch writers; `local://` candidates; **never reset/discard user work** (do not port upstream reset-and-redo); selected provider; explicit no-merge; project pre-commit / `no-comments` / unslop; interrogate never-auto-apply | None |
| `playbooks/orchestrate.md` | MOSTLY | Brief FORBIDDEN "no fixes outside scope" (coordinator-side rule exists at L129, does not bind workers); bounded retry taxonomy (cap/oom smaller, network same, tool different-model, unknown once; two then abandon); overview.md append-only + units.tsv in-place update (partially implied by `eng_orch`); named drain triggers (claim/ack is stronger — KEEP — but name the four collection points); cloud placement / parked-tree history (document as local-only omission) | OMP primitives + `eng_orch` + `.audit` store; no-spawn-while-advisor-steering; isolation/PR-owner rules; transactional claim/ack; SHA invalidation + ban on `git patch-id` here; session-collision signature; cost-aware ceremony scaling; Frame arena/present-once/native-goal **now present** | None of the OMP crash/liveness additions |
| `playbooks/pause-safely.md` | **FAITHFUL** | — (AuditPause findings remediated; current file has hub checkpoint/ack, task-owned isolation, `.audit/<slug>-resume.md` + trail, goal incomplete / loop pause-after-durable, reply proof fields) | `restart OMP` naming | — |
| `playbooks/perf-issue.md` | MOSTLY | Configured perf-issue model/default (relocated to agent definitions — KEEP with a one-line pointer) | Matching-surface capture matrix + artifact preservation | None. "architect first" is **present** (AuditPerf false positive). |
| `playbooks/prototype.md` | PARTIAL | Decision-owner framing; scope dimensions (layout/interaction/density/behavior/timing/approach); conditional prior-art/moodboard; modality-specific evidence (per-variant screenshots + driven interaction vs logs/timing); reply variants + scratch/branch path; Feature = real build / architect = shape | Competing hypotheses; prototype-skill + project-standards tooling gate; OMP browser. **Co-location is KEEP** (prototype skill rule 1 + UI.md `?variant=` switcher; compensating controls exist). No-decision gate IS present ("Otherwise route Feature"). | Do **not** delete target-adjacent throwaway. |
| `playbooks/refactoring.md` | NOT | Contract preamble ("structure changes; behavior does not"); split discovered bugs/features; large work → planning/`figure-it-out`; pin **before** any move, write pin if missing, typecheck/lint are not a pin; missing-structure diagnosis + module/types/call-graph target; dead-weight examples + revert speculative cleanup; pin-green steps + rename spot-check (strings/prose/back-refs) + no parallel old/new; configured mechanical delegate + lead reviews; proof forms + owner verification; reader-load go/no-go (revert if not lowered); ordered subtraction/reshape/cleanup commits; reply shipped/reverted + "No new behavior" | OMP LSP; project-standards | Bare "in one wave" as the sole migration rule — replace with same-wave API cutover **inside** pin-green steps. |
| `playbooks/runtime-forensics.md` | **FAITHFUL** | Generic "control skill" phrasing (replaced, not lost); live-hotfix option (intentionally omitted — KEEP: mutation perturbs the observed mechanism) | Capture matrix; private-browser / owning-harness instrumentation | None |
| `playbooks/session-pickup.md` | MOSTLY | Cloud-agent URL trigger (OMP URI replacement — KEEP); explicit `agent-transcripts/` + `~/.cursor/projects/*/` privacy warning (KEEP the URI rule; restore the privacy *rationale* if any filesystem discovery remains) | `.audit` / verification-ledger / frontier reconciliation; no-repeat intermediate repros | `orch` → `eng_orch` (undefined actor). "final outcome" → inherited **claims** (plural). |
| `playbooks/shipping.md` | PARTIAL | Authorship-independent verifier; verdict posted on the PR; real-surface parent-vs-head proof; arming confirmation (do not trust proxy autoMergeRequest; disarm if previously armed); drain non-interference (no sync/restack/submit mid-merge; independent work re-parented onto trunk); diagnose stall before mutating; ADVANCE ≠ termination; ceiling extension = new verification pass; reply who-produced-verdict + how-arming-confirmed | Provider abstraction; review-agent landability gate (KEEP additive); avoid-ceremonial-delegation **only if** skip is still an explicit pass | None |
| `playbooks/trace-forensics.md` | **EXACT** | — | — | — |
| `playbooks/visual-parity.md` | MOSTLY | Explicit "nonzero diff is a fail; investigate the pixel delta, don't wave it through" | `verify-project` binding; durable goal+loop; immutable ruler with run-invalidation (strengthening); bounded stop | None. Bounded loop KEEP; restore fail classification so "stopped at limit" cannot masquerade as parity. |
| `playbooks/worktree-cleanup.md` | NOT | Irreversible-deletion framing + safety-rationale paragraph; `worktree-audit.sh` lever (no local script exists); pinned/active chat as authoritative ownership; bounded transcript fan-out for uncertain rows; `wip:N` / `scratch:N` semantics; `--force` after explicit choice + conditional ignored-artifact `rm -rf` + branch-refs-survive; exact before/after `df` reply + per-hold attribution | OMP actor inventory + no-bare-scan; expanded holds (goal/loop/hub/pinned/open-PR/process); ambiguous-ownership gate; simulator/cache **out of scope** (KEEP if declared) | Undefined force policy. Document simulator/cache exclusion as deliberate, or restore reclaimers. |
| `playbooks/prove-out.md` | MOSTLY | Judge on a **different model family** from candidates (arena does not restore this; sibling files figure-it-out and orchestrate treat it as the norm) | Rename from eval; `omp-workflows` prerequisite; arena step 3/4 dispatch; `agent://`/`history://` hygiene ("never treat history:// as a filesystem directory") | None. Candidate diversity fallback KEEP; it must complement, not replace, judge-family separation. |
| `skills/swarm/SKILL.md` | PARTIAL | Explicit N (total workers, not concurrency); named artifact/report; per-worker output destination; standalone briefs (goal/scope/exact slice/verify/report) + PASS/ISSUES/BLOCKED + evidence; pre-launch phase checklist; event-driven drain barrier; parent applies race rule; compact table + evidenced issues + gaps | One-task-batch; OMP agent taxonomy; disjoint paths / `isolated:true` for writers; skip-validation / lead-validates-once; hub notifications / never poll; lead-owned conclusion | Reword L11 so batch context **supplements** standalone briefs. No other deletion. Neither file defines a numeric max; do not invent 24 as a skill contract (harness cap is runtime). |
| `skills/arena/SKILL.md` | PARTIAL | Phase todolist; same-prompt / task-only visibility; N + runner pool; N-1 dropout continuation; judge protocol (rubric, sanitized path labels, criterion scores, base recommendation, parent-family separation); lead end-to-end + rationale review; selection = extendable without breaking invariants, cleaner boundary; graft = walk every loser, 1–2 ideas, hand-fold via redesign-from-first-principles, source+rejection; consensus = no graft, wild divergence = reframe; verification recovery (reframe or regraft, don't paper over); artifact + adjacent synthesis note | `local://` scratch (never `isolated:true` for candidates); agent-owned routing; ≥2 structurally distinct directions; reader-load **tie-breaker**; resolved-model-family honesty | Description "isolated" → "separate". Reader-load must not replace invariant preservation. |
| `skills/interrogate/SKILL.md` | MOSTLY | Configurable roster hook (layer over default table); scope derivation (`git diff main...HEAD` or user artifact — "real fixed point" undefined); intent derivation sources; pre-dispatch slug recovery; per-finding attribution + sectioned output (Intent / Reviewers / Act On / Consider / Noted / Dismissed / Agreement Map) | `resolvedModel` / fallback provenance; **actual-vendor** agreement (Opus/Fable = one vendor) — stronger than upstream; dropout continuation; non-auto-apply + separation from Standards/Shipping; read-only panel agents | Intro "four pinned seats and three vendors" as an **invariant** — reword to match body degradation. Keep the body. |

### 4.2 Principle skills (21 files) — all EXACT PARITY

Architecture domain fact (six files, independently confirmed): `principle-model-the-domain`, `principle-boundary-discipline`, `principle-type-system-discipline`, `principle-make-operations-idempotent`, `principle-migrate-callers-then-delete-legacy-apis`, `principle-separate-before-serializing-shared-state` — exact parity, no additions, omissions, contradictions, or deletion candidates.

The other fifteen are also exact (file audits + DomainCorePrinciples live-main recheck for the nine simplicity/foundations set):

| File | Verdict | MISSING / ADDED / DELETE |
|---|---|---|
| `skills/principle-boundary-discipline/SKILL.md` | EXACT | none / none / none |
| `skills/principle-build-the-lever/SKILL.md` | EXACT | none / none / none |
| `skills/principle-encode-lessons-in-structure/SKILL.md` | EXACT | none / none / none |
| `skills/principle-exhaust-the-design-space/SKILL.md` | EXACT | none / none / none |
| `skills/principle-experience-first/SKILL.md` | EXACT | none / none / none |
| `skills/principle-fix-root-causes/SKILL.md` | EXACT | none / none / none |
| `skills/principle-foundational-thinking/SKILL.md` | EXACT | none / none / none |
| `skills/principle-guard-the-context-window/SKILL.md` | EXACT | none / none / none |
| `skills/principle-laziness-protocol/SKILL.md` | EXACT | none / none / none |
| `skills/principle-make-operations-idempotent/SKILL.md` | EXACT | none / none / none |
| `skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md` | EXACT | none / none / none |
| `skills/principle-minimize-reader-load/SKILL.md` | EXACT | none / none / none |
| `skills/principle-model-the-domain/SKILL.md` | EXACT | none / none / none |
| `skills/principle-never-block-on-the-human/SKILL.md` | EXACT | none / none / none |
| `skills/principle-outcome-oriented-execution/SKILL.md` | EXACT | none / none / none |
| `skills/principle-prove-it-works/SKILL.md` | EXACT | none / none / none |
| `skills/principle-redesign-from-first-principles/SKILL.md` | EXACT | none / none / none |
| `skills/principle-separate-before-serializing-shared-state/SKILL.md` | EXACT | none / none / none |
| `skills/principle-sequence-verifiable-units/SKILL.md` | EXACT | none / none / none |
| `skills/principle-subtract-before-you-add/SKILL.md` | EXACT | none / none / none |
| `skills/principle-type-system-discipline/SKILL.md` | EXACT | none / none / none |

Latent **upstream-inherited** gap (not a port defect; do not patch locally): subtract-before-you-add forbids speculative guards while outcome-oriented-execution requires high-signal checks during migration. The implied boundary — a check of a specified end state is never speculative; a guard of unspecified input is — is stated in neither file. Propose one line to upstream pstack. A parity expert rejects a local patch: it duplicates a decision that belongs in one source of truth and permanently raises the cost of every future parity audit.

## 5. Domain audits

| Domain | Verdict | Load-bearing result |
|---|---|---|
| **Routing / philosophy / authoring / helpers** (DomainRouting) | incorrect | One verified self-contradiction (arena "isolated"); one framing contradiction (interrogate four-seats invariant); authoring validation redefined as router-firing; ~20 missing contracts across router/swarm/arena/interrogate. Swarm-vs-arena isolation asymmetry is **not** a defect. |
| **Feature / design / prototype / refactoring / planning** (DomainFeatureDesign) | incorrect | Design domain (architect + exhaust-the-design-space) has no material gap. Feature/refactoring drop ownership, pin-before-move, and review separation. Prototype compression is real; the DELETE of co-location is overridden. Planning execution layer mostly lives in orchestrate/autopilot-stack/shipping; residue is phase fields, prototype-before-write, checker. |
| **Diagnosis / perf** (DomainDiagnosisPerf) | incorrect | Forensics intact (trace exact; runtime faithful). perf-issue faithful (architect-first false positive resolved). Hillclimb is the hole: measurement, plateau, stopping, and one contradiction (PR order). Bug-fix proof bar is one indirection away in diagnosing-bugs. |
| **Autonomy / orchestrate / pickup / pause / cleanup** (DomainAutonomy) | incorrect | Pause-safely remediated. Orchestrate Frame remediated. Remaining: `orch` bug, autonomous-run liveness contradiction, orchestrate FORBIDDEN/retry, cleanup removal/ownership/WIP. |
| **Delivery** (DomainDelivery) | incorrect | **P0** Babysit merge. Actor-model inversion in Autopilot-full. Undefined `STACK-READY`. Watcher/frozen-queue/rearm missing. Merge authority is split-brain across five playbooks. |
| **Core principles** (DomainCorePrinciples) | **correct** | 21/21 exact. Cache pin = live main for the audited set. Guards-vs-checks routed upstream. |
| **Verification / meta** (DomainVerificationMeta) | incorrect | Six principle files exact. Prove-out missing judge-family separation (arena does not guarantee it). Visual-parity missing explicit nonzero-diff fail. |
| **Architecture principles** (batch fact) | **correct** | All six architecture principle files exact parity. |

## 6. Prioritized missing list

Restore from pstack (provider-neutral). Expert rejection of leaving each gap is in the file table; condensed here.

**P0**
1. Babysit `drive` stops at merge-ready. Landing is Shipping. (Workflow expert: monitoring ≠ landing authorization. Dist-sys expert: stale async verdict.)

**P1 — authorization, actors, proof**
2. Autopilot-full: one accountable owner (or named successor on the exclusive branch) through babysit-to-green and merge; root = independent swarm + countersign only. (Workflow expert: the actor vanishes at the SHA/review/merge boundary.)
3. Define `STACK-READY` as exact SHA + independent three-lane swarm + verdict on the PR. Parallelize self-contained stack owners; root serializes topology/append only.
4. SHA-pinned swarm (gates, live floor, receipts/diff) at every merge-ready and STACK-READY head; post the verdict on the PR; findings return to the owner. (Dist-sys expert: one actor's self-report is not a quorum.)
5. Babysit: conflicts are reported, not resolved; restore concrete topology bans and the one sanctioned follow-up; name the stacker.
6. Provider-neutral watcher schema, rearm, READY/WAITING/ADVANCE/COMPLETE, frozen queue; 30-minute liveness/stuck-replacement on both autopilots. Keep OMP goal/loop/hub as the mechanism.
7. Autonomous-run: stop only on destructive / unreachable-product / proven-dead-end; repair-or-park operational failures. (Contradicts orchestrate.md itself.)
8. Hillclimb: landed-order commits; sensitivity proof + median-of-N; plateau escalation + marginal-cost stopping.
9. Feature: design-ownership preamble; architect default-on; delegated implementation + lead review.
10. Refactoring: pin-before-move; pin-green steps + rename spot-check; operational proof forms + reader-load gate.
11. Authoring: route through `create-skill`; explicit predicates; structural/subjective split (near-miss probe becomes supplemental).
12. Router: swarm row; interrogate = contested designs; technical-writing row; principle applicability text; irreversible-write pause + session overrides + accept-no.
13. Arena: judge protocol (sanitized labels, criterion scores, parent-family separation) + selection = invariants/extensibility/boundary.
14. Swarm: explicit N; standalone briefs + PASS/ISSUES/BLOCKED; drain barrier.
15. Session-pickup: `orch` → `eng_orch`; inherited **claims**.
16. Prove-out step 5: require judge resolved family ≠ every candidate family; if routing cannot, report `judge-family separation unavailable` (mirror step 4's fallback).
17. Bug-fix: two-line evidence bar (reject failed same-surface verification; verbatim red→green) + failing-repro-before-fix commits.
18. Planning: Depends / observable result / review gate on phase files; name the execution playbook.

**P2**
19. Opening-a-PR: title format, body sections, ready/not-draft, post-open parent duties, trigger rationale, non-destructive recovery.
20. Shipping: arming proof, drain non-interference, ceiling = new verification pass.
21. Babysit mode mapping, one-babysitter preflight, phase separation; review-agent contract as additive; restore bot-triage + rubric sweep.
22. Autonomous-run: commit-on-advance, per-iteration trail, plateau/pivot, loop-limit terminal, predicate in Reply.
23. Orchestrate: FORBIDDEN no-fixes-outside-scope; retry class table; store append/update invariants.
24. Cleanup: force-after-choice + artifact fallback + refs-survive; bounded ownership verification; wip/scratch; reply attribution.
25. Prototype: framing, dimensions, conditional references, modality-specific evidence, branch/path in reply.
26. Arena: N-1 continuation, prompt contract, recovery/convergence, phase todolist, synthesis-note outputs.
27. Interrogate: config roster hook over the default table; scope/intent derivation.
28. Visual-parity: explicit nonzero-diff fail aligned with goal/loop.
29. Authoring voice paragraph + reply contract.
30. Hillclimb candidate mechanics (tight scope, staging, unattended wake-not-stop).
31. Feature: interrogate-if-contested; sequence-verifiable commits; phase-boundary owner.
32. Subagent interruption recovery + second opinions; reply named-sections/impact/citation integrity.

**P3**
33. Authoring heading "or modifying". Interrogate per-finding attribution / sectioned output. Planning checker, unslop routing, evidence-artifact-per-phase. Feature reply alternative tables. Refactoring reply shipped/reverted + "No new behavior". Opening trigger rationale. Orchestrate drain-trigger names. Cleanup scope-framing paragraph. Document deliberate divergences (below). Record upstream SHA in future audits. Propose guards-vs-checks line **upstream**.

## 7. Added-by-ours keep / delete

**KEEP (justified OMP / repository — a workflow expert would reject deleting these because they encode real harness invariants upstream cannot name):**

- `project-standards` + `verify-project` + `eng_orch contracts` decision states (`proceed` / `standards-unavailable-read-only` / `blocked-standards` / `inconclusive-verification` / `unconfigured`).
- Selected forge provider; never fall back; stop if the provider skill omits an operation.
- Explicit rejection of OMP's magic `orchestrate` keyword.
- Hub / typed agents / lifecycle; agent definitions own model routing; never prompt-level model slugs.
- Isolation law: `isolated:true` only for writers whose merged union belongs on the parent; competing candidates use `local://`; PR-owning writers are one-shot **non-isolated** on an exclusive branch.
- Receipt-backed Pre-PR gates (frozen SHA, one synthesis, no rerun, Not Pullfrog, Not a merge gate).
- Non-destructive dirty-branch split; never reset/discard user work.
- Capture matrix replacing undefined upstream "control skill": verify-project / OMP browser / debug-or-profiler / managed CLI-TUI; INCONCLUSIVE classes; private-browser boundary.
- Runtime-forensics: no live hotfix (diagnosis-only).
- Review-agent inventory loop (additive; must not replace bot triage or merge authorization).
- Risk-scaled verification replacing fixed ten live lanes (orchestrate "Scale verification to the unit"; shipping SHA-pinned PASS/PASS+NOTES/FAIL).
- In-app prototypes with throwaway-branch capture (prototype skill + UI.md).
- Cost-aware orchestrate ceremony (measured: 12-unit job).
- `show-me-your-work` trails; gitignored `.audit/` store; transactional inbox claim/ack.
- Interrogate actual-vendor agreement + resolvedModel/fallback honesty (strictly stronger than upstream).
- Arena resolved-model-family honesty + structural-diversity minimum + reader-load **as tie-breaker**.
- Goal/loop/hub as durable primitives; lead-owned todo; bounded loops.
- Conditional Opening-a-PR (only when delivery includes a PR).
- `no-comments` + project pre-commit as the deslop substitute (document it).
- Pause `.audit/<slug>-resume.md` (now faithful).
- Worktree-cleanup: no-bare-history-scan; open-PR hold; simulator/cache out of scope **if declared**.
- Prove-out rename + OMP transcript hygiene.
- Domain-modeling / CONTEXT.md / ADR tests / empirical-fork → prototype.

**DELETE (philosophical drift, not harness mapping):**

- Arena frontmatter "isolated".
- Hillclimb "ordered by measured contribution".
- Babysit `drive` squash-merge and "skip merge only if the operator says not to".
- Babysit "work … conflicts" as resolution.
- Autopilot-full one-shot-yield + root-as-opener/babysitter/merger/refiller.
- Autopilot-full / Autopilot-stack root self-verify as swarm substitute.
- Autopilot-stack one-branch-at-a-time for independent layers.
- Autonomous-run "operational failures" as a stop.
- Authoring routing-exercise as the **sole** test rule (keep as supplemental).
- Session-pickup `orch`; singular "final outcome".
- Interrogate intro overclaim ("four pinned seats and three vendors" as invariant).
- Feature architect-only-on-interface-change (flip default; keep skip record).
- Refactoring bare "one wave" as the only migration rule.
- Plan.md user-chosen overview+phase-files as the **sole** format.

## 8. Delete-from-ours list (actionable replacements)

1. **babysit.md L10** — `drive` squash-merges → `drive` ends at merge-ready; land/ship/merge → Shipping. Expert: different authorization boundaries; stale observation.
2. **babysit.md L5** — "work … conflicts" → report owning branch, rebase, trunk drift; stop that blocker.
3. **autopilot-full.md L6–9** — replace yield/root-merge/refill with persistent owner (or named successor) + root countersign.
4. **autopilot-stack.md L5** — drop one-at-a-time serialization of self-contained layers.
5. **hillclimb.md L15** — "ordered by measured contribution" → stacked in the order they landed.
6. **arena/SKILL.md L3** — "isolated" → "separate" / "distinct".
7. **autonomous-run.md L8** — drop operational-failures from stop conditions.
8. **session-pickup.md L8** — `orch` → `eng_orch`.
9. **session-pickup.md L11** — "final outcome" → "inherited claims".
10. **interrogate/SKILL.md L9** — reword four-seats invariant to match fallback/dropout body.
11. **refactoring.md L5** — replace bare "one wave" with pin-green steps + same-wave API cutover.
12. **references/plan.md L31–33** — stop treating overview+phase directory as the only format; per-PR evidence skeleton is canonical, operator-named path wins else agent-store `docs/`.
13. **authoring-a-skill.md L6–7** — replace generic validation + unconditional routing probe with predicates + structural/subjective split.
14. **feature.md L3** — stop defaulting architect off except on interface change.

Do **not** delete: target-adjacent prototypes, `isolated:true` for swarm writers, `local://` for arena candidates, Pre-PR gates, non-destructive split, review-agent inventory (additive), simulator/cache exclusion (declare it), ten-lane omission, configured-model relocation to agent definitions.

## 9. Contradictions / undefined actors

**Contradictions (verified in current source)**
1. arena L3 "isolated candidate artifacts" vs L11 "never use `isolated:true`". Callers follow the description.
2. interrogate L9 four-pinned-seats invariant vs L34 fallback/dropout. Downstream quotes the intro.
3. babysit L3/L4 (drive ≈ merge-ready; auto-merge is Shipping) vs L10 (drive squash-merges). Split-brain with shipping.md, autopilot-full.md L7 (root merges), autopilot-stack.md L9 (never merge), opening-a-pr.md (do not merge).
4. autonomous-run L8 pauses on operational failures vs orchestrate.md L125–127 (retries, flake, restack never reach the human) vs upstream repair-and-continue.
5. hillclimb L15 contribution order vs sequence-verifiable-units / upstream landed order.
6. session-pickup L8 `orch` vs registered tool `eng_orch` (`src/eng-orchestrator.ts`; extension test pins `["goal","loop","eng_orch"]`).
7. Autopilot-full: root is both "independent" verifier and merger (correlated failure). After writer yield, no PR owner. Conflicts with opening-a-pr.md "one-shot opener does not babysit".
8. Feature L6 "delegate only independent slices" vs upstream mandatory code-writing delegation — **not** a contradiction if read as slice ownership; as written it is ambiguous.

**Not contradictions (do not "fix")**
- Swarm `isolated:true` for writers vs arena `local://` for candidates — merge-intent asymmetry, encoded in arena L11, swarm L13, SKILL.md ~L77.
- Local pause "restart OMP" vs upstream "restart Cursor".
- Local Opening-a-PR isolation vs upstream Task-worktree reset.
- Local risk-scaled verification vs upstream ten live lanes — argued.
- Local in-app prototypes vs upstream isolated scratch — compensating controls exist.

**Undefined actors / gates**
- `STACK-READY`: no SHA, swarm, verdict carrier, or declaring actor.
- Watcher: no command, schema, events, rearm, frozen snapshot behind "provider's blocking wait".
- Review-agent inventory: list schema, no-agent vs `review-agent-unavailable`, login matching, who dismisses. shipping.md L6 depends on it.
- "The owner" / "their lead" in babysit vs graphite's one-stacker — unnamed.
- Selected provider: skills exist (`pr-cockpit`, `github-graphite`, `graphite`) but playbooks do not cross-reference who selects or where ready/open/status/append/arm live.
- Autopilot-full owner after yield; independent swarm actor; countersigner; liveness/replacement authority.
- Swarm: who applies the selection rule; who declares drain complete.
- Arena: how "blinded" is enforced; N; completion vs dropout; verification recovery owner.
- Authoring: who checks predicates; what runtime exercises routes.
- Interrogate: "real fixed point".
- Opening-a-PR: "the parent" after URL return (readiness, publication, continuation).
- Orchestrate: worker/verifier store-write authority (direct `eng_orch` vs coordinator relay); init-before-session-id exception.
- Worktree-cleanup: actor→path mapping; force vs plain `git worktree remove`.
- Large-refactor owner: upstream `figure-it-out`; local skill exists and is routed from SKILL.md but refactoring.md does not send large work there (map to planning).
- Prove-out/arena: who verifies judge-family separation after dispatch.
- Fanout bound: neither swarm file defines a max; OMP 24-concurrent cap is harness, not skill — state that, do not invent a number.

## 10. Minimal remediation plan

Cheap, load-bearing, restore-don't-invent. Do not rewrite faithful files.

**Wave 0 — one-line contradictions (minutes)**
1. arena L3 "isolated" → "separate".
2. interrogate L9 reframe (body stays).
3. session-pickup L8 `eng_orch`; L11 "claims".
4. hillclimb L15 landed order.
5. visual-parity L8: nonzero diff at any stop is an unresolved fail in the reply.
6. prove-out step 5: judge-family separation with degrade-and-report.

**Wave 1 — authorization (P0 + merge split-brain)**
7. Cut merge out of Babysit; `drive` = merge-ready; land → Shipping. Align Autopilot-full so merge is not Babysit-driven and not single-root merge without an independent verdict. Keep Autopilot-stack never-land.
8. Conflicts report-and-stop; restore topology bans + sanctioned follow-up; name the stacker.

**Wave 2 — router (multiplies every run)**
9. Explicit trigger rows: swarm; interrogate-for-contested-designs; technical-writing; Babysit-for-PR-status (not "through squash-merge"); show-me-your-work already present.
10. Principle applicability text restored beside the name lists. First-todo-reads-principles + reply names principles that changed a decision.
11. Autonomy: pause irreversible writes; honor session overrides; accept "no".

**Wave 3 — authoring + helpers**
12. Authoring: `create-skill` handoff, explicit predicates, structural/subjective split, voice paragraph, reply contract, heading.
13. Swarm: N, standalone briefs+statuses, drain barrier, race application, report shape.
14. Arena: judge protocol, selection/grafting precision, N-1+recovery, outputs. Keep `local://` / no-isolated-candidates / honesty guard.
15. Interrogate: config hook over default table; scope/intent derivation; keep actual-vendor honesty.

**Wave 4 — design / proof playbooks**
16. Feature: ownership preamble, architect default-on, delegated implementation + lead review, concrete throughput, commit sequencing, interrogate gate, phase-boundary owner.
17. Refactoring: contract preamble, pin-before-move, pin-green steps + rename spot-check, proof forms + reader-load revert, ordered commits, reply. LSP + project-standards stay.
18. Bug-fix: two-line evidence bar + failing-repro-before-fix.
19. Hillclimb: sensitivity/median-of-N, plateau+stop policy, candidate mechanics, direction/stop-predicate.
20. Autonomous-run: repair-or-park, commit-on-advance, iteration trail, plateau/pivot, loop-limit terminal.
21. Prototype: framing, dimensions, references, modality-specific evidence, path in reply. Keep co-location.

**Wave 5 — delivery + autonomy remainder**
22. Lift shipping SHA-pinned PASS/PASS+NOTES/FAIL + patch-id into the three-lane swarm; post on the PR; define STACK-READY.
23. Watcher schema/rearm/terminals/frozen queue on the selected provider; require each provider skill to expose watcher, arming confirmation, topology, MWR/disarm.
24. Autopilot-full persistent owner (named successor OK); Autopilot-stack parallel self-contained owners.
25. Opening-a-PR: title/body/ready, post-open parent duties, trigger rationale, non-destructive recovery. Document unslop/no-comments/pre-commit as the deslop/technical-writing/opener-interrogate substitute.
26. Shipping: arming proof, drain isolation, ceiling pass.
27. Orchestrate: FORBIDDEN no-fixes; retry table; store invariants; name write actor.
28. Cleanup: removal semantics, ownership verification, wip/scratch, reply. Declare simulator/cache exclusion.
29. Planning: phase Depends/observable/review-gate; execution-playbook name; prototype-before-write; lightweight checker.
30. Subagent recovery + second opinions; reply named-sections/impact/citation integrity.

**Out of scope / do not do**
- Copy Cursor slash commands, `poteto-agent`, `gt`/`gh` literals, cloud `environment: cloud`, disposable-worktree fanout, destructive worktree reset, live hotfix, unconditional PR creation, fixed ten live lanes, hardcoded Cursor model slugs, isolated-scratch prototypes.
- Patch guards-vs-checks locally.
- Harmonize swarm vs arena isolation.
- Rewrite the 23 exact/faithful files.

## 11. Explicit trade-offs

These are taken, not absorbed.

**(a) Semantic vs textual parity.** investigation.md and 21 principles prove byte-parity is achievable when semantics match. Everywhere else the correct bar is port the *contract* and adapt the *mechanism* (worktrees → `local://`, model slugs → agent definitions, `gt` → selected provider). Cost: future audits must diff invariants, not bytes. A fidelity pedant would reject this; a portability expert would reject copying Cursor syntax that cannot run. We take the portability side and state it.

**(b) OMP isolation vs upstream worktree fanout.** Both cite separate-before-serializing-shared-state and reach opposite operationalizations because Cursor worktrees are disposable and OMP `isolated:true` **merges onto the parent**. Cost: measurable hillclimb candidates (they edit the tree) cannot race; only serial exclusive-branch or `local://` artifact races remain. Escape hatch if throughput matters: prune-then-merge (merge only the winner). We keep the prohibition. A search-throughput expert would reject unconditional serialization of independent *read-only* hypotheses — so parallel `local://` races stay allowed when there is no shared writer.

**(c) Risk-scaled verification vs ten live lanes.** Upstream buys uniform auditability; OMP measured that ceremony turned a 12-unit job into 1 landed unit. We keep scaling, and restore only the load-bearing merge-ready/STACK-READY swarm (three lanes, SHA-pinned, posted). A program auditor would reject dropping *all* independent live proof; we are not doing that.

**(d) In-app prototypes vs isolated scratch.** UI.md's `?variant=` switcher requires hosting inside a real page so density/data problems surface. Cost: co-location blast radius, mitigated by naming, throwaway branch, never-on-main, production-untouched, capture-on-branch. A cleanup expert would reject this; a design-systems expert would reject isolated scratch because it cannot answer the question UI.md exists to ask. We take the design-systems side and document the divergence.

**(e) Scaffold-commit prohibition vs upstream scaffold-first.** DomainFeatureDesign: local architect "never commit not-implemented bodies" vs upstream scaffold-first commit mode, justified by OMP completeness, at the cost of a reviewable stable-contract intermediate commit. `local://` arena artifacts partially compensate. We keep the prohibition.

**(f) Provider-neutral wording vs concrete commands.** Portability vs "the operator knows exactly which binary to trust". Compressing watcher/arming/topology into "land through the selected provider" is the drift. Trade: keep the abstraction; **require** each provider skill to expose watcher, arming confirmation, topology, MWR/disarm. An operator would reject a playbook that names no binary; a multi-forge maintainer would reject hard-coded `gt`. We take both constraints.

**(g) Centralized model routing vs per-playbook reproducibility.** Clean ownership; measurement-sensitive runs (perf baseline, hillclimb ruler, prove-out judge) lose an in-file model record. Cost accepted if agent definitions actually pin models. Mitigation: one-line pointer in those playbooks, plus prove-out/arena resolved-family reporting. A measurement expert would reject an unrecorded model-selection contract — hence the pointer, not a return of Cursor slugs.

**(h) Hardcoded interrogate roster vs config hook.** Pinned seats make vendor-diversity auditable and go stale. Upstream's config hook stays fresh and adds a slug-failure mode. Fix: config over the default table, keep the honesty guard. We do not drop the table.

**(i) Stop-at-merge-ready vs unattended-merge throughput.** Operator-gate integrity beats merging from a quiet review-agent loop. Merge authority returns to Shipping + explicit grant. A release-engineer optimizing for overnight drain would reject this; we reject implicit merge because approval/check/agent state can change between observation and mutation.

**(j) One-shot exclusive-branch writers vs persistent cloud owners.** OMP cannot revive isolated tasks and applies their output to the parent — so PR-owning writers **must** be non-isolated one-shots. That does **not** require them to disappear at yield. Cost of restoration: a named successor on the exclusive branch, not a Cursor cloud sleeper. We take the successor model.

**(k) Autonomous-run ceremony (commit-on-advance + iteration trail).** Buys crash-resume and auditability; costs a commit per predicate movement. A speed-first agent would reject it; a reliability expert rejects uncommitted predicate movement that Pause-safely cannot find. We restore it.

**(l) Destructive upstream worktree reset-and-redo, not ported.** User-data safety over convenience. An expert would reject upstream's default when unrelated work may be present.

**(m) Bounded loops vs absolutist zero-diff.** Termination beats spinning; fail classification must stay explicit (visual-parity M2). We keep bounds and restore the fail sentence.

**(n) Judge-family separation with degrade-and-report, not hard-fail.** A distinct judge family may not exist in the roster. Leaving it implicit trades comparison validity for convenience silently — prove-it-works rejects trusting self-reports, and a same-family judge shares stylistic priors. We keep the guarantee visible without blocking prove-outs.

**(o) Compression.** Safe where the obligation moved into a referenced skill (prototype artifact law, diagnosing-bugs, verify-project). Unsafe where a cross-link was dropped (sequence-verifiable-units, interrogate, create-skill, technical-writing all exist locally). Most Wave-4 fixes are one-line re-links, not new policy.

## 12. Source links

**Upstream (cursor/plugins `main`).** Live main SHA at domain-audit time: `b9ddc83`. Cache pin used by some file audits: `397c8660da6d3d873a91e18c2ca2f22cac1f0ac1` (byte-identical to main for the audited principle set).

- https://github.com/cursor/plugins
- https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/poteto-mode/SKILL.md
- https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/poteto-mode/playbooks/ (authoring-a-skill, autonomous-run, autopilot-full, autopilot-stack, babysit, bug-fix, feature, hillclimb, investigation, multi-phase-plan, opening-a-pr, orchestrate, pause-safely, perf-issue, prototype, refactoring, runtime-forensics, session-pickup, shipping, trace-forensics, visual-parity, worktree-cleanup, eval)
- https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/principle-*/SKILL.md (21 leaves)
- https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/{swarm,arena,interrogate}/SKILL.md

Pinned blobs cited by file audits: hillclimb `6ae44bb6…`; refactoring `70d74ac8…`; shipping `43b57537…`; autopilot-stack `2f7b23f4…`; autonomous-run `bc68ad73…`.

**Local cache (heterogeneous reads).** `/Users/andrew/.cursor/plugins/cache/cursor-public/pstack/397c8660da6d3d873a91e18c2ca2f22cac1f0ac1/skills/`

**Local Eng Mode.** `skills/eng-mode/SKILL.md`; `skills/eng-mode/playbooks/*.md`; `skills/eng-mode/references/plan.md`; `skills/principle-*/SKILL.md`; `skills/{swarm,arena,interrogate}/SKILL.md`. Supporting, not in the 48: `skills/eng-mode/playbooks/pre-pr-gates.md`; `skills/{graphite,prototype,figure-it-out,technical-writing,diagnosing-bugs}/`.

**Inputs consumed.** Workflow: AuditMainSkill, AuditAuthoring, AuditAutonomous, AuditAutopilotFull, AuditAutopilotStack, AuditBabysit, AuditBugFix, AuditFeature, AuditHillclimb, AuditInvestigation, AuditMultiPhase, AuditOpeningPR, AuditOrchestrate, AuditPause, AuditPerf, AuditPrototype, AuditRefactoring, AuditRuntimeForensics, AuditSessionPickup, AuditShipping, AuditTraceForensics, AuditVisualParity, AuditCleanup, AuditProveOut. Principles/helpers: AuditBoundary, AuditLever, AuditEncodeLessons, AuditDesignSpace, AuditExperience, AuditRootCauses, AuditFoundations, AuditContext, AuditLaziness, AuditIdempotent, AuditMigrate, AuditReaderLoad, AuditDomainModel, AuditNoHumanBlock, AuditOutcome, AuditProof, AuditRedesign, AuditSeparateState, AuditSequence, AuditSubtract, AuditTypes, AuditArena, AuditInterrogate, AuditSwarm. Domains: DomainRouting, DomainFeatureDesign, DomainDiagnosisPerf, DomainAutonomy, DomainDelivery, DomainCorePrinciples, DomainVerificationMeta. Architecture domain fact: six architecture principle auditors, exact parity.

