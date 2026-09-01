---
name: arena
description: Build multiple separate candidate artifacts, judge them against one rubric, choose a base, graft the strongest ideas, and verify the synthesis. Use for /arena or design bakeoffs.
disable-model-invocation: true
---

# Arena

Fan out an explicit `N >= 2` attempts at the same artifact, then select and synthesize one result. The lead owns framing, recovery, selection, integration, verification, and the final record end to end.

## Start

Before dispatch, the lead creates one `todo` item for each phase: **Frame, Fan out, Cross-judge, Pick, Graft, Verify**. Delegates report phase evidence; they never mutate the lead's `todo` or `/goal` state.

## Frame

1. Name the artifact, `N`, shared grounding, and 3-6 concrete, gradeable criteria. The same task prompt goes to every candidate; task-local instructions differ only in the assigned structural direction and output path.
2. Require at least two genuinely different structures, not cosmetic variants. Record whether diversity comes from resolved model family, constraints, or design lenses. Agent definitions own model routing; never pass a prompt-level model slug, and call the run multi-model only when resolved families were actually distinct.
3. Pick a writable agent type and assign each candidate exclusive ownership of a distinct `local://arena-<slug>-candidate-<n>.md` artifact. Competing candidates never use `isolated: true`: OMP applies isolated writer output to the parent tree, while arena outputs are alternatives whose union is not intended. Read-only panel agents cannot be candidates.
4. Each standalone candidate brief names the task, shared grounding, structural direction, owned output artifact, observable completion condition, and requires the complete candidate plus a short rationale naming considered and rejected alternatives. Candidates see the task, not the rubric or one another's work.

## Fan out

Dispatch all `N` candidates in one `task` batch. A candidate is complete only when its owned artifact contains both the requested artifact and rationale. After the batch settles, the lead inspects every output directly. If one candidate drops out, record the failure and continue with `N-1`; the lead owns recovery of missing or partial output and may rerun that direction when its absence defeats the required structural diversity. Never let one candidate overwrite or complete another's artifact.

## Cross-judge

Start judging only after candidate writes have settled. Give one read-only `reviewer` or named project review agent the rubric and sanitized labels (`Candidate A`, `Candidate B`, ...), with no candidate identity, agent type, resolved family, or path naming that reveals authorship. The judge must:

- score every candidate criterion by criterion and cite artifact evidence;
- identify invariant, extensibility, and seam/interface tradeoffs;
- recommend a base with rationale and name uncertainty or rubric ambiguity.

Resolve the judge to a model family different from every candidate family when the available agent roster permits it. The lead verifies the resolved-family provenance after dispatch rather than trusting the requested route. If separation is unavailable, continue but write `judge-family separation unavailable` in the synthesis note; never imply an independent-family verdict. The judge reads candidates but writes no candidate artifact.

## Pick

The lead reads every candidate and rationale end to end, independently scores each rubric criterion, then compares those scores with the blinded judge. Resolve disagreement explicitly; do not average scores or defer ownership to the judge. Select first for preserved invariants, ease of extension without breaking them, and fit of the interface at its seam. Prefer lower reader load or a smaller surface only as a tie-breaker.

## Graft

Walk every losing candidate again. Usually graft only one or two coherent ideas, folding them into the base by hand under **redesign-from-first-principles** rather than pasting or averaging designs. For each graft record its source label; for each material rejected idea record why it was rejected. If candidates converge on one shape, record consensus and do not invent grafts. If they diverge so widely that the rubric cannot choose coherently, the lead owns recovery: reframe the prompt and rerun the arena.

## Verify

Precisely graft the selected design into the real target, migrate any affected integration points, and verify the synthesized artifact on its real surface under **prove-it-works**. If verification fails, return to Graft when a candidate already contained the missing idea; otherwise return to Frame and rerun. Do not patch around a failed synthesis.

## Outputs

Finish every phase item and produce:

1. one synthesized, integrated, verified artifact; and
2. one short synthesis note alongside it naming `N`, structural-diversity mechanism, blinded-label map retained only for traceability, candidate completion/dropouts and recovery, criterion-by-criterion lead and judge scores, resolved-family separation or visible degradation, selected base and rationale, grafts with sources, rejections, convergence or reframe decision, and verification evidence.
