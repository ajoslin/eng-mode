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
- LSP, debugger, browser, and GitHub CLI surfaces for grounded code and runtime evidence;
- `omp commit` for commits; `github-stack` (`gh stack`) for native GitHub stacked PRs;
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

- `.omp/skills/project-standards/SKILL.md` — repository law and selected tooling;
- `.omp/skills/verify-project/SKILL.md` — the real product-verification surface.

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

- carries the expert-decision guidance in the Eng Mode skill itself, so routed non-trivial first turns receive it as part of the workflow;
- skips extension classification on the first prompt of every main and task/subagent session, then classifies eligible later prompts with the configured `@tiny` model;
- injects expert-decision guidance only when the classifier returns exact `expert`, displaying a compact `◆ Expert lens` marker while retaining the full guidance in model context and raw session data; classifier failures and ordinary work remain unmarked;
- suppresses later classification and reinjection until 50,000 non-cached input/output/reasoning tokens have elapsed since the last extension injection; context compaction makes the next expert-classified prompt immediately eligible;
- registers `goal`, an essential wrapper around OMP's native same-name tool via `ctx.invokeTool`;
- registers `eng_orch`, the repository-contract gate and durable orchestration store.

Do not install a second standalone `goal` extension alongside this plugin.
