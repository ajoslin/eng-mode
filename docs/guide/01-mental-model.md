# Mental model

Eng Mode separates outcome, execution, policy, and proof.

```mermaid
flowchart TD
  U[Outcome and finish condition] --> R[Router]
  R --> P[One primary playbook]
  P --> G[goal: durable outcome]
  P --> T[todo: finite steps]
  P --> D[task, eval, and tools]
  D --> C[Code or artifacts]
  S[Repository standards] --> C
  V[Repository verification] --> E[Observed evidence]
  C --> E
```

`goal` retains the falsifiable result across turns. `todo` shows finite current execution; finishing an item does not finish the goal.

A playbook owns an end-to-end route such as investigation, bug fix, feature, refactoring, performance, or delivery. A skill is a focused method inside it. State the problem; name a method only to override routing.

Eng chooses execution. The repository decides validity and proof through standing context, `project-standards`, `verify-project`, rules, domain vocabulary, and ADRs.

A normal `task` agent stays addressable through `hub`. An eval agent is one-shot; use it only with a complete brief and schema.

Complete means behavior exists, callers and docs agree, obsolete paths are gone, and proof matches the changed surface.