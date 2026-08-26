### Pause safely

**You own a clean stop. Leave a checkpoint a cold-start agent can resume from.** For "pause safely", "I need to go offline", "restart OMP", or "board my flight", and when context is about to compact or summarize. This is explicit only. On "keep going", "going to bed, keep going", or "don't stop", do not pause. Those mean continue, and Autonomous run already checkpoints per iteration.

1. Stop starting work. Send every active writer a zero-new-work checkpoint request through `hub`: finish or back out the current atomic step, then yield with the exact patch, branch, artifact, or applied paths. Wait for those checkpoint results; confirm each is materialized in the parent or recorded at a durable path. Cancel only stuck or non-writing children after recoverable state exists. Never stop mid-edit in a known-broken state.
2. Don't cross an irreversible line to pause. No PR and no push unless you already had one out.
3. Make only task-owned work durable. Inventory paths changed by this task, stage only those paths, then `omp commit --no-changelog -c "WIP checkpoint of task-owned paths"`. Leave unrelated dirty state unstaged and record it in the resume note. If task-owned changes cannot be isolated safely or are known broken, write the note without creating a mixed or broken commit.
4. Write the resume note to the project-stable working path `.audit/<slug>-resume.md`. Capture intent, progress and evidence, current state, next steps, key files, gotchas, and any child artifact paths. Append the note path to the goal/decision trail so Session pickup can locate it.
5. If a native goal is active, leave it incomplete and require the operator's `/goal pause` after the checkpoint is durable. If `/loop` is active, require `/loop stop` before claiming the pause is complete; neither lifecycle action is agent-callable.

**Reply:** the resume-note path, where you are in the loop, what's on disk versus still in your head, commits made, tree state, active-goal pause evidence or the outstanding `/loop stop` gate, and the first action on resume. This is a pause, not a final report. Resume is the Session pickup playbook reading the named note.
