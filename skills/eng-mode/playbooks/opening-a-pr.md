### Opening a PR

Invoke this playbook only at the end of a code-producing playbook whose delivery includes a PR. Read-only work and local delivery do not need forge work.

**Pre-PR gates.** Before opening, run **Pre-PR gates**. Hard-stop unless a synthesis receipt exists at `.omp/pre-pr-gates/<sha>/synthesis.json` for the SHA the panel froze. After that playbook remediates the synthesized Act-on set, open through the selected provider without rerunning the panel. Not Pullfrog. Not a merge gate.

**Recover without destroying work.** Work from an exclusive branch off the correct base. Independent PR-owning writers are one-shot, non-isolated agents on that branch. Do not set `isolated: true` for them because OMP applies isolated output onto the parent tree. Use `isolated: true` only when independent writers' combined changes belong on the parent. Competing candidates use `local://`. If unrelated changes make the branch dirty, preserve them in a patch or commit, create a fresh branch or worktree from the correct base, and apply only the intended changes. If the worktree is tangled, create a clean one and redo or selectively apply the intended commits. Never reset, discard, or overwrite user work.

**Review the history.** Inspect the base-to-HEAD commit list and diff before opening. Reorder or combine only commits you own so each commit is landable and the sequence tells the review story. Stage only the intended paths, run the project pre-commit pass, then use `git commit -m "<message>"`. Amend a just-made commit when the fix belongs there; otherwise create a new commit. Do not rewrite shared history.

**Choose one PR or a stack.** Use one PR for ordinary coherent work. When dependent, independently understandable layers would make a large change materially easier to review, use only the selected provider's documented stack workflow. Do not split work by an arbitrary size threshold. Do not stack small work by default.

**Write for the reviewer.** Run `no-comments` on the diff before review. Apply `technical-writing`, then `unslop`, to the PR title and body. Use a Conventional Commits title in the form `type(scope): subject`, with `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf`. Name the changed area as the scope. Keep the subject short and imperative, name a real symbol when useful, and omit a trailing period.

Write these body sections in order and omit only empty sections:

- `## Why`: state the intent and why this approach fits.
- `## Scope`: state facts from the diff, name real symbols and paths, and mark meaningful in-scope and out-of-scope boundaries.
- `## Tradeoffs`: state real choices. Omit the section when there are none.
- `## Blast Radius`: name affected users and systems, and explain the safety or risk.
- `## Verification`: name each exercised path or command, its outcome, and the rigor of the evidence.

Attach visual evidence after the sections when it proves a claim. Do not add `## Summary` or `## Test plan` boilerplate.

**Open ready and confirm.** Open with the selected provider as ready, never draft. Explicitly set `draft: false` when the provider accepts that field. If the host still reports a draft, use the selected provider's documented ready operation; if no such operation is documented, stop. After creation, use the provider's PR snapshot operation to confirm the URL, current head SHA, base branch, and ready state. A mismatch stops handoff. Do not reset or merge.

**Hand off after the URL.** Return the URL and the confirmed snapshot to the explicit parent. The parent records a fresh snapshot, then assigns exactly one next owner: Babysit or a watcher when PR health is now the active phase, or the continued build/stack phase when more PRs remain. Finish the phase or stack before starting per-PR watching that later pushes would restart. Push back when review feedback drifts from the stated intent. A one-shot opener never babysits, watches, merges, or changes stack topology.
