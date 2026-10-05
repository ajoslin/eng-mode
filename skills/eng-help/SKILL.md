---
name: eng-help
description: Guides users through Eng Mode setup, /eng-mode, and picking the skill, playbook, or principle for a task. Type /eng-help with a question. Use for /eng-help.
disable-model-invocation: true
---

# Eng help

Answer the user's question about Eng Mode, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and an Eng Mode run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use Eng Mode to fix this bug", is not a help question. Read [`eng-mode`](../eng-mode/SKILL.md), do the work under it, and mention once that `/eng-mode` is the session they should start next time.

This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/ajoslin/eng-mode/blob/main/` followed by its path. Link [pstack upstream](https://github.com/cursor/plugins/blob/main/pstack/) only when pointing at the source this port came from.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/eng-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make Eng Mode my own

Check the state that changes the answer, and mention it only when it does:

- `setup-eng-mode` has not been run in this repository. Model roles, contracts, and isolation are unvalidated.
- No `verify-project` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/create-verification-skill` when the question is about proving a change works.

## Get set up

1. Install with `omp plugin install github:ajoslin/eng-mode`, then restart OMP.
2. Run [`/setup-eng-mode`](../setup-eng-mode/SKILL.md) in every repository. It validates plugin provenance, model-role chains, `goal`, `loop`, worktree isolation, and that repository's `project-standards` and `verify-project` contracts. It does not ask for a reasoning budget. OMP agent roles own model routing.
3. Start a real task with `/eng-mode`, a goal, and a check that can pass or fail.

Installing changes nothing until the user invokes a skill. The [README](../../README.md) and [setup page](../../docs/guide/02-setup-and-health.md) have the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. Eng Mode spends extra tokens on typed agents and review panels. Use a cheaper agent type (`sonic`, `scout`) when the brief is mechanical or read-only. Save `/eng-mode` for work that needs rigor. A small, obvious edit does not.

Eng Mode is built for OMP. Its skills use the Agent Skills format, so other tools can read them. Workflow skills spawn OMP typed agents with role chains from `agentModelChains`.

## Start a task with `/eng-mode`

`/eng-mode` matches the task to a playbook and runs the other skills as the steps need them. Playbook steps, principles, and skill reads never appear as todos. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one. [Giving work](../../docs/guide/03-give-work-to-aj.md) has examples.

Start each new task with `/eng-mode`. Mid-chat, "new task" makes the mode match a fresh playbook. To get the same style from a subagent of your own, spawn the most specific OMP agent type the brief qualifies for.

## Pick a skill

