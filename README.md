# OMP AJ Mode

AJ Mode is a global engineering workflow plugin for [Oh My Pi](https://github.com/can1357/oh-my-pi). It supplies reusable playbooks, principle skills, task agents, durable orchestration, and OMP's native `goal` tool wrapper. Repositories keep their own standards and product-verification contracts under `.omp/skills/`.

## Install

Install a pinned revision:

```sh
omp plugin install 'github:ajoslin/omp-aj-mode#<commit>'
```

Restart OMP after installation. Then run the `setup-aj-mode` skill to validate model roles, agent chains, plugin provenance, worktree isolation, and repository contracts.

## Update

OMP updates Git plugins by reinstalling a newer revision:

```sh
omp plugin install 'github:ajoslin/omp-aj-mode#<new-commit>'
```

## Repository contracts

Code-producing AJ Mode work expects the target repository to own:

- `.omp/skills/project-standards/SKILL.md`
- `.omp/skills/verify-project/SKILL.md`

`project-standards` indexes repository law and selected tooling. `verify-project` defines the real product verification surface. AJ Mode validates these files through `aj_orch contracts`; installation-time provider provenance remains the responsibility of `setup-aj-mode`.

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
