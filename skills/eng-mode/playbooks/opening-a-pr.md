### Opening a PR

Invoked at the end of a code-producing playbook when delivery includes a PR.

**Pre-PR gates.** Before opening, run **Pre-PR gates**. Hard-stop unless a synthesis receipt exists at `.omp/pre-pr-gates/<sha>/synthesis.json` for the SHA the panel froze. After that playbook remediates the synthesized Act-on set, open through the selected provider without rerunning the panel. Not Pullfrog. Not a merge gate.

**Worktree.** Work from a clean branch off the correct base. Independent PR-owning writers are one-shot non-isolated agents on an exclusive branch; do not set `isolated: true` for them, because OMP isolation applies completed output onto the parent tree. Set `isolated: true` only for independent writers whose merged union is intended on the parent. Competing candidates use `local://`. Dirty branch with unrelated work requires an explicit safe split—never reset or discard user work.

**Commits.** Stage only the intended paths, then use `git commit -m "<message>"`. Keep commits small, ordered, and independently landable. Amend a just-made commit when the fix belongs there; otherwise create a new commit.

**PRs.** Use one PR for ordinary coherent work. When a large or complicated change would be materially easier to review as dependent, independently understandable layers, deliver it through the provider's documented stack workflow; never split by arbitrary size thresholds or stack small work by default. Run the project pre-commit pass before `git commit`; run `no-comments` on the diff before review; apply the **unslop** skill to the PR title and body. Do not merge from this playbook.

A one-shot subagent that opens a PR runs **Pre-PR gates**, the project pre-commit pass, and `no-comments`, returns the URL, and does NOT babysit. `interrogate` stays never-auto-apply and is not a substitute for the gates. Return to the parent.
