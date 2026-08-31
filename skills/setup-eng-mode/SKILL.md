---
name: setup-eng-mode
description: Validate and orchestrate an Eng Mode installation. Use for /setup-eng-mode, checking the Eng extension link, migrating model roles, auditing skill or agent shadows, or validating project contracts.
---

# Setup Eng Mode

Setup is a validator and orchestrator, never an installer of duplicate machinery. It configures OMP, never Cursor. It does not install forge providers. Re-running setup is idempotent.

## 1. Installation and source identity

1. Report the extension's own load state: whether this session runs from a fresh `omp -e <path>` process-local load or a persistent plugin link, and whether the `omp-plugins` provider is enabled.
2. Pin the exact expected absolute extension root. Provenance passes only when every shipped skill and agent resolves from that exact root, not merely from any Eng package.
3. Verify tool discovery: the `eng_orch` tool is callable and one live `init` against a throwaway store succeeds.

## 2. Shadows and collisions

Observed skill precedence: native project/user `.omp/skills` (project before user), then the Eng extension through `omp-plugins`, then Claude-provider skills, then `.agents/skills`. Observed agent precedence: project `.omp/agents`, user agents, extension agents, then bundled.

1. Report the full intersection of the extension's exact `skillNames` with the host repository's `.agents/skills` and `.claude/skills` in both directions. Extension-wins overrides are intentional but require operator visibility; never replace silently.
2. Any user-native `.omp/skills` or user-agent shadow of an exact `skillNames`/`agentNames` entry is an error. Report it by name; quarantining a shadow is an explicit operator-approved setup action with a rollback record, never a silent move.
3. Repository duplicates matching the extension manifests are deleted at the repository's hard cut, not by setup.

## 3. Model roles

Role migration is two-stage and owned by the extension's config migrator. Setup runs it; it never hand-edits roles.

1. **Prepare:** atomically add and validate all new roles while retaining all old roles: `code` from `boja_code` when absent, `judgment` from `boja_judgment`, `adversary` from `boja_adversary`, `fast` from `boja_fast`; `panel_opus`, `panel_sol`, `panel_fable`, `panel_grok` from the workstation's current pinned panel selectors. An existing valid new value wins. A differing old/new pair is a conflict and produces no change without explicit user selection. On a workstation with no old roles, absent panel roles require explicit selection from actually available models; never invent a concrete model.
2. **Retire:** only after hard-cut proof shows no old workflow consumer remains, atomically delete `boja_fast`, `boja_code`, `boja_judgment`, and `boja_adversary`.
3. Both stages capture the prior config and restore it byte-for-byte on failure. `smol`, `review`, `commit`, and all unrelated settings are preserved.
4. Do not create a second config file. OMP owns model config in the active agent directory's `config.yml`; project behavior lives in the repository's `.omp` directory and the extension.

## 4. Agents and panel resolution

1. Verify each shipped agent (`implementation-agent`, `judgment-agent`, `comment-sicko`, `panel-opus`, `panel-sol`, `panel-fable`, `panel-grok`) is discoverable and that its role chain resolves end to end. No shipped agent may contain a concrete provider-qualified selector; the workstation config supplies concrete models.
2. Resolve every chain through all referenced role keys, flag entries that resolve identically to an earlier entry, and require at least one fallback after the primary to use a different provider where the workstation allows it. `comment-sicko` must retain a resolvable fallback.
3. Report each panel seat's actual `resolvedModel` and fallback status. Never claim full-roster or cross-vendor diversity from nominal seat names; report actual resolved models and refuse to claim diversity the resolution does not show.

## 5. Project contracts

1. Run `eng_orch contracts` and report the structured decision, per-contract source paths, and returned `forgeProvider` skill name.
2. Validate existing `project-standards` and `verify-project` contracts; never overwrite them. Unknown `forge-provider` values are blocking errors. Missing selection deliberately resolves to `github-graphite` for existing repositories.
3. After explicit repository inspection, setup may create only an `UNCONFIGURED` sentinel (`SKILL.md` whose body is the single line `UNCONFIGURED`) for an absent contract, so the gap is explicit tool output rather than silence. It never infers a verification contract from package scripts; real contract authoring routes through `create-verification-skill` and the repository owners.

## 6. Watchdog advisor

Run `bun src/eng-advisor.ts <plugin-root>` and report each installed file and status.

## 7. Runtime validation

OMP does not discover WATCHDOG files from plugin roots. From the exact extension root, run `bun src/eng-advisor.ts`; it installs the shipped `WATCHDOG.md` and `WATCHDOG.yml` into the active agent directory. Re-running is idempotent and refreshes stale copies. Do not create or edit `config.yml`; OMP owns advisor enablement and model selection.

## 7. Capabilities

1. Verify `loop` is available without starting it and `goal` remains available. Reject duplicate tools.
2. Validate that task worktree isolation is supported by current OMP configuration before any playbook depends on it.
3. Dry-route one feature, one bug, and one contested design without editing product code, exercising discovery for every shipped agent.
4. Observe `git commit --help`. Read only the `forgeProvider` skill returned by `eng_orch contracts` and validate its documented prerequisites. Do not inspect, invoke, or require another provider.

## 8. Report

Report installation state, provider enablement, exact source root, shadow inventory in both directions, role migration stage results with conflicts and fallbacks, advisor install paths and per-file status, per-agent resolved models, contract decisions with source paths, isolation, `goal`, `loop`, commit capability, the selected forge provider's documented prerequisite results, and every unavailable capability. Refuse to report a capability as present without observing it.
