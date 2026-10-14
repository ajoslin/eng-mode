---
name: no-comments
description: "Spawn Comment Sicko, fix accepted findings, and offer encodings for claimed constraints."
disable-model-invocation: true
---

# No comments

Spawn Comment Sicko. Act on accepted findings.

Defer to Comment Sicko's fresh perspective.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch, default `main`, including the working tree.

For caller-named directories, globs, or the whole repository (`.`, `repo`, `whole repo`), use sweep mode. Take the tracked files under those paths from `git ls-files`. Exclude generated files, vendored files, and lockfiles. Use the Sweep section instead of the diff-mode steps below.

## Steps

1. Spawn one `task` with `agent: "comment-sicko"`. Pass the scope. Do not restate its rules. Comment Sicko's agent definition owns its model. When `task` offers `effort`, use `lo` for narration-only slices and `hi` for slices with `IMPORTANT`, `do not remove`, or suppression claims.
2. Inspect its report and diff. Reject application-code edits, scope escapes, exception-protected deletions, misstated `MUST KILL` reasons, and flags that treat kept intentional code as guilty. Reshape flags on our-code surprises stay actionable. Do not restore those comments. A keep survives only with proof it is about something we cannot change. Audit missed scoped lint and TypeScript suppressions. Correctness or safety suppressions stay actionable `MUST KILL`s. Restore deletions only with exact exceptions and scoped proof. Before accepting thin `IMPORTANT` or `do not remove` kills or keeps, run `/how` or `/why` on their symbol. If a kill is ambiguous, do not restore. If a keep is refuted or still ambiguous, delete it. Revert and rerun one rejected report with the failure named. Reject a second, report it open, and fail `/no-comments`.
3. Fix trivial accepted flags directly by deleting a dead path, dropping a parameter, or using the real API. If any fix needs a shape, run `/architect` once for the accepted set and surrounding code. Stop at the sketch. Architect shapes. Step 4 implements.
4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. The **principle-fix-root-causes** and **principle-redesign-from-first-principles** skills guide intent only. Neither authorizes widening the fence nor fixing instances outside it. Never bolt on symptom guards.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Wait for interactive approval. Unattended and eval require caller pre-approval. If approved, encode then delete. Otherwise delete, report the constraint open, and sketch out-of-scope work.
6. Report the deletion count, restored comments, reruns, architect sketch, fixes, encoding offers, encodings, unenforced constraints, and other open work.

## Sweep

Partition the scope into disjoint slices by directory. Merge small directories. Give each slice to one `comment-sicko` job, with ownership limited to that slice's files.

Spawn one `task` batch with one `agent: "comment-sicko"` item per slice. Comment Sicko is a leaf. Keep this fan-out within OMP spawn depth 2 from the lead or a writer. Never spawn an intermediate coordinator. Use step 1's model and effort rules.

Drain every slice before aggregating. A missing slice makes the sweep `BLOCKED`, not complete. Apply step 2's audit to every slice report, including its rejection and rerun rules.

Apply accepted comment deletions. Do not implement `MUST KILL` refactors or delete workaround code in a sweep. Return a plan that answers "which workarounds are best solved by refactoring and which we can straight up delete".

List every accepted `MUST KILL` workaround in one table with columns `file:symbol`, workaround, verdict, and evidence. Use verdict `delete` when the workaround code can go outright. Use `refactor` when it needs a reshape, and name that reshape in one line. Then report deletion count per slice, restored comments, kept-comment reasons, and open constraints.
