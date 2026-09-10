---
name: eng-mode-sync-skills
description: Copy the portable eng-mode skills into this repository's .agents/skills so agents without the OMP plugin read the same text. Operator-invoked only, via /eng-mode-sync-skills.
disable-model-invocation: true
---

# Sync portable skills

Run from the repository root. The script lives in the eng-mode checkout, not the plugin link.

```sh
bun --cwd "$HOME/dev/eng-mode" run sync-skills "$PWD"
```

It deletes every `.agents/skills/<name>` that shadows a non-portable eng-mode skill, copies the portable set (`src/portable-skills.ts` `portableSkillNames`) verbatim, and writes `.agents/skills/.eng-mode-sync.json` with the source commit and per-file hashes.

Then review `git status`, commit as `chore(skills): sync portable eng-mode skills @<sha>`, and open the PR through the repository's selected forge provider.

Drift check, for CI or before a release:

```sh
bun --cwd "$HOME/dev/eng-mode" run sync-skills:check "$PWD"
```

Non-zero exit lists each file that differs from eng-mode or each shadow that must be deleted.
