---
name: interrogate
description: Configurable adversarial review of a diff, design, or plan, with an auditable four-seat default spanning three intended model vendors. Use for interrogate, challenge this, stress test, or find blind spots. Not merge-gating. Never auto-apply.
disable-model-invocation: true
---

# Interrogate

The default panel is four auditable seats intended to span three vendors. A configured roster may extend, shrink, or replace those defaults; runtime fallbacks and dropouts may reduce either roster. Every seat receives the same review material. The lead applies judgment and never auto-edits.

## 1. Scope

Derive the review surface before dispatch:

- Use a user-supplied artifact, files, or diff when named.
- Otherwise, on a branch, review the branch-base diff (`git diff <base>...HEAD`), using the PR base when known and the repository's default branch otherwise.
- When the request refers to recent work rather than explicit paths, locate that work from the conversation and commits.

Include the diff or file contents plus the surrounding code, tests, contracts, and decisions needed to judge it. Do not treat unrelated working-tree changes as part of the artifact.

## 2. Intent

Write one clear paragraph describing what the change must accomplish. Derive it from the request, commit messages, PR title and description when present, and the code itself. Reviewers challenge execution, not the product call. Ask only when those sources leave materially different plausible intents.

## 3. Rubric

Read and apply [`references/rubric.md`](references/rubric.md) plus [`references/code-quality-review.md`](references/code-quality-review.md). Build every seat prompt from [`references/reviewer-prompt.md`](references/reviewer-prompt.md), filling the same intent, artifact, rubric, and code-quality contents.

## 4. Panel

Use the repository or session's configured `interrogate reviewers` list of project agent names when present, extending or shrinking the labels to match. Agent definitions own model routing; configuration must not put provider-specific model selectors in prompts. Without a configured list, use:

| Agent | Intended model family |
|---|---|
| `panel-opus` | Anthropic Opus |
| `panel-sol` | OpenAI Sol |
| `panel-fable` | Anthropic Fable |
| `panel-grok` | xAI Grok |

Before the batch, resolve every configured seat. If its configured model or role is unavailable, recover it through the runtime resolver: choose the closest available equivalent, preferring the same family and highest reasoning tier, record the substitution, and then dispatch. Treat resolver-owned `auto` or parent-inheritance as valid, not broken configuration. If no equivalent resolves, drop that seat and report it; do not block the review or silently duplicate another seat.

Dispatch one `task` batch with the same intent, artifact, and rubric to every resolved seat. After it settles, inspect each delivered result's `resolvedModel` and `resolvedModelIsFallback` when the runtime exposes them. Report each seat's actual resolved model and vendor. Missing metadata means vendor `unverified`: never infer it from the nominal agent, count it toward cross-vendor agreement, or call the roster complete. A fallback is a substitution even when the nominal agent returned normally. Continue after dropouts.

## 5. Synthesis and lead judgment

Read every report and apply [`references/lead-judgment.md`](references/lead-judgment.md). Parse every finding, including nits and findings later rejected. Deduplicate descriptions of the same issue while retaining every raising seat. Distinguish consensus findings from lone findings, and record explicit disagreements rather than forcing agreement.

Compute agreement over actual resolved vendors, never nominal seats. Independent agreement from two or more resolved vendors is high signal. Opus/Fable agreement without a cross-vendor fallback is one-vendor reinforcement, not cross-vendor consensus. Lone findings stay visible at lower confidence; severity and evidence can still make one actionable.

Categorize every finding:

- **Act on.** Correctness, security, observable contract, or documented project invariant. Blocks a real PR.
- **Consider.** Real concern; cost or timing is unclear.
- **Noted.** Valid but not actionable now.
- **Dismissed.** Wrong, nit, or missing context.

For every categorized finding, name all seats and each resolved vendor (or `unverified`) that raised it and give a one-line rationale for the category. For merged findings, preserve all provenance. For disagreements, name both positions and explain the lead's conclusion.

## Output

Use these named sections in order: **Intent**, **Reviewers**, **Act on**, **Consider**, **Noted**, **Dismissed**, **Agreement map**. Under **Reviewers**, list every configured/default seat, resolved model, actual vendor, fallback or recovery, dropout status, and finding count. The four finding sections account for every parsed finding with provenance and category rationale. The agreement map separates cross-vendor consensus, same-vendor reinforcement, lone findings, and explicit disagreements. No auto-edits.

The Standards + Spec review skill that `project-standards` names remains separate review. Shipping remains merge safety. Interrogate replaces neither.
