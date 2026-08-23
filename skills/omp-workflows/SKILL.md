---
name: omp-workflows
description: Build deterministic multi-stage OMP eval workflows with retained computation state, structured schemas, parallel fan-out, pipeline barriers, and bounded budgets. Use for matrices, batch classification, prove-outs, staged research synthesis, or repeatable agent map-reduce where children need no hub follow-up.
disable-model-invocation: true
---
# OMP Workflows

Use OMP `eval` as executable glue around tools and one-shot agents. Keep product judgment in the lead.

## Choose the runtime

- `completion()`: one stateless, tool-free classification or transformation.
- `agent()`: one complete brief and output schema; child is disposed after return.
- `parallel(thunks)`: independent work with results returned in input order.
- `pipeline(items, ...stages)`: barriered waves; every item completes a stage before the next begins.
- Normal `task` + `hub`: work needs steering, revival, model badges, or a long-lived worker.

Do not move ordinary edits into eval merely to look systematic.

## Contract first

Define the input record and stable ID; stage output schemas; structured failure representation; artifact boundary; budget and stop condition; reducer; and human decision point.

Persist normalized intermediate results in kernel bindings or `local://` artifacts. Reuse top-level bindings across cells. Work incrementally: setup, load, transform, dispatch, reduce, verify.

## Reusable shapes

**Map and reduce.** Use `parallel()` for independent reads or classifications, validate one schema, then reduce deterministically.

**Barriered research.** Use `pipeline()` when stage 2 needs all stage-1 outputs: discover evidence → normalize citations → synthesize. Pass normalized artifacts, not transcript dumps.

**Prove-out.** Expand variant × organic task × model role × repetition records. Dispatch blinded candidates, retain transcript and artifact URIs, then judge all arms in one calibration. Compute failures, win rate, variance, and judge agreement. The lead reads every output before promotion.

**Learning triage.** Normalize observations, derive fingerprints, dedupe, and route accepted candidates through `capture-learning`. Never promote directly into enforcement.

## Failure rules

- Convert per-item failures to structured data so siblings survive.
- Retry transient tool failures only.
- Preserve provenance from output to input and transcript.
- Check `budget.remaining()` before another wave.
- Never use hub with eval children; they no longer exist after return.

## Finish

Report input, completed, and failed counts; stage timings when relevant; artifacts; budget used; reducer result; and the decision still owned by the lead.