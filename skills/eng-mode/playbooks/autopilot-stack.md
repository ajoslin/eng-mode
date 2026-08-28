### Autopilot-stack

**Build and verify one dependent PR stack for a large or complicated change whose independently understandable layers materially aid review; never land it. Ordinary coherent work stays one PR.**

1. Current OMP isolated tasks apply completed output to the parent and cannot be revived. The root owns stack topology and processes one stack branch at a time in dependency order.
2. On the checked-out clean branch, dispatch one one-shot non-isolated `implementation-agent` for implementation, non-browser proof, the project pre-commit pass, `no-comments`, and the decision trail.
3. After the writer yields, the root records the materialized head SHA and independently verifies it. Mapped browser/runtime proof runs parent-sequential through the project verification contract (`verify-project`).
4. The root runs **Opening a PR**, appends the verified PR through **github-stack** (`gh stack init` or `gh stack add`, then `gh stack submit --auto`), and runs Babysit. A rewritten head loses its verdict unless patch identity is unchanged; corrections use a fresh writer followed by re-verification.
5. Never merge or arm auto-merge. Do not start the dependent branch until its base PR is STACK-READY.
6. Requested audit watching continues under a native goal or an operator-started bounded `/loop`. The playbook checks gates and bounds because OMP only repeats the prompt. A user hold sends zero-writes through `hub`.
7. Deliver bottom-to-top PR links, current SHAs, verdicts, exclusions, and first review order. The operator lands the stack.
