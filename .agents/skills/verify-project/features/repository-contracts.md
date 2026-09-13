# Repository contract gate

## Sub-features

Observe configured, missing, malformed, and explicitly unconfigured `project-standards` and `verify-project` contracts.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. Use this checkout for the configured case. Create each failure fixture under a unique temporary directory outside the checkout.

## Driving it with OMP TUI

1. Invoke `eng_orch` with `action: contracts`, `repositoryRoot` set to this checkout, and `mode: code-producing`. Confirm `decision: "proceed"`, both contracts report `parse: "ok"`, and `forgeProvider` names the configured provider. This checkout declares no `forge-provider`, so the default `github-graphite` renders, with the reason `forge provider github-graphite selected`.
2. For missing-contract cases, use an empty fixture root. In `code-producing` mode, confirm missing `project-standards` returns `blocked-standards`. In `read-only` mode, confirm it returns `standards-unavailable-read-only`.
3. For malformed standards, create `.agents/skills/project-standards/SKILL.md` in a fresh fixture root with content that has no YAML frontmatter. Invoke `contracts` in `code-producing` mode. Confirm `project-standards` reports `parse: "malformed"` and the decision is `blocked-standards`.
4. For unconfigured standards, write only `UNCONFIGURED` to that canonical path in another fresh fixture. Confirm `parse: "unconfigured"` and `decision: "unconfigured"`.
5. To exercise `verify-project`, create a fresh fixture with a valid `.agents/skills/project-standards/SKILL.md` whose frontmatter declares `name: project-standards`. Leave `verify-project` absent. Confirm `parse: "missing"` and `decision: "inconclusive-verification"`.
6. In separate copies of the valid-standards fixture, create `.agents/skills/verify-project/SKILL.md` first with content that has no YAML frontmatter, then with only `UNCONFIGURED`. Confirm the malformed case returns `parse: "malformed"` and `decision: "inconclusive-verification"`. Confirm the sentinel returns `parse: "unconfigured"` and `decision: "unconfigured"`.
7. For the legacy fallback, create a fresh fixture with valid `project-standards` and `verify-project` skills under `.omp/skills/<name>/SKILL.md` and nothing under `.agents/skills`. Confirm `decision: "proceed"` and both `parse: "ok"`.
8. For an unknown provider, create a fresh fixture whose valid `project-standards` frontmatter declares `forge-provider: nope-provider` and a valid `verify-project`. In `code-producing` mode confirm `decision: "blocked-standards"`, `forgeProvider: null`, and the reason `project-standards selects unknown forge-provider "nope-provider"`.

## Gotchas

Never alter this checkout to create a failure case. Each call only reads its fixture. `project-standards` decides before `verify-project`: a bad standards contract reports `verify-project` as whatever it observed but never reaches the verification decisions. After capturing the structured results, delete only the temporary fixture roots and the disposable profile.
