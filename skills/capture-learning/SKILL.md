---
name: capture-learning
description: Capture an observed Eng Mode failure, correction, or reusable engineering lesson as a deduplicated Linear candidate-learning ticket. Use when a session exposes a durable pattern worth later triage, or when Reflect routes an item to the learning backlog.
disable-model-invocation: true
---
# Capture Learning

Create evidence-bearing candidates, never automatic policy. This skill expects the repository-provided `linear_graphql` tool.

## Configuration

Resolve in order: explicit request values; repository contract values named `ENG_AUTOLEARN_TEAM_ID`, `ENG_AUTOLEARN_TEAM_KEY`, `ENG_AUTOLEARN_PROJECT_ID`, or `ENG_AUTOLEARN_PROJECT_NAME`; then team references already present in the repository. Project name defaults to `eng-autolearn`.

Do not embed organization-specific IDs. If no team resolves, report the missing configuration; do not guess.

## Find or create the project

1. Query teams and projects. Match team by exact ID, then exact key. Match project by exact ID, then case-insensitive exact name within that team.
2. One project: use its returned ID. Several: stop on ambiguity.
3. None: introspect `ProjectCreateInput` before mutation. Create with resolved team ID, project name, and a description within the current schema limit.
4. Query the returned project by ID. Accept creation only when name and team match; mutation success alone is insufficient.

Every run searches before creation, making the path idempotent.

## Dedupe and capture

Build a stable fingerprint from normalized failure category, affected surface, and expected behavior. Search open and closed issues in the target project for the fingerprint and close title matches.

- Existing match: append only new evidence or recurrence information.
- No match: create one issue with `teamId`, `projectId`, and the fields below. Re-query it by returned ID.

```text
Title: [Eng learning] <short observable failure>
Fingerprint: <stable normalized key>
Observed: <what happened>
Expected: <what should have happened>
Provenance: <session/history/artifact/PR paths>
Affected paths or workflow: <scope>
Recurrence: <first occurrence or prior examples>
Counterexamples: <where the proposed lesson should not apply>
Likely enforcement: <lint | architecture check | repository rule | skill | domain model>
Promotion gate: replay fixtures, false-positive and false-negative assessment, measured benefit, reviewed PR
```

Never include secrets, credentials, private user data, or transcript dumps. A ticket is a candidate, not authority to edit enforcement or vocabulary.

## Output

Project ID and URL; created, updated, or deduplicated; issue ID and URL; fingerprint; omitted sensitive evidence; unresolved configuration or ambiguity.