### Shipping

**Shipping alone lands, and only with explicit merge authority.** Babysit establishes merge-readiness but never merges or arms merge-when-ready.

1. Use `eng-github` for every GitHub operation. Start with `eng-github snapshot REF...` for PR heads, bases, checks, threads, merge state, and stack membership. Use `eng-github stack view REF` for stack topology. Name one owner for each stack and freeze the ordered PR references and head SHAs before verification. Stop if `eng-github` does not document a needed operation. Use `eng-github api` or `eng-github graphql` for an undocumented operation; never fall back to raw `gh`, `curl`, or another tool.
2. For every meaningful-risk PR, commission three independently produced, authorship-independent lanes against the same head SHA and base: **repository gates** from `project-standards`, **live real-surface proof** through `verify-project` or the other mapped actual surface, and **receipts-plus-diff audit**, which inspects the base-to-head diff and the other lanes' durable evidence. Each lane returns `PASS`, `PASS+NOTES`, or `FAIL` pinned to that SHA. A command-only change may instead use the producer's exact command receipt plus an independent coordinator spot-check. Record that exception rather than creating ceremonial agents.
3. `VERIFIED(<sha>)` requires every verification lane to pass (`PASS` or `PASS+NOTES`) on the final HEAD. After all comments are addressed and CI and the review-agent loop finish, re-run every lane at that SHA and post the aggregate, producers, and fresh evidence through `eng-github gate evidence REF --head SHA --verdict pass --producer NAME --surface ui|non-ui --body-file FILE`. UI changes require fresh screenshots or video. Spawn a fresh independent `reviewer` agent, never the author/lead session or a resumed agent, with the PR ref, HEAD SHA, evidence comment id, and `eng-github diff REF`; it reviews evidence plus diff and records its verdict through `eng-github gate signoff`. Then `eng-github gate check REF --head SHA` must pass before `auto-merge enable`, `merge`, or `stack merge`. Any FAIL, block, missing evidence, or new push returns to fixing and repeats this final gate; no carried verdict substitutes for it. See `eng-github`'s Pre-merge gate section for command details.
4. `STACK-READY(<sha>)` means that exact SHA is `VERIFIED`, Babysit reports it merge-ready with its review-agent loop complete, the SHA-pinned verdict is posted on its PR, and the named stack owner has safely appended it with `eng-github stack add --stack N BRANCH...`. The **ceiling** is the highest PR in the uninterrupted bottom-to-top run of `STACK-READY` heads. Stop at the first gap. A verified PR above an unverified one waits, because it cannot land without the code below it. One whose branch neither holds nor needs that code can move onto trunk as its own unstacked PR and land alone, but it needs a fresh verdict first, because its old one ran with that code beneath it. Extending or moving the ceiling requires a new verification pass against the candidate's current SHA and base, not reuse of an earlier ceiling decision.
5. Run `eng-github snapshot REF...` immediately before arming. A changed head, base, topology, checks, approvals, merge state, or review-agent state invalidates the affected readiness and requires the corresponding new pass. A PR remains blocked while Babysit's review-agent loop is unfinished or parked `review-agent-unavailable`. Green CI alone is not that loop.
6. Land only the frozen contiguous run through `eng-github`. For an unstacked PR, use `eng-github auto-merge REF enable --head SHA [--method squash|merge|rebase]`, then confirm with `eng-github snapshot REF` that `autoMerge` is non-null at the same `headSha`. If you need to disarm, use `eng-github auto-merge REF disable` and confirm the snapshot shows `autoMerge` is null. For a stacked PR, do not use `eng-github auto-merge`. The named stack owner runs `eng-github stack merge --stack N --target PR --heads PR=SHA,... [--method squash]` with every open layer's pinned head, after confirming the frozen queue and readiness. Record the command's final status. If it prints `enqueued`, keep watching until `merged`.
7. The drain begins when the first merge or auto-merge request is confirmed. It ends when the frozen run lands or Shipping stops at a blocker. During the drain, do not sync, restack, submit a stack, force-push, change parentage, append to the queue, or make another topology change. Re-parent independent new work onto trunk, not the draining chain. Diagnose a stall with `eng-github snapshot` before mutating anything. If a mutation becomes necessary, stop the drain, disarm with `eng-github auto-merge REF disable` when armed, void affected readiness, freeze a new snapshot, and verify again.
8. Watch the frozen queue one event at a time. For each event, start one async `eng-github watch` with all frozen PR references, wait for it to finish, read the printed JSON event, and use a fresh snapshot to classify the event as `WAITING`, `READY`, `ADVANCE`, or `COMPLETE` under the queue rules in `eng-github`. Rearm after handling the event unless the result is `COMPLETE` or a blocker. Use this tool sequence:

   1. Call `bash` to start the watcher:

      ```json
      {"command":"eng-github watch REF... --until any","async":true,"timeout":0}
      ```

   2. Call `wait` for its completion:

      ```json
      {}
      ```

   3. Call `bash` to snapshot the frozen PR references:

      ```json
      {"command":"eng-github snapshot REF..."}
      ```

   If an `eng-github` command exits 75, record the printed reset time and wait until then. Never retry that command sooner or poll quota. Do not run `snapshot`, `ci`, or `sleep` loops while a watch is armed. After `eng-github watch` exits, classify its event and take one fresh snapshot before rearming. Unknown or dropped events stop the drain. Prefer this blocking wait. If repeated turns are intrinsic, keep the landing outcome in `goal` and invoke `loop` with a bounded prompt. Stop the loop at `COMPLETE` or a blocker.
9. Report `eng-github`, the frozen queue and its stack owner, each arm confirmation and its producer, verification producers, SHA-pinned lane verdicts and posted aggregate, the ceiling and each pass used to establish or extend it, watcher events and rearms, landed PRs, review-agent quiet SHA or `review-agent-unavailable`, drain start and end and any interference, and the first gap or `COMPLETE`.
