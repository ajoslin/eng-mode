# Repository contract gate

## Sub-features

Observe configured, missing, malformed, and explicitly unconfigured `project-standards` and `verify-project` contracts.

## How to get to it (user POV)

Launch OMP with the local Eng Mode extension. Use this checkout for the configured case. Create each failure fixture under a unique temporary directory outside the checkout.

## Driving it with OMP TUI

1. Invoke `eng_orch` with `action: contracts`, `repositoryRoot` set to this checkout, and `mode: code-producing`. Confirm `decision: "proceed"`, both contracts report `parse: "ok"`, and `forgeProvider` is `"github"`. This checkout declares no `forge-provider` in `project-standards`, so that value is the default applied to any valid standards contract, not declared metadata.
2. For missing-contract cases, use an empty fixture root. In `code-producing` mode, confirm missing `project-standards` returns `blocked-standards`. In `read-only` mode, confirm it returns `standards-unavailable-read-only`.
3. For malformed standards, create `.agents/skills/project-standards/SKILL.md` in a fresh fixture root with content that has no YAML frontmatter. Invoke `contracts` in `code-producing` mode. Confirm `project-standards` reports `parse: "malformed"` and the decision is `blocked-standards`.
4. For unconfigured standards, write only `UNCONFIGURED` to that canonical path in another fresh fixture. Confirm `parse: "unconfigured"` and `decision: "unconfigured"`.
5. To exercise `verify-project`, create a fresh fixture with a valid `.agents/skills/project-standards/SKILL.md` whose frontmatter declares `name: project-standards`. Leave `verify-project` absent. Confirm `parse: "missing"` and `decision: "inconclusive-verification"`.
6. In separate copies of the valid-standards fixture, create `.agents/skills/verify-project/SKILL.md` first with content that has no YAML frontmatter, then with only `UNCONFIGURED`. Confirm the malformed case returns `parse: "malformed"` and `decision: "inconclusive-verification"`. Confirm the sentinel returns `parse: "unconfigured"` and `decision: "unconfigured"`.
7. For forge-provider selection, create two more fresh fixtures. In the first, the valid standards frontmatter adds `forge-provider: pr-cockpit`, and a valid `verify-project` (`name: verify-project`) is present. Confirm `decision: "proceed"` and `forgeProvider: "pr-cockpit"`. In the second, standards declares an unsupported provider such as `forge-provider: gitlab`. Confirm `decision: "blocked-standards"` with `project-standards` still `parse: "ok"` and no `forgeProvider`. An unknown provider never falls back to `github`.

## Gotchas

Never alter this checkout to create a failure case. Each call only reads its fixture. After capturing the structured results, delete only the temporary fixture roots and the disposable profile.

Two parse states have no fixture in this recipe: `unreadable` (the file exists but cannot be read) and `wrong-name` (valid frontmatter whose `name` is not the contract name). Either state on `project-standards` decides `blocked-standards` in both modes; on `verify-project` it decides `inconclusive-verification`. When the canonical `.agents/skills/<name>/SKILL.md` is absent, the observer falls back to `.omp/skills/<name>/SKILL.md`; a result whose `expectedPath` is under `.omp/skills` came from that fallback. The fallback runs only when the canonical read fails with `ENOENT`; any other canonical read failure reports `unreadable` without trying `.omp/skills`. Both files absent reports the canonical path with `parse: "missing"`.
