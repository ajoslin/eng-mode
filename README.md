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
- LSP, debugger, browser, and repository-selected forge surfaces for grounded code and runtime evidence;
- plain `git commit` for commits and one repository-selected provider skill for all forge and PR work;
- `goal` for durable objectives;
- `loop` for bounded repetition;
- plugin discovery for skills and agents, plus `eng_orch` for repository contracts and durable orchestration state.

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

**Run `setup-eng-mode` in every repository.** It checks the plugin, model roles, agent chains, worktree isolation, that repository's standards and verification contracts, and the extension-owned Eng-Advisor runtime. Eng Mode ships short role lenses in `.eng-advisor/{role}.md`; repositories may add files at the same path to layer local review guidance after those defaults.

Keep advisor role files focused on review intent, characteristic failure modes, and authority limits. Do not copy principle bodies or skill routing maps into them; the primary agent's Eng Mode workflow owns those instructions.

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

The thin extension entrypoint, `src/extension.ts`, registers independent modules:

- `auto-mode.ts` classifies main and task/subagent prompts with the configured high-threshold `@tiny` evaluator;
- `expert-lens.ts` renders expert-decision guidance and restores it after context compaction;
- `goal-tool.ts` registers `goal`;
- `loop-tool.ts` registers `loop`;
- `eng-orchestrator.ts` registers the repository-contract gate and durable orchestration store;
- `advisor/` registers the in-process Eng-Advisor runtime, selects `.eng-advisor/{role}.md` from authoritative subagent session metadata, layers package defaults plus ancestor-to-workspace repository guidance, and owns transcript filtering, evidence policy, durable findings, and `/eng-advisor` controls;

Do not install duplicate `goal` or `loop` tools alongside this plugin.
