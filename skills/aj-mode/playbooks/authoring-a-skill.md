### Authoring a skill

1. Exhaust the request and repository context before asking; ask only when materially different skill contracts remain unresolved. A skill is a `SKILL.md` with YAML frontmatter (`name` matching its directory plus a `description` that front-loads real trigger phrases) and a concise body written for an agent reading it cold.
2. Reuse AJ Mode vocabulary and routing.
3. Keep `SKILL.md` concise; move detail to one-level references. Ship scripts executable with their invocation shown in the body.
4. Validate frontmatter, triggers, links, scripts, and agent names.
5. Exercise one positive trigger and one near-miss route.
6. Run the pre-commit pass `project-standards` names when repository files changed. If delivery includes a PR, run **Opening a PR**.