The default answer is `/eng-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/eng-mode`](../eng-mode/SKILL.md) |
| Know how code works now, or where new code should live | [`/how`](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/why`](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/teach`](../teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/recall`](../recall/SKILL.md) |
| Know what a small diff could break outside itself | [`/blast-radius`](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/architect`](../architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [`/arena`](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers | [`/swarm`](../swarm/SKILL.md) |
| Have several models review a diff and try to break it | [`/interrogate`](../interrogate/SKILL.md) |
| Diagnose a defect with a scientific bar | [`/diagnosing-bugs`](../diagnosing-bugs/SKILL.md) |
| Name the domain shape or record an ADR | [`/domain-modeling`](../domain-modeling/SKILL.md) |
| Deepen a module's interface | [`/codebase-design`](../codebase-design/SKILL.md) |
| Build a throwaway in-app variant to answer a design question | [`/prototype`](../prototype/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/tdd`](../tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/no-comments`](../no-comments/SKILL.md) |
| Clean AI tells out of prose | [`/unslop`](../unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/technical-writing`](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/bro`](../bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/create-verification-skill`](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/maintain-verification-skill`](../maintain-verification-skill/SKILL.md) |
| Vet a performance number before reporting or acting on it | the `benchmark-checklist` skill |
| Run a large or cross-cutting change, or one to review after stepping away | [`/figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/show-me-your-work`](../show-me-your-work/SKILL.md) |
| Validate the Eng install, roles, and repository contracts | [`/setup-eng-mode`](../setup-eng-mode/SKILL.md) |
| Copy portable skills into a host repository | [`/eng-mode-sync-skills`](../eng-mode-sync-skills/SKILL.md) |
| Turn their own working habits into a personal mode skill | [`/automate-me`](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/reflect`](../reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | the `correct` skill |
| File a learning ticket from evidence | [`/capture-learning`](../capture-learning/SKILL.md) |
| Run a blinded skill or workflow comparison | [`/omp-workflows`](../omp-workflows/SKILL.md) and the Prove-out playbook |
| Use the selected forge or stack a GitHub PR | the `forgeProvider` skill from `eng_orch contracts`, or [`/gh-stack`](../gh-stack/SKILL.md) |
| One Pre-PR question from a reviewer with no history | [`/fresh-eyes`](../fresh-eyes/SKILL.md) |
| Harsh maintainability review, explicit only | [`/thermo-nuclear-code-quality-review`](../thermo-nuclear-code-quality-review/SKILL.md) |
| Proven-working-code bar, explicit only | [`/meaningful-contribution`](../meaningful-contribution/SKILL.md) |
| Find their way around Eng Mode | `/eng-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/how` explains what the code does. `/why` explains the reasons. `/teach` runs one or both and explains the result plainly.
- `/arena` gives every worker the same brief and merges the best parts. `/swarm` splits work into slices or a race and returns one report.
- `/architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/interrogate` reviews the diff. `/blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/recall` rebuilds context across recent chats. Resuming one specific chat or branch is the Session pickup playbook.
- `/figure-it-out` designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Not in Eng Mode:

- The project pre-commit pass `project-standards` names, plus `no-comments`, replace Cursor's `/deslop`.
- `loop` and `goal` are registered OMP tools, not slash skills.
- Eng Mode has no `/orchestrate` skill. Orchestrate is an `/eng-mode` playbook. Do not use OMP's `orchestrate` magic keyword. It supplies no scheduler or transport.
- Cursor-only pstack extras, such as a Grok Bot webhook page builder, are not shipped here.

## Playbooks and principles

Playbooks are step lists inside `/eng-mode`, not skills, so they have no slash command. Inside `/eng-mode`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. Babysit ends at merge-ready and never merges. Landing belongs to Shipping.
- "land the stack" runs Shipping. Owners land only through Shipping with lead countersign. The lead never merges.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "stack them, don't ship" runs Autopilot-stack. Neither playbook merges. The operator lands through Shipping.
- "run the prove-out playbook" runs Prove-out.

Without `/eng-mode`, a phrase such as "babysit this pr" can start another skill for the same job instead. The Router section of [`eng-mode`](../eng-mode/SKILL.md) lists every playbook and when it applies. [Build, debug, verify, and deliver](../../docs/guide/06-build-debug-and-verify.md) covers opening, babysitting, and landing a PR.

Eng Mode has no planning skill. For work that spans phases or stacked PRs, asking `/eng-mode` for a plan runs the [Multi-phase plan playbook](../eng-mode/playbooks/multi-phase-plan.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/architect` settles it in code first.

Principles are one-rule skills that `/eng-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/principle- ` still loads one on demand. [Mental model](../../docs/guide/01-mental-model.md) lists the ones that earn a name there.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The skill faded after a few turns | Start each task with `/eng-mode`. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| A new model role had no effect | `setup-eng-mode` reports resolved roles. Start a new session after a role change. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Only `/setup-eng-mode` and `/eng-help` load from the user's words. The others load when the user types them or when `/eng-mode` runs them, and it doesn't run every skill. |
| Parallel agents overwrote each other | Give writers disjoint paths or verified isolation. Competing candidates use distinct `local://` artifacts, never isolated writer workspaces whose merge would land on the parent. |
| An overnight run moved but finished nothing | `loop` needs a check that can pass or fail, not a duration. See [context and long runs](../../docs/guide/07-context-and-long-runs.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |
| The agent offered to merge a green PR | Babysit ends at merge-ready and never merges. Route landing to Shipping. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [Recipes and failure modes](../../docs/guide/10-recipes-and-failure-modes.md) has more pitfalls and the recipes worth copying.

## Make Eng Mode my own

- [`/automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/eng-mode`.
- [`/reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/eng-mode write a skill for ` runs the authoring playbook. The Prove-out playbook tests a skill change blind.
- the `correct` skill fixes repeated mistakes in the repo with architecture, types, lint, or tests before docs.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

[Prove-outs and learning](../../docs/guide/09-evals-and-learning.md) covers each of these.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
