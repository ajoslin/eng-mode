### Worktree cleanup

**Audit first. Deletion requires evidence and a human gate for any uncommitted or in-use state.**

1. Record disk state and enumerate worktrees from `git worktree list`. For each, collect size, age, branch, dirty state, PR state, active `hub` jobs/processes, `goal` state, `loop` status, and any exact `history://<id>` session URI already known to reference that path. Never scan bare `history://` or unrelated sessions.
2. Classification is advice, not permission. Active `goal`, `loop`, `hub` agent, pinned session, open PR, or running process holds the worktree.
3. Clean merged and abandoned worktrees with no dirty or active state may proceed. Uncommitted work, ambiguous ownership, simulators, caches, and user application state require an explicit deletion choice.
4. Remove only confirmed paths with `git worktree remove`; prune metadata. Never delete a typed path that was not returned by the audit.
5. Simulator and cache cleanup is outside this playbook. Do not imply it ran. Do not delete OMP session state, browser profiles, or evidence artifacts.
6. Re-measure disk and report reclaimed space, removals, and holds with reasons.
