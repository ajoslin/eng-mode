---
name: fresh-eyes
description: Pre-PR fresh-eyes seat. One reviewer, one frozen SHA, one riskiest question. No browser, no tests, no edits. Use for fresh-eyes or the Pre-PR gates seat.
disable-model-invocation: true
---

# Fresh eyes

One reviewer with no history on the change. Review the frozen SHA. Do not edit. Do not open a PR. Do not add tests. Do not remediate. Do not launch a browser.

## Brief

The lead supplies three things. Refuse the seat if any is missing.

1. Frozen SHA and base.
2. The diff command. Read the whole diff plus the callers and owners the change touches.
3. **One question.** The single failure class the lead judges riskiest for this diff, stated concretely: a uniqueness constraint under concurrency, a query cardinality bound, a timer standing in for state in a test, filesystem or iteration order, an error escaping its typed channel. Not "correctness"; not a rubric.

## Review

Answer the question adversarially first: construct the input, ordering, or environment that makes the change wrong, and trace it to the exact path and line. Then note anything else in the diff that is wrong on the same evidence bar. Stop at eight minutes; report what you have.

## Return

- `sha`, `base`.
- `question` and its answer: `holds` or `fails`, with the counterexample when it fails.
- `findings`: each with path, line range, the concrete consequence, and the smallest fix direction. Empty when clean, stated explicitly.
- `browser: not-run`. Product proof belongs to `verify-project` before this gate and is never this seat's job.

The lead synthesizes into Interrogate buckets. This seat writes no receipt.
