# Eng Mode for OMP

**Eng Mode is the [Oh My Pi](https://github.com/can1357/oh-my-pi) port of [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack).** It keeps pstack's playbook-driven engineering system and adapts it to OMP with a small set of runtime and repository-integration changes.

Eng Mode exists to:

- route nontrivial work through pstack-derived investigation, bug-fix, feature, refactoring, performance, review, and delivery playbooks;
- favor small changes, root-cause fixes, and proof against the real artifact;
- assign implementation, judgment, and adversarial review to model-specific agents;
- keep reusable workflow global while each repository owns its standards and product-verification contract.

## OMP-native by design

Eng Mode uses OMP primitives directly:

- `todo` for the active finite work list;
- `task` and `hub` for typed agents, parallel work, and coordination;
- LSP, debugger, and browser tools for grounded code and runtime evidence;
- plain `git commit` for commits and `eng-github` for GitHub and PR operations;
- `goal` for durable objectives;
- `loop` for bounded repetition;
- plugin discovery for skills and agents, plus `eng_orch` for repository contracts and durable orchestration state.

## Operator guide

Start with the [Eng Mode operator guide](docs/guide/README.md). It explains the runtime mental model, setup gates, routing, delegation, verification, context management, blinded evals, and repository adoption for complex monorepos.

The session receiving `/eng-mode` runs the playbook and owns the todo list and agent spawns.

| Skill | Use |
|---|---|
| [`/ketchup`](skills/ketchup/SKILL.md) | Catch up on what changed in this chat since your last message, in a few plain sentences and small visuals. Give each action item just enough context to make the call. |
| [`/in-your-own-words`](skills/in-your-own-words/SKILL.md) | Check that the agent understood your goals and the problem before it starts. |
| [`/sharpen`](skills/sharpen/SKILL.md) | Sharpen a task's expert approach, goal, and specification before starting. Typed-only; complements the automatic expert lens's per-decision guidance in `src/expert-lens.ts`. |

Invoke every shipped skill as bare `/<name>`. Eng Mode expands it; OMP itself only knows `/skill:<name>`. `/no-comments` takes a path set or `.` for a repo sweep and a refactor-vs-delete plan.

## Install

```sh
omp plugin install github:ajoslin/eng-mode
```

Restart OMP. Then open every repository where you use Eng Mode and run:

```text
setup-eng-mode
```

**Run `setup-eng-mode` in every repository.** It checks plugin provenance, model roles, agent chains, worktree isolation, repository standards, and verification contracts. It runs `bun --version` and `eng-github whoami` to validate Bun and GitHub token access. When `TYPESAFE_API_KEY` is available, setup installs and enables the companion [`compact-adviser`](https://github.com/kunchenguid/compact-adviser) plugin in `auto` mode. Without a key, it leaves the plugin disabled. Run `bun run compact-adviser` from this checkout to apply the same gate.

To update, run the install command again, restart OMP, and rerun `setup-eng-mode` in each repository.

## What belongs in each repository

Eng Mode supplies the reusable workflow. Each repository owns:

- `.agents/skills/project-standards/SKILL.md`: repository law and commands.
- `.agents/skills/verify-project/SKILL.md`: the real product-verification surface.

Legacy repositories may keep these contracts under `.omp/skills`; new and migrated repositories use `.agents/skills`.

For GitHub and PR operations, use the shipped [`eng-github`](skills/eng-github/SKILL.md) skill and its documented `eng-github` commands.

## From pstack

The core playbook ideas are pstack's:

> - **Investigation:** “a read-only question. how does x work, why was y built this way, are we sure.”
> - **Bug fix:** “reproduce a defect, root-cause it, and fix with runtime evidence.”
> - **Feature:** “new or changed behavior, built from a named data shape.”
> - **Refactoring:** “a behavior-preserving change to structure or shape.”
> - **Performance:** “trace a measured slowness and improve it against a baseline.”

This tree ships **24 playbooks** (pstack's 23 plus Eng Mode's Pre-PR gates) and **24 principle skills**, including `principle-attack-the-premise` and `principle-test-behavior-not-implementation`. `/eng-mode` reads a principle leaf only when it governs a decision. Each leaf is also invocable as `/principle-<name>`. See [pstack's full playbook list](https://github.com/cursor/plugins/blob/main/pstack/README.md#just-use-poteto-mode). Upstream copyright and MIT license terms are preserved in [`LICENSE`](LICENSE).

Synced with pstack 0.15.24 ([cursor/plugins `1e5c90a`](https://github.com/cursor/plugins/tree/1e5c90a/pstack)). This sync adds `/in-your-own-words` and `/sharpen`, rewrites `/ketchup`, and adds per-spawn effort matching. Earlier syncs added `/eng-help`, `/correct`, `/benchmark-checklist`, and `principle-explain-the-number`.

Effort matching now applies to every spawn through optional `task` `effort`. See the Design and delegation section of `skills/eng-mode/SKILL.md`. Agent definitions still own model routing.

## Development

```sh
bun install --frozen-lockfile
bun test ./src
bunx tsgo -p tsconfig.json
omp plugin link "$PWD"
```

The thin extension entrypoint, `src/extension.ts`, registers independent modules:

- `auto-mode.ts` classifies main and task/subagent prompts with the configured high-threshold `@tiny` evaluator;
- `expert-lens.ts` renders expert-decision guidance and restores it after context compaction;
- `goal-tool.ts` registers `goal`;
- `loop-tool.ts` registers `loop`;
- `eng-orchestrator.ts` registers the repository-contract gate and durable orchestration store;

Do not install duplicate `goal` or `loop` tools alongside this plugin.
