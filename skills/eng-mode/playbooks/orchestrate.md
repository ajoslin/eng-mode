### Orchestrate

**You own the program, never the code. Author briefs, drain the queue, keep the frontier green, decide.** For a whole project handed to one standing coordinator chat: multi-day, many stacked PRs, dozens to hundreds of subagents, the human checking in twice a day instead of every five minutes. One task driven to a predicate is Autonomous run. One ambitious run needing a bespoke workflow is figure-it-out. Route here when the work outlives any single agent. Work one agent could finish inside the session's budget is not a program; measured head-to-head, this playbook's ceremony turned a half-hour 12-unit job into 1 landed unit while a plain agent landed all 12. Below that line, route to Autonomous run.

Do not rely on OMP's `orchestrate` magic keyword (keep it disabled in project config where possible): it only injects a hidden prompt notice and supplies no scheduler or transport. This protocol uses OMP's `goal`, `loop`, `todo`, `task`, and `hub`; the custom store supplies restart-safe program facts those primitives do not persist.

Ceremony must scale with the program. Every gate below prices in coordinator minutes; on cheap near-identical units, collapse it as each section directs rather than paying list price.

Three rules carry the rest.

- Completions are durable store facts; native task and hub messages are advisory wake-ups.
- Every spawn and every resume carries the standing orders verbatim.
- The brief is the product. A vague brief fails quietly, because a worker cannot ask you a question.

Do not spawn while an advisor is steering; orchestration contracts replace advisor steering.

Open a todo of the playbook steps. An active goal owns the durable program objective, not this finite graph or its repeated drain cadence. A step you skip stays listed with `skip: <reason>`.

#### Roles and placement

