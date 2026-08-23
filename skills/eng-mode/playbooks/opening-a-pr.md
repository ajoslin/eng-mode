### Opening a PR

Invoked at the end of a code-producing playbook when delivery includes a PR.

**Worktree.** Work from a clean branch off the correct base. Independent PR-owning writers are one-shot non-isolated agents on an exclusive branch; do not set `isolated: true` for them, because OMP isolation applies completed output onto the parent tree. Set `isolated: true` only for independent writers whose merged union is intended on the parent. Competing candidates use `local://`. Dirty branch with unrelated work requires an explicit safe split—never reset or discard user work.

**Commits.** Commit liberally; rebase into small, ordered commits before opening PRs. Each commit is a future PR: landable, ordered to tell the story. Amend when the fix belongs in a just-made commit; new commit when separable.

**PRs.** Use native OMP `github` and `pr://` for ordinary repository and PR operations. Read the GitHub workflow skill `project-standards` names for unresolved-thread aggregation and CI failure drilldown (fall back to plain `gh`); for stacked work read the stack tooling skill it names. Run the project pre-commit pass on the diff before commit; run `no-comments` on the diff before review; apply the **unslop** skill to the PR description and commit bodies. UI-affecting PRs include the real visual proof the project's GitHub skill requires. Prefer narrow PRs; stack dependent follow-ups and branch independently only for genuinely independent work. Query live PR state before reporting it. No boilerplate on small PRs. After opening, run the Eng Mode **Babysit** playbook, including its review-agent loop over the agents `project-standards` lists, until the current SHA is quiet. Do not merge from this playbook. Push back when feedback drifts from intent.

A one-shot subagent that opens a PR runs `interrogate`, the project pre-commit pass, and `no-comments`, returns the URL, and does NOT babysit. Return to the parent. An explicitly long-lived Autopilot owner is the exception: its playbook requires babysitting after opening.
