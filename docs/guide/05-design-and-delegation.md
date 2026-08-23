# Design, delegation, and OMP workflows

Parallelism earns its cost only for independent slices, competing attempts, or explicit stage barriers.

| Mechanism | Shape | Use |
|---|---|---|
| `architect` | Competing seam designs | Caller API, ownership, module boundary |
| `arena` | Same brief, scored candidates | Design or implementation bakeoff |
| `swarm` | Distinct slices or race arms | Coverage and bounded races |
| `interrogate` | Same review rubric | Adversarial review |
| `task` + `hub` | Addressable workers | Steering, follow-up, revival |
| Eval `parallel()` | One-shot independent callables | Deterministic fan-out |
| Eval `pipeline()` | Barriered one-shot stages | Map/reduce and staged synthesis |
| `completion()` | Stateless tool-free prompt | Classification or bounded reduction |

Use normal tasks when work needs follow-up. Use eval agents only when the complete brief and schema are known before launch. Read `omp-workflows` for executable matrices, failure isolation, artifacts, and budgets.

Before fan-out, fix ownership, shared interfaces, output schema, and integration policy. Concurrent writers need disjoint paths or verified isolation. Subagents skip shared validation; the lead integrates and verifies once.

Do not use arena for coverage, swarm for competing designs, hub with disposed eval children, or delegation for top-level product judgment.