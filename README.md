# Eng Mode for OMP

**Eng Mode is the [Oh My Pi](https://github.com/can1357/oh-my-pi) port of [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack).** It keeps pstack's playbook-driven engineering system and adapts it to OMP with a small set of runtime and repository-integration changes.

Eng Mode exists to:

- route nontrivial work through pstack-derived investigation, bug-fix, feature, refactoring, performance, review, and delivery playbooks;
- favor small changes, root-cause fixes, and proof against the real artifact;
- assign implementation, judgment, and adversarial review to model-specific agents;
- keep reusable workflow global while each repository owns its standards and product-verification contract.

## OMP-native by design

Eng Mode uses OMP's built-in tools instead of recreating their behavior:

- `todo` for the active finite work list;
- `task` and `hub` for typed agents, parallel work, and coordination;
- LSP, debugger, browser, and repository-selected forge surfaces for grounded code and runtime evidence;
- plain `git commit` for commits and one repository-selected provider skill for all forge and PR work;
- OMP's native `goal` runtime, wrapped with a minimum token budget of 1,000,000;
- plugin discovery for skills and agents, plus `eng_orch` for repository contracts and durable orchestration state.

It does not try to make OMP behave like Cursor. The playbooks stay; the runtime mechanics are native OMP.

## Operator guide

Start with the [Eng Mode operator guide](docs/guide/README.md). It explains the runtime mental model, setup gates, routing, delegation, verification, context management, blinded evals, and repository adoption for complex monorepos.

## Install

```sh
omp plugin install github:ajoslin/eng-mode
```

Restart OMP. Then open every repository where you use Eng Mode and run:

```text
setup-eng-mode
```

**Run `setup-eng-mode` in every repository.** It checks the plugin, model roles, agent chains, worktree isolation, and that repository's standards and verification contracts.

To update, run the install command again, restart OMP, and rerun `setup-eng-mode` in each repository.

## What belongs in each repository

Eng Mode supplies the reusable workflow. Each repository owns:

- `.omp/skills/project-standards/SKILL.md` — repository law and selected tooling; optional `forge-provider` frontmatter selects `github-graphite` or `pr-cockpit`, defaulting to `github-graphite` when absent;
- `.omp/skills/verify-project/SKILL.md` — the real product-verification surface.

`eng_orch contracts` returns that selection as `forgeProvider`. Read that skill once and use only its documented interface for every forge and PR operation. If the skill does not document an operation, stop; never fall back to another provider.

`setup-eng-mode` validates both contracts.

## From pstack

The core playbook ideas are pstack's:

> - **Investigation:** “a read-only question. how does x work, why was y built this way, are we sure.”
> - **Bug fix:** “reproduce a defect, root-cause it, and fix with runtime evidence.”
> - **Feature:** “new or changed behavior, built from a named data shape.”
> - **Refactoring:** “a behavior-preserving change to structure or shape.”
> - **Performance:** “trace a measured slowness and improve it against a baseline.”

See [pstack's full playbook list](https://github.com/cursor/plugins/blob/main/pstack/README.md#just-use-poteto-mode). Upstream copyright and MIT license terms are preserved in [`LICENSE`](LICENSE).

## Development

```sh
bun install --frozen-lockfile
bun test ./src
bunx tsgo -p tsconfig.json
omp plugin link "$PWD"
```

The single extension entrypoint, `src/extension.ts`:

- classifies every main and task/subagent prompt, including the first, with the configured high-threshold `@tiny` evaluator and injects exact expert-decision guidance only on exact `expert`;
- suppresses evaluator calls and extension injection whenever the current user prompt already contains the exact guidance;
- after context compaction, scans the actual retained context and summary; when the exact guidance is absent from the newest 150,000 tokens, steers a compact continuation plus the guidance into the current task;
- registers `goal`, an essential wrapper around OMP's native same-name tool via `ctx.invokeTool`;
- registers `eng_orch`, the repository-contract gate and durable orchestration store.

Do not install a second standalone `goal` extension alongside this plugin.
