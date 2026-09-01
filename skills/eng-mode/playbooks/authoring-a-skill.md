### Authoring or modifying a skill

Use the `create-skill` skill for both new skills and changes to existing skills. Read the current skill and its referenced files before modifying it.

**Own the agent-facing voice.** Every sentence can become an instruction. Delete first: prose earns its place only when it changes a decision. Write direct imperatives; explain a rule only when it would otherwise be ambiguous. Match the voice to the skill's scope.

1. Establish the skill's single job, scope, trigger examples, near misses, and co-located files. Reuse Eng Mode vocabulary and route to other skills by path instead of copying their policy.
2. Keep `SKILL.md` concise and progressively disclosed. Move substantial detail into one-level references. Link to structural sources such as types, configuration, and canonical READMEs instead of restating details that can drift. Show every shipped script's invocation in the body.
3. Apply `principle-encode-lessons-in-structure`: when a repeated instruction can become a type, metadata field, lint, check, helper, or script, encode it there and delete the prose. When a recurring workflow is not captured, propose a new skill.
4. Run and record these predicates:
   - the YAML frontmatter contains non-empty `name` and `description` keys;
   - `name` exactly matches the containing skill directory;
   - `description` names concrete situations or request phrases that should trigger the skill, rather than only describing its implementation;
   - every referenced relative file exists from the skill directory, and every cross-skill link resolves to an installed or repository skill;
   - every shipped script has its executable bit set and its documented invocation succeeds;
   - every named agent appears in the actual registered agent inventory, such as `omp agents`, rather than an assumed provider inventory.
5. If the skill defines structural behavior—scripts, schemas, parsers, generated artifacts, or deterministic routing—add and run tests that fail when that behavior breaks. If the change is subjective prose or judgment guidance, explicitly record `skip: brittle prose tests do not defend a structural contract` instead of asserting on wording.
6. As a supplemental routing check, exercise one positive trigger and one near miss in fresh skill-selection contexts. This probe tunes `description`; it never substitutes for the predicates or structural tests above.
7. Run the pre-commit pass `project-standards` names when repository files changed. If delivery includes a PR, run **Opening a PR**.

**Reply:** summarize the skill or modification, list the key design decisions, and report validation notes with each predicate, structural test or explicit skip, and supplemental routing probe outcome.
