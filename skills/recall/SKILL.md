---
name: recall
description: Reconstruct recent working context from OMP history and shared repository records, then return a tight current-state brief. Use for recall, catch me up, or where did I leave off.
disable-model-invocation: true
---

# Recall

1. One specific prior session routes to Eng Mode Session pickup. Habit mining routes to `automate-me`.
2. Fix workspace, topic, and time window. Default to seven days. Never search another workspace without request.
3. Read OMP `history://` for this workspace. For a large corpus, partition independent time slices across `scout` agents in one batch. Return only topic, goal, decisions, open threads, corrections, and artifacts with session IDs.
4. For a named feature, file, subsystem, or bug, run `why` across git, PRs, issues, ADRs, the project tracker, and available operational evidence. Null searches are evidence.
5. Verify PRs, branches, issues, and current files against live state. History is not current truth.
6. Return: Capsule (max five bullets); Threads tagged merged/open PR/in flight/verified uncommitted/reverted/planned; Problems (max five); Next move (one action).

Use `unslop`. Sanitize private history before public output.
