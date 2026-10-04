### Opening a PR

Invoke this playbook only at the end of a code-producing playbook whose delivery includes a PR. Read-only work and local delivery do not need forge work.

**Pre-PR gates.** Before opening, run **Pre-PR gates**. Hard-stop unless a synthesis receipt exists at `.omp/pre-pr-gates/<sha>/synthesis.json` for the SHA the seat froze. After that playbook remediates the synthesized Act-on set, open through the selected provider without rerunning the seat. Not Pullfrog. Not a merge gate.

**Recover without destroying work.** Work from an exclusive branch off the correct base. Independent PR-owning writers are one-shot, non-isolated agents on that branch. Do not set `isolated: true` for them because OMP applies isolated output onto the parent tree. Use `isolated: true` only when independent writers' combined changes belong on the parent. Competing candidates use `local://`. If unrelated changes make the branch dirty, preserve them in a patch or commit, create a fresh branch or worktree from the correct base, and apply only the intended changes. If the worktree is tangled, create a clean one and redo or selectively apply the intended commits. Never reset, discard, or overwrite user work.

**Review the history.** Inspect the base-to-HEAD commit list and diff before opening. Reorder or combine only commits you own so each commit is landable and the sequence tells the review story. Stage only the intended paths, run the project pre-commit pass, then use `git commit -m "<message>"`. Amend a just-made commit when the fix belongs there. Otherwise create a new commit. Do not rewrite shared history.

**Choose one PR or a stack.** Follow `gh-stack` **When to stack**. Around 1,000–3,000 lines of hand-written logic, encourage a stack split by reviewable concern. Mechanical bulk (codemods, renames, moves, generated code, lockfiles) may ship as one PR at any size. It is never a size gate. When you stack, use only the selected provider's documented stack workflow.

**Write for the reviewer.** Run `no-comments` on the diff before review. Apply `technical-writing`, then `unslop`, to the PR title and body. Use a Conventional Commits title in the form `type(scope): subject`, with `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf`. Name the changed area as the scope. Keep the subject short and imperative, name a real symbol when useful, and omit a trailing period.

The PR body is a briefing, not the lab notebook. A reviewer who has the diff should learn why the change exists, what it leaves out, what it could break, and how you proved it works, in under a minute. Write short, simple sentences with few identifiers. Do not write walls of text. The squash commit body is the PR body. If the body would make the squash commit longer than about 40 lines, cut the body.

Put each section under a `##` heading, not a bold lead-in, so the sections stand apart. Write these sections in order and omit only empty sections:

- `## Why` gives the problem and the approach in one to three short sentences. Do not list SHAs or rebase genealogy. Do not add a "based on main" preamble.
- `## What changed` has one to three short bullets. Name a real symbol or path only when it carries the change. Name both sides of a rename or retarget.
- `## Scope` always names what the PR covers and what it deliberately leaves out, for example a related follow-up or a known gap. Use one to three short items. Do not list symbols or paths, and do not write a file-by-file essay.
- `## Tradeoffs` names only rejected alternatives that a reviewer would otherwise ask about. Skip this section when there was no real choice.
- `## Blast Radius` gives one or two sentences on who or what the change touches and why that is safe or risky. If main is red, state the cost of leaving it red.
- `## Verification` has one to three bullets. Each bullet names a real run path and its outcome. For a performance change, report one primary number with its unit in `before → after` form. Link the arena or swarm directory for the remaining evidence. Do not include sample-size methodology, swarm recitals, or metric tables.

Attach visual evidence after the sections when it proves a claim. Do not paste full SHAs, swarm or arena lane recitals, lever-correction essays, file-by-file checklists, or "CLEAN" verdicts. Put these details in a linked artifact. Do not use `## Summary` or `## Test plan` boilerplate. A commit body does not restate its subject.

**Open ready and confirm.** Open with the selected provider as ready, never draft. Explicitly set `draft: false` when the provider accepts that field. If the host still reports a draft, use the selected provider's documented ready operation. If no such operation is documented, stop. After creation, use the provider's PR snapshot operation to confirm the URL, current head SHA, base branch, and ready state. A mismatch stops handoff. Do not reset or merge.

**Hand off after the URL.** Return the URL and the confirmed snapshot to the explicit parent. The parent records a fresh snapshot, then assigns exactly one next owner: Babysit or a watcher when PR health is now the active phase, or the continued build/stack phase when more PRs remain. Finish the phase or stack before starting per-PR watching that later pushes would restart. Push back when review feedback drifts from the stated intent. A one-shot opener never babysits, watches, merges, or changes stack topology. An Autopilot-full or Autopilot-stack owner is not a one-shot opener. Its brief assigns the Babysit loop, which it starts after its code-ready report. The rules here and in `babysit.md` that hold babysitting until a whole stack is built do not apply to that owner.
