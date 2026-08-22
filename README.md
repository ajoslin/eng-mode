# AJ Mode for OMP

Reusable engineering playbooks, agents, orchestration, and goal management for [Oh My Pi](https://github.com/can1357/oh-my-pi).

## Install

```sh
omp plugin install github:ajoslin/omp-aj-mode
```

Restart OMP. Then open every repository where you use AJ Mode and run:

```text
setup-aj-mode
```

**Run `setup-aj-mode` in every repository.** It checks the plugin, model roles, agent chains, worktree isolation, and that repository's standards and verification contracts.

## Update

Run the install command again, restart OMP, then rerun `setup-aj-mode` in each repository.

## What belongs in each repository

AJ Mode supplies the reusable workflow. Each repository owns its local rules and real verification surface:

- `.omp/skills/project-standards/SKILL.md`
- `.omp/skills/verify-project/SKILL.md`

`project-standards` indexes repository law and tooling. `verify-project` defines how to prove the product works. `setup-aj-mode` validates both.

## Forked from pstack

AJ Mode is an OMP fork of [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack). It keeps pstack's playbook-driven approach with small OMP-specific changes: native OMP tools and agents, `goal` and `aj_orch`, and repository-local setup through `setup-aj-mode`.

The core ideas come directly from pstack's playbooks:

> - **Investigation:** “a read-only question. how does x work, why was y built this way, are we sure.”
> - **Bug fix:** “reproduce a defect, root-cause it, and fix with runtime evidence.”
> - **Feature:** “new or changed behavior, built from a named data shape.”
> - **Refactoring:** “a behavior-preserving change to structure or shape.”
> - **Performance:** “trace a measured slowness and improve it against a baseline.”

AJ Mode also carries pstack's broader rules: route work through a matching playbook, prove behavior on the real artifact, fix root causes, keep changes small, and use parallel agents without lowering the quality bar. See [pstack's full playbook list](https://github.com/cursor/plugins/blob/main/pstack/README.md#just-use-poteto-mode).

Both projects are MIT licensed. Upstream copyright and license terms are preserved in [`LICENSE`](LICENSE).

## Development

```sh
bun install --frozen-lockfile
bun test ./src
bunx tsgo -p tsconfig.json
omp plugin link "$PWD"
```

The single extension entrypoint, `src/extension.ts`, registers:

- `goal`, an essential wrapper around OMP's native same-name tool via `ctx.invokeTool`
- `aj_orch`, the repository-contract gate and durable orchestration store

Do not install a second standalone `goal` extension alongside this plugin.
