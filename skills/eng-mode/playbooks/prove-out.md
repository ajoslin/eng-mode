### Prove-out

Renamed from pstack's `eval` playbook to `prove-out`.

**Own the experiment design. Plan, blind, run, synthesize.**

Prove-outs test how a change affects agent behavior before promotion: a skill variant, structural change, or prompt change. The failure mode is observer effect. Candidates must not know they are being measured.

**Non-negotiables for blinding:**

- No `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` in any directory, file, or prompt the candidate sees.
- The candidate prompt looks like an organic user request. State the goal, not the meta. "build me a small todo cli" not "show me how you follow the principles chain".
- No chain-eliciting cues. Don't ask the candidate to list which skills, principles, or files they applied; that meta-prompt inflates citation behavior. Ask for design notes generally and grade chain-following from code shape, not self-report.
- Sanitize directory and slug names. Use project-shaped names a user might pick, not labels like `candidate-1` or `agent-a`.
- Don't tell the candidate other candidates exist.
- The judge can know it's judging but sees outputs by sanitized label only, never by model name.
- Comparing two variants: one judge scores both sets in a single pass on one scale, blind to which set each came from. Two judge runs with different prompts don't compare, the calibration drifts.

**Steps:** Read `omp-workflows` before building a matrix or staged run.

1. **Frame.** State what variant is under test and what behavior counts as success. Write the rubric (3-6 concrete criteria) for the judge only. Hold it back from candidates.
2. **Set up sanitized environments.** Per-candidate working dir with the variant in place. Plant any context an organic task would have: a project skeleton, the skills the candidate would naturally read.
3. **Author one organic prompt.** What a user would type. No leakage of what's being measured.
4. **Spawn N parallel candidates** through the **arena** skill's candidate-dispatch step 3, using writable agents and sanitized per-candidate working directories. Use different actual resolved models when the available writer agents provide them; otherwise report model diversity unavailable and preserve constraint/lens diversity. Same prompt to each.
5. **Spawn one blinded judge** through the **arena** skill's judge-dispatch step 4. After dispatch, verify that the judge's resolved model family differs from every candidate's resolved model family. If routing cannot provide that separation, continue only after recording `judge-family separation unavailable` in the evidence and final report. Judge sees outputs by sanitized label and the rubric, never a model name.
6. **Verify the chain from transcripts, not self-report.** Read the specific candidate transcript URI returned by OMP (`agent://<id>` or `history://<id>`). Never treat `history://` as a filesystem directory or scan unrelated sessions. Check which files each candidate actually opened. Citing a principle is not reading its leaf skill, and reading it is not applying it. Grade chain-following from the files it really read plus the shape of the code, never from the candidate's claims.
7. **Read every candidate output yourself** end to end. Compare to the judge's verdict. Disagreement means a model is biased or the rubric is ambiguous. Synthesize.

**Reply:** variant under test, rubric, per-candidate notes, judge's verdict, your synthesis, and a recommendation for whether to promote the variant.
