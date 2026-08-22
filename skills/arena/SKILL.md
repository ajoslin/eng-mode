---
name: arena
description: Build multiple isolated candidate artifacts, judge them against one rubric, choose a base, graft the strongest ideas, and verify the synthesis. Use for /arena or design bakeoffs.
disable-model-invocation: true
---

# Arena

1. Frame the artifact and 3-6 gradeable criteria.
2. Require at least two structurally distinct directions. Record whether diversity is model, constraint, or lens diversity.
3. Pick a writable agent type for candidates. Each candidate writes only to a distinct `local://` scratch artifact; competing candidates never use `isolated: true` because OMP applies isolated output to the parent tree. Dispatch all candidates in one `task` batch. Require rationale and rejected alternatives. Read-only panel agents cannot be candidates.
4. After completion, dispatch one blinded `reviewer` or named read-only project review agent. Agent definitions own model routing; never pass a prompt-level model slug.
5. The lead reads and scores every candidate. Resolve disagreement with the judge explicitly.
6. Pick the most maintainable base. Prefer smaller interface and reader load on ties.
7. Graft only coherent ideas. Record base, grafts, rejections, and dropouts.
8. Verify the synthesis on the real surface.

Call it multi-model only when resolved model families were actually distinct.
