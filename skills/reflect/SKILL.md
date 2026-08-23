---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

## When to invoke

- The user said "reflect" or "/reflect".
- A complex task (5+ tool calls) just landed cleanly and the recipe is worth keeping.
- The agent hit dead ends, found the working path, and the path generalizes.
- The user corrected the agent's approach mid-task.
- A non-trivial workflow emerged that isn't captured anywhere.

Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Capture the active conversation

Use the conversation already present in the parent context. For long sessions, write a tight digest containing the opening request, decisions, corrections, tool evidence, and outcome. When the system provides a specific `history://<id>`, read that URI directly; never treat `history://` as a filesystem directory or scan unrelated sessions.

### 2. Spawn three reviewers in parallel

Dispatch one `task` batch with three `reviewer` agents. Give each the same conversation or digest and one lens from `references/judgment-reviewer.md`, `references/tooling-reviewer.md`, and `references/divergent-reviewer.md`. Reviewers return findings only; they do not edit files. OMP configuration owns model routing.

### 3. Synthesize

Spawn one `reviewer` with `references/synthesizer.md` and the three full reports. The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. The synthesizer already applies this criterion; this is a final pass before edits land. See the **encode-lessons-in-structure** principle skill.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org; do not auto-apply.

Route every Backlog item through `capture-learning`. It expects `linear_graphql`, resolves configured team/project identifiers, and deduplicates before creating or updating a candidate ticket. Tracker submission is automatic; only Accepted skill edits wait for approval.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): run the Eng Mode Authoring a skill playbook's draft / validate / iterate loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): rework the description through the Authoring a skill playbook until the trigger fires.
- `new skill: <kebab-name>`: create it through the Authoring a skill playbook. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