- **Coordinator (this chat).** Local. Frames, authors briefs, drains the inbox, owns the human report, makes judgment calls. It never authors or edits product code: conflicted merges, restacks, and code changes are always tasks. Mechanically landing a verified unit (fast-forward or clean cherry-pick of a worker's commit, then push) is bookkeeping the coordinator may do itself on repos where local git is cheap; queueing finished work behind an idle stacker is how a deadline harvests nothing. The loop is agentic end to end. Agents are spawned, resumed, and drained only through the `task` tool and `hub`. State reads and writes go through the `eng_orch` tool at drain points, one call in and one line out, to conserve context. The tool never spawns, waits, or wakes anything.
- **Sub-coordinator.** Always local, durable, one per track, and only when the program exceeds what one coordinator's drains can manage. A track the coordinator can drain itself needs no middle layer: each nested layer re-pays a full orientation preamble, and a blocking sub-coordinator hides its children while the parent idles. Owns its track's units and boards, authors its workers' briefs, spawns its own workers and verifiers. Rolls up aggregates at wave boundaries; never forwards raw child reports. Cap in-flight children at what one drain can process, roughly ten, as a rolling window; never as blocking batches, which cost the slowest child of every batch.
- **Worker / verifier.** One writer per exclusive git branch. Do not use `isolated: true` for PR-owning units: OMP isolated tasks apply completed output onto the parent tree and cannot be revived. Independent PR owners are one-shot non-isolated `implementation-agent` (or `judgment-agent`) workers, each on a branch the coordinator already checked out or that the worker creates and pushes before it yields. Competing design candidates stay on `local://` artifacts, never isolated writer workspaces. Run a unit's verifier on a different model family from its worker. Web proof mapped by the project verification contract is parent-sequential `verify-project`; workers return non-browser evidence so the coordinator can run that surface.

Depth stays at coordinator, track, worker. Author the track decomposition per project (build, landing, and verification are common cuts, not a required shape).
Exactly one top-level session coordinates a program. Other sessions may inspect the store, but they never claim its inbox or spawn its units.


#### Store layout

Create `.audit/orchestrate/<project-slug>/` (gitignored). That path is the `store` argument of every `eng_orch` call. Run `eng_orch init`, record its returned session id in the first standing order, and pass that literal value as `session` on every session-scoped call; every worker brief receives the literal value rather than relying on inherited environment. Every file has exactly one writer; owners publish facts, readers aggregate at read time. Use `eng_orch` for bookkeeping, while its canonical plain TSV and JSON stay readable without the tool.

- `preferences.md` is the standing-orders register: numbered lines, one constraint each (model policy, stack shape and count, verification bar, forbidden paths, escalation policy). Paste it verbatim into every spawn and every resume; directives decay across resumes, and each dropped one costs a human turn. When you catch yourself restating an instruction, append the line before you act (`principle-encode-lessons-in-structure`).
- `overview.md` is the durable PR and issue DB.
- `units.tsv` has one row per unit: id, track, state, branch, PR, head SHA, brief path.
- `frontier.json` is the computed merge frontier, per Stack safety. Recompute through the selected forge provider, never from narrative.
- `ledger.tsv` is the verification ledger, per Verification.
- `inbox/` holds unclaimed completion pointers. `inbox-claimed/<claim-id>/` holds crash-recoverable batches until their derived rows are committed and acknowledged. `gates.md` parks human gates (question, options, default on no answer) so a completion flood cannot wipe Ask state.
- `decisions.tsv` is the trail via the show-me-your-work skill.
- `status.md` is derived from `units.tsv` and `ledger.tsv` at each drain.

`local://` is session-scoped bulk context. `.audit/orchestrate/<slug>/` is restart-surviving program state. `goal` owns the program outcome, `loop` owns bounded drain or audit repetition when no blocking wait exists, and `todo` owns the finite graph. None replaces the store.

#### The brief

Your prompts to agents are your only product, and a sloppy brief compounds into slop across the whole tree. Every spawn carries all of it; a field you cannot fill is a unit you have not scoped yet.

```
GOAL         one sentence, the outcome, executable by a stranger with no chat access
SCOPE        paths this unit may write; paths it may not; its exclusive branch
CONTEXT      pointers to files and PRs; upstream reports pasted in full when this unit
             depends on them, because workers cannot see siblings
ACCEPTANCE   checkable criteria, one per line
VERIFY       exact commands or the project verification contract's feature map, plus known gotchas
TIMEBOX      rough cap on runtime; on expiry, return partial findings and stop rather than run on
FORBIDDEN    no rebase, no force-push, no direct forge executable, no isolated PR owners,
REPORT       status, branch, head SHA, PRs, verdict, what you actually ran, deviations,
             suggested follow-ups
STANDING     <preferences.md pasted verbatim>
```

Before yielding, the worker pushes an inbox pointer. Exact `inbox_push` arguments live on the tool.

Size the brief to the unit. A one-command unit gets the template collapsed to a paragraph that still names goal, scope, the verify command, and the report shape. Persist large context through `local://`.

A sub-coordinator brief adds its track boundary and unit list, its spawn budget, the drain protocol, and the rollup format (per child: name, status, PR, head SHA, verdict, one line; plus track status and frontier delta).

A dependency is a context relay, not just ordering: undeclared upstream context makes the worker guess. Missing fields are a refuse-to-spawn condition. Audit one sampled worker brief per sub-coordinator per wave, concurrently with the wave it samples, never as a gate in front of it; a failing brief stops that track and fixes the sub-coordinator's instructions, not just the worker. Never resume-chain a brief; respawn fresh with consolidated scope.

#### Steps

1. **Frame.** State the done predicate as something countable ("all 126 units merged, each ledger-verified `unit-test-verified` or better"). Quantify scope: units, rough effort, expected stacks, and the wall-clock budget. If one agent could finish inside that budget, stop here and run Autonomous run instead. Collapsing must not depend on another document being present: it means do the work directly in this session, plain workers where they help, verification inline, landing as you go, and none of the store, register, or pilot machinery below. Schedule landing against the budget: by roughly 70% of it, stop spawning and land what is verified, because finished-but-unlanded work counts as zero. Name the tracks per project. A contested decomposition or one-way door goes through the arena skill before the pilot. Present the framing once; reversible prep proceeds without waiting. If no goal is active, form the program predicate, scope, exclusions, and verification contract. When the native `goal` tool is present, call `goal({ op: "create", objective })`; otherwise require the operator to start `/goal` or `/guided-goal`. Never set or propose a goal token budget. Seed the finite program graph in `todo`.
2. **Install the runtime.** Run `eng_orch contracts` for the repository and record the decision before any store mutation; a code-producing program stops on blocked or unconfigured standards. If the selected provider does not document dependent stacks, stop. Only then run `eng_orch init` against the store path, record its returned session id before any spawn, open the trail via the show-me-your-work skill, write the remaining standing orders, and seed `frontier.json` from provider-owned stack state.
3. **Pilot.** Push one unit through the whole path: brief, worker, verification, stack entry, ledger row, merge. The pilot exists to falsify the brief template, the verify recipe, and the unit size while that costs one agent instead of fifty. Fix the contract from pilot evidence before any fan-out. Scale the pilot to the unit: on programs of near-identical cheap units, the first unit is the pilot, run as a normal unit with its verify command inline, and fan-out starts the moment it lands. The dedicated pilot pipeline (separate verifier agent, audit gate) is for expensive or novel unit shapes, not for clone-units where a serialized pilot has nothing to falsify.
4. **Scale.** Spawn a rolling window of workers up to the in-flight cap, refilling as children finish; blocking batches pay the slowest child of every batch. Spawn track sub-coordinators only past the one-drain threshold in Roles. Recompute ready work after each drain; relay upstream reports into downstream briefs; keep sibling communication upward only. The sampled brief audit runs alongside the wave it samples and stops the next refill on failure, not the current one. One topology owner for the entire provider-owned stack; no implementation worker mutates stack topology.
5. **Drain.** Run the queue discipline below at every drain point.
6. **Land.** Landing is continuous, never a terminal phase: integration starts with the first verified unit and runs alongside the remaining waves. On heavy repos the stacker is a standing role from wave one, integrating as units verify; on repos where local git is cheap, the coordinator lands verified units itself per Roles. Keep the frontier green before upper-stack work; Stack safety governs. Advance `frontier.json` only on merge or reported new head SHAs. A new head SHA voids the ledger row; re-verify after restack. Do not keep a verdict via `git patch-id` in this playbook.
7. **Close.** Drain the final inbox, reconcile every spawned agent to a terminal row (done, abandoned, zombie-reconciled), confirm the predicate on the real artifact, confirm every landed PR has a verdict for its current head SHA, audit the trail per show-me-your-work including its cross-model review, encode recurring corrections into `preferences.md` or the brief template. Leave the store intact; it is the postmortem. When the contract passes on the real artifact, every unit is terminal, and integrated heads have current verification, stop `loop` if active, then audit every goal deliverable and complete `goal`. The lead owns the terminal verdict.

`goal` owns the durable objective; `todo` owns the finite program graph; `show-me-your-work` owns decisions. Delegates report state transitions to the lead and never mutate parent state. Prefer blocking watch commands. When repeated drain or audit passes need another turn, invoke `loop` with a prompt and limit.

#### Queue and drain

- A worker or verifier externalizes its outcome before yielding by pushing an inbox pointer. The pointer is the completion record. Native task results and hub messages only wake the coordinator; never derive a unit transition from which transcript received them.
- Collect after every native completion wake and after a bounded wait. Begin one pass with `eng_orch inbox_claim`. A null claim means no work for this coordinator. Arrivals during a claim remain in `inbox/` for the next pass.
- Classify every claimed pointer (landed, needs-verify, failed, zombie, noise), write the resulting rows through `eng_orch` `unit_add`, `unit_set`, and `ledger_record`, and only then run `eng_orch inbox_ack` with the claim id. Never acknowledge first. A failed turn leaves the claim durable.
- Finish the pass with `eng_orch status`, then spawn the next wave in one message. Never deep-review inline; review work becomes a verifier unit, and diffs are not reviewed during collection.
- Account for every spawned child at its track's rollup: claimed, respawned, or its scope explicitly absorbed. Silently redoing a missing child's work hides both the wasted spend and the coverage gap its result existed to close.
- A collection turn ends with the three lines from `eng_orch status`: counts against the states, what changed, gates open. Detail lives in `status.md`; the full reply contract applies at checkpoints and close.

#### Stack safety

- The frontier is a computed object, never narrative. Recompute `frontier.json` through the selected provider after every merge and stack mutation: ordered PR list, branch names, head SHAs, a generation number, and the lowest unmerged PR. Resolve it where the provider owns authoritative topology; error rather than guessing from drifting base refs.
- Exactly one stacker per stack may mutate topology, serialized within its stack; record the holder in the standing orders.
- Workers never rebase and never invoke provider topology. Babysitters follow `playbooks/babysit.md`, one per stack, scoped to one immutable frontier generation; they report conflicts to the stacker rather than restacking.
- A dependent stack exists only after the selected provider confirms it. Never emulate one with independent PR creation. Never enable forge auto-merge on a dependent stack when it can collapse unprotected parents.
- PR closes and retargets go through the stacker only; closing a base PR orphans every chain above it. Merges and stack surgery are units with briefs like any other.
- One retro watcher follows merged PRs for reverts, post-merge CI breaks, and orphaned follow-ups.

#### Verification

Scale verification to the unit. When VERIFY is a single cheap command, the worker runs it and reports the output, and the coordinator spot-checks receipts; a dedicated verifier agent (on a different model family than the worker) is for units whose verification is expensive, judgment-laden, or high-blast-radius. A verifier agent whose entire product would be rerunning one command is ceremony, not verification.

Write ledger rows with `eng_orch ledger_record`. Check the current PR and head SHA with `eng_orch ledger_check`. `ledger.tsv`, one row per verdict, keyed by PR number plus head SHA:

`live-ui-verified | unit-test-verified | type-check-only | verifier-blocked | verifier-failed`

CI green is an input to a verdict, not a verdict. Behavioral work needs better than `type-check-only`. `verifier-blocked` is not a pass; respawn when the environment heals. `verifier-failed` gets a fix unit, not a re-verify. `INCONCLUSIVE` from `verify-project` is `verifier-blocked`. A worker may self-report; a verifier overrides it on the same key. A new head SHA voids the row, so re-verify after restack. The ledger answers "was this verified", not memory and not the transcript.

A unit is not done until its output is externalized the moment it lands, never batched to the end of the run: a worker pushes its branch and inbox pointer, a verifier writes its ledger row and inbox pointer, and receipts land in the store before either yields. Work that exists only in a transcript or on one VM when it dies was never done.

#### Liveness and failure

- Never resume an agent to check on it; a resume restarts an idle agent. Probe read-only: the ledger, `units.tsv`, selected-provider PR state, pushed branches, and `hub` job status. Transcript mtime is not liveness. `hub send` wakes parked agents, so never send a "status?" ping.
- Several children going silent together, or an unrelated agent appearing in this session's `hub` roster, is a session-collision signature. First suspect another top-level OMP session opening or closing. Stop spawning; continue collecting store pointers, and park the routing failure as a gate.
- A silent death gets a synthetic postmortem pointer (unit, failure mode, last evidence, options). Replan on evidence as it arrives; never wait for full quiescence.
- Retry by failure mode, then abandon the unit and replan around it.
- A zombie that returns hours late reconciles against the current frontier and ledger before anything is accepted; the world moved while it slept. Salvage unique findings through a fresh unit, never a blind merge.
- When continued spawning would produce garbage tree-wide (bad upstream output, broken acceptance, dead infra), write a stop line at the top of the standing orders, let in-flight work finish, fix the cause, clear it.
- Bound your own infra retries the same way you bound a child's. After a few consecutive tool aborts, stop retrying: write a terminal handoff to durable state (what is done, where it lives, the exact command to resume) and end the run.
- After a restart, local agents are dead. Recover the session from the store. Reattach work by PR and branch, not agent id, then collect.

#### Escalation

Reaches the human, batched into the status page rather than per item: irreversible actions (force-push to shared branches, deploys, deletions, closing someone else's PR), genuine product or preference calls no experiment settles, a standing order that contradicts observed reality, a program-level dead end that survived a replan. Park each as a `gates.md` entry before asking, route work around it, and leave the native goal active with the blocker recorded.

Never reaches the human: frontier nudges, restack mechanics, retries, CI flake triage, review-thread triage, format fixes, scope the brief already forbids (refuse and continue), and "should I keep going". When in doubt, act and log; deferring is the measured failure mode.

Mid-run discoveries fix only what blocks the frontier. Everything else parks in follow-ups; at this fan-out a small scope leak multiplies into PRs nobody asked for.

**Reply:** at checkpoints and close: the predicate and the count against it from `units.tsv` and `ledger.tsv`, tracks and what each landed, the frontier (PR list plus SHAs), verdicts summary, what was abandoned and why, gates awaiting the human (the only asks), the store path, and the trail path. Numbers from the tables, not narrative. Include PR links.
