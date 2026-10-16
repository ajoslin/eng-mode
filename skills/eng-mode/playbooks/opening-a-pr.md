### Opening a PR

Invoke this playbook only at the end of a code-producing playbook whose delivery includes a PR. Read-only work and local delivery do not need forge work.

**Pre-PR gates.** Before opening, run **Pre-PR gates**. Hard-stop unless a synthesis receipt exists at `.omp/pre-pr-gates/<sha>/synthesis.json` for the SHA the seat froze. After that playbook remediates the synthesized Act-on set, open through `eng-github` without rerunning the seat. Not Pullfrog. Not a merge gate.

**Recover without destroying work.** Work from an exclusive branch off the correct base. Independent PR-owning writers are one-shot, non-isolated agents on that branch. Do not set `isolated: true` for them because OMP applies isolated output onto the parent tree. Use `isolated: true` only when independent writers' combined changes belong on the parent. Competing candidates use `local://`. If unrelated changes make the branch dirty, preserve them in a patch or commit, create a fresh branch or worktree from the correct base, and apply only the intended changes. If the worktree is tangled, create a clean one and redo or selectively apply the intended commits. Never reset, discard, or overwrite user work.

**Review the history.** Inspect the base-to-HEAD commit list and diff before opening. Reorder or combine only commits you own so each commit is landable and the sequence tells the review story. Stage only the intended paths, run the project pre-commit pass, then use `git commit -m "<message>"`. Amend a just-made commit when the fix belongs there. Otherwise create a new commit. Do not rewrite shared history.

Commit bodies don't restate the subject.

**Choose one PR or a stack.** Follow `eng-github` **When to stack**. Around 1,000 to 3,000 lines of hand-written logic, encourage a stack split by reviewable concern. Mechanical bulk (codemods, renames, moves, generated code, lockfiles) may ship as one PR at any size. It is never a size gate. When you stack, use the documented `eng-github stack` workflow. One named owner runs topology commands for each stack. Workers and Babysit never mutate topology.

**Write for the reviewer.** Run `no-comments` on the diff before review. Apply `technical-writing` to the PR title, description, and commit body, using every layer except Diátaxis. Use one word per action, keep articles, and prefer a plain verb to `-ing` where one works. Then apply `unslop`. Use a Conventional Commits title, `type(scope): subject`, with no trailing period. Use `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf` as the type and the changed area as the scope. Keep the subject short and imperative, and name a real symbol when useful.

The PR body is a briefing, not the lab notebook. It gives a reviewer who has the diff a one-minute account of why the change exists, what it leaves out, what it could break, and how you proved it works. Write short, simple sentences with few identifiers, no walls of text. The squash commit body is the PR body. If the body would make the squash commit longer than about 40 lines, cut the body. Use `##` headings, not bold lead-ins, in this order, and omit only empty sections:

- `## Why`: the problem and approach, one to three short sentences. No SHAs, rebase genealogy, or "based on main" preamble.
- `## What changed`: one to three short bullets. Name a real symbol or path only when it carries the change. Name both sides of a rename or retarget.
- `## Scope`: always. One to three short items on what it covers and deliberately leaves out, such as a follow-up or known gap. No symbols, paths, or file-by-file essay.
- `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about. Skip when there was no real choice.
- `## Blast Radius`: one or two sentences on who or what it touches and why that is safe or risky. If main is red, state the cost of leaving it red.
- `## Verification`: one to three bullets, each a real run path and its outcome. For performance changes, give one primary number with its unit in `before → after` form and link the arena or swarm directory for the rest. No sample-size methodology, swarm recitals, or metric tables.

Attach visual evidence after the sections when it proves a claim. Full SHAs, swarm or arena lane recitals, lever-correction essays, file-by-file checklists, and "CLEAN" verdicts go in a linked artifact, not the body. Do not use `## Summary` or `## Test plan` boilerplate.

**Open ready and confirm.** Use `eng-github pr create --base BASE --head BRANCH --title "TITLE" --body-file FILE` to open a ready PR, never a draft. Confirm the URL, `headSha`, `baseRef`, and `isDraft: false` from its output. If the PR is still a draft, use `eng-github pr edit REF --ready`. If the command does not document an operation, use `eng-github api` or `eng-github graphql`; never use raw `gh` or another tool. A mismatch stops handoff. Do not reset or merge.

**Hand off after the URL.** Return the URL and confirmed snapshot to the explicit parent. The parent records a fresh `eng-github snapshot`, then assigns exactly one next owner: Babysit or a watcher when PR health is the active phase, or the continued build/stack phase when more PRs remain. Finish the phase or stack before per-PR watching that later pushes would restart. Push back when review feedback drifts from the stated intent. A one-shot opener never babysits, watches, merges, or changes stack topology. An Autopilot-full or Autopilot-stack owner is not a one-shot opener. Its brief assigns the Babysit loop, which starts after its code-ready report. The owner reports merge-ready or STACK-READY per its playbook and is exempt from the rules here and in `babysit.md` that hold Babysit until a whole stack is built.

Merge-ready owners complete `eng-github`'s final SHA-bound pre-merge gate before applying `babysit complete`; Shipping checks it again before landing.
