---
name: principle-guard-the-context-window
description: "Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads. Use for /principle-guard-the-context-window."
disable-model-invocation: true
---

# Guard the Context Window

The context window is finite and non-renewable within a session. Every token should be worth its cost.

**Why:** Context overflow degrades reasoning quality, creates compression artifacts, and halts progress.

**Pattern:**
- **Checkpoint every investigation.** `checkpoint` before the first exploratory read, grep, log, or transcript call; `rewind` with the findings when done. The intermediate calls leave the active context; only the report stays.
- **Isolate large payloads.** Route verbose outputs, screenshots, and large documents to subagents. The main context gets summaries, not raw data.
- **Delegate the loop, not the decision.** An edit-test-fix cycle belongs in a worker with a fresh context. The lead decides scope and reads the result.
- **Wait once, never poll.** One blocking `hub wait` (timeout at least 15 minutes), one managed process, or one provider listen. Short waits and `sleep` each replay the whole context.
- **Don't read what you won't use.** Read ranges, not files. If a file isn't needed for the current task, skip it.
- **Keep frequently used content inline.** Templates and references used on every invocation belong in the skill file, not in separate files that cost a read each time.
- **Hand off at phase boundaries.** Above 200k tokens, `/handoff` or `rewind` before the next phase. Automatic compaction at 400k is the backstop.
- **Size phases and cap scope.** Limit files per phase, set turn budgets, account for mechanism costs.
