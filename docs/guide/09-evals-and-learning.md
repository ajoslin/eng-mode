# Prove-outs and learning

OMP `eval` is a retained computation runtime. Eng's **prove-out** is a blinded experiment on agent behavior. One is infrastructure; the other is a playbook.

## OMP workflows

Eval retains state across cells and exposes tools, structured display, `completion()`, `agent()`, `parallel()`, `pipeline()`, and budgets. Use `omp-workflows` for matrices, deterministic transformations, schema validation, barriered research, and agent map/reduce. Eval children are one-shot and cannot receive hub follow-up; use normal tasks when steering matters.

## Prove-outs

A behavior-changing skill or prompt needs organic requests, sanitized labels and paths, one hidden rubric, equal environments, and one judge scoring all arms on one calibration. Retain artifact and transcript provenance. Compute failures, win rate, variance, and judge agreement, but read every output before promotion.

## Correct the repo, not the next prompt

Start smaller than you think. Prompt plainly, watch where agents fail, and add a skill or a check when the same failure shows up twice.

When you correct agents for the same mistake again, `/correct` changes the repo so the next agent can't make it. Rank the options by how well they hold: architecture first, then types or a lint whose error names the fix, then a test, then a doc. Human review is not on the list. Pair it with `/architect` when the fix is a new boundary. `principle-encode-lessons-in-structure` is the same rule for one repeated instruction.

A skill edit affects every future session. Ask for a prove-out in the same task: "update the review skill so it flags missing migrations, and eval the change." Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

## Learning tickets

A lesson is a candidate, not authority:

```text
observation → provenance and dedupe → replay and counterexamples → measured guard → reviewed PR
```

Use `capture-learning`, which expects `linear_graphql`, to find or create the configured team project idempotently and deduplicate issues by fingerprint. Tickets include observed and expected behavior, evidence, scope, recurrence, counterexamples, and likely enforcement. Promote deterministic syntax to lint, dependency seams to architecture checks, contextual conventions to repository rules, repeatable procedures to skills, and domain language to the domain model—but only after fixtures and false-positive/negative review.

OMP autolearn remains an optional personal inbox. Linear tickets provide team lifecycle and remain the system of record.