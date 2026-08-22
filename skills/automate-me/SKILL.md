---
name: automate-me
description: Create or update a personal OMP mode skill from repeated working preferences in OMP history plus direct user input. Use for automate me, capture my style, or create my mode.
disable-model-invocation: true
---

# Automate Me

1. Find an existing project `.agents/skills/<handle>-mode/SKILL.md` or user `~/.agents/skills/<handle>-mode/SKILL.md`. Update by default; start fresh only when explicitly requested.
2. Mine only the active workspace's OMP `history://`. For updates, use sessions since the skill's last edit. Partition large windows among `scout` agents. Require repeated evidence before codifying a preference.
3. Ask at most two structured multi-select rounds plus one open question for preferences history cannot show.
4. Cluster only real conventions: response, autonomy, understanding, delegation, prose/code, review/proof, process, skills.
5. Draft or edit through the AJ Mode Authoring a skill playbook (`aj-mode` `playbooks/authoring-a-skill.md`). Project placement is default. Use `disable-model-invocation: true` unless the user explicitly wants always-on matching.
6. Apply `unslop`. Reference existing skills; never paste their contents. Keep sparse.
7. Show the draft and incorporate user feedback. Trigger evaluation is needed only if matching fails in practice.
8. Commit through the repository's normal PR path when requested. Never push directly to a protected branch.
