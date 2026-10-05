# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works. Start each task with `/eng-mode` unless you want a named skill. Ask how without starting the work with `/eng-help`.

## Understand

- `/eng-mode read. restate the underlying issue in your own words, in plain english.`
- `/eng-mode investigate why. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use /how to understand. then use /why to find out why it broke recently.`
- `/recall my work on from last week, then read.`
- `/teach me why you implemented it this way and not. what did you trade off?`
- `/eng-mode take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/eng-mode. repro first, then fix and verify.`
- Bug in an app: `/eng-mode repro this with verify-project. if it repros on main, fix it and show me a video as proof.`
- Bug with a cheap test: `/eng-mode repro first. if there's a cheap test path, /tdd it. then fix and rerun.`
- Feature: `/eng-mode add. stays byte-identical. verify both.`
- Refactor: `/eng-mode move into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/eng-mode takes on. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/eng-mode prototype a few options for. take screenshots or videos for me to compare.`
- `/eng-mode we need. /architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/eng-mode write a tutorial for how i would use first. then /teach me why it beats the current one.`
- `ask /arena for a second opinion on this thread and our approach.`
- `/eng-mode turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/eng-mode plan the migration of to. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `/interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.` Read the dismissals too.
- `/swarm check every package under against its check script. one worker per package. one report.`
- `/eng-mode open the pr. small ordered commits, evidence in the description.`
- `/eng-mode babysit this pr. get it green.` For status only: `/eng-mode check on pr. anything outstanding?`
- `/eng-mode land the stack.`

## Away and back

- `/eng-mode im going to bed. on an exclusive branch off. done means. keep a decision log. don't ask me before committing. loop until done. if you're truly stuck after a few hours, stop and write up why.`
- `/show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `/eng-mode full autopilot on this queue. each item is independent. stop at merge-ready.`
- `/eng-mode autopilot these changes but stack them, don't ship. i'll land the stack.`
- `/reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision.
- `/bro` restates the last reply in plain words.

## Ask how without starting the work

- `/eng-help which skill should i use to review this branch?`
