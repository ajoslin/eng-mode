---
name: interrogate
description: Four-seat adversarial review of a diff, design, or plan across three model vendors. Use for interrogate, challenge this, stress test, or find blind spots. Not merge-gating. Never auto-apply.
disable-model-invocation: true
---

# Interrogate

Same intent and rubric across four pinned seats and three vendors. The lead applies judgment. Nothing auto-edits.

## 1. Scope

Use the user-supplied artifact or the diff against the real fixed point. Include surrounding files reviewers need.

## 2. Intent

Write one paragraph describing what the change must accomplish. Reviewers challenge execution, not the product call.

## 3. Rubric

Read and apply [`references/rubric.md`](references/rubric.md) plus [`references/code-quality-review.md`](references/code-quality-review.md). Build every seat prompt from [`references/reviewer-prompt.md`](references/reviewer-prompt.md), filling the same intent, artifact, rubric, and code-quality contents.

## 4. Panel

Dispatch one `task` batch with the same intent, artifact, and rubric to all four project agents:

| Agent | Model family |
|---|---|
| `panel-opus` | Anthropic Opus |
| `panel-sol` | OpenAI Sol |
| `panel-fable` | Anthropic Fable |
| `panel-grok` | xAI Grok |

After the batch settles, inspect each delivered result's `resolvedModel` and `resolvedModelIsFallback` when the runtime exposes them. Report the actual resolved model and vendor for every observable seat. Missing resolver metadata means vendor `unverified`; never infer it from the nominal agent, count it toward cross-vendor agreement, or silently call the roster complete. A fallback is a substitution even when the nominal agent returned normally. If one seat is unavailable, continue with the others and report the dropout.

## 5. Lead judgment

Read every report and apply [`references/lead-judgment.md`](references/lead-judgment.md). Deduplicate and bucket every finding:

- **Act on.** Correctness, security, observable contract, or documented project invariant. Blocks a real PR.
- **Consider.** Real concern; cost or timing unclear.
- **Noted.** Valid but not actionable now.
- **Dismissed.** Wrong, nit, or missing context. State why.

Compute agreement over actual resolved vendors, never nominal seat names. Independent cross-vendor agreement from two or more resolved vendors is high signal. Opus/Fable agreement without fallback remains one-vendor reinforcement, not two-family consensus. Lone findings remain readable at lower confidence. Explicit disagreement is evidence.

## Output

Intent. Reviewer roster with actual resolved models/vendors, fallbacks, and dropouts. Act on / Consider / Noted / Dismissed. Actual-vendor agreement map. No auto-edits.

The Standards + Spec review skill that `project-standards` names remains separate review. Shipping remains merge safety. Interrogate replaces neither.
