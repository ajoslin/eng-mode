---
name: principle-guard-the-context-window
description: "Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning, or the lead is about to explore. Chooses between a scout and checkpoint→rewind, and sets wait and handoff rules. Use for /principle-guard-the-context-window."
disable-model-invocation: true
---

# Guard the Context Window

The context window is finite and non-renewable within a session. Every token should be worth its cost.

**Why:** Context overflow degrades reasoning quality, creates compression artifacts, and halts progress.

**Two tools, one rule.** Exploration either leaves the lead's context or never enters it.
- **`scout` when the answer is a report.** The lead does not need to see the raw material: mapping unknown code, parsing a transcript or trace, summarizing logs or a diff. Fan out, keep only the returned pointers and findings.
- **`checkpoint`→`rewind` when the lead must see it.** The lead needs to read the actual lines to decide the next edit or judge a result, and the reads would otherwise stay in context forever. Open `checkpoint` before the first exploratory call; `rewind` with the findings. Never nest one inside another; never yield inside one.
- Not both for the same question. A scout's report does not need a checkpoint around it; a checkpointed read does not need a scout.

**Pattern:**
- **Isolate large payloads.** Route verbose outputs, screenshots, and large documents to subagents. The main context gets summaries, not raw data.
- **Delegate the loop, not the decision.** An edit-test-fix cycle belongs in a worker with a fresh context. The lead decides scope and reads the result.
- **Wait once, never poll.** One blocking `hub wait` (timeout at least 15 minutes), one managed process, or one provider listen. Short waits and `sleep` each replay the whole context.
- **Don't read what you won't use.** Read ranges, not files. If a file isn't needed for the current task, skip it.
- **Keep frequently used content inline.** Templates and references used on every invocation belong in the skill file, not in separate files that cost a read each time.
- **Hand off at phase boundaries.** Above 200k tokens, `/handoff` before the next phase. Automatic compaction at 400k is the backstop.
- **Answer status from state.** A "how close are we" question is answered from `todo view` and `goal get`, not a re-verification pass.
- **Size phases and cap scope.** Limit files per phase, set turn budgets, account for mechanism costs.
