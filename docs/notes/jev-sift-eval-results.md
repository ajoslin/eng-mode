# Jev Sift evaluation

Mode: live.

Live scores from Jev's jev-latest model. This small hand-labeled corpus is exploratory, not a benchmark.

Four fixed task queries each have six hand-labeled repository files, including adjacent negatives. Labels are task-specific judgments, not exhaustive relevance annotations. Review them before drawing conclusions.

Retain an item when probability >= threshold. Precision is TP/(TP+FP); recall is TP/(TP+misses); false-positive rate is FP/negatives; miss rate is misses/positives. Undefined ratios are n/a.

Token estimates use ceil(file characters/4). Saved tokens count downstream file content omitted, including missed relevant files. Cost of miss is the estimated tokens of missed relevant content. Classifier-output overhead is estimated at 20 tokens per classified item, retained or omitted. Net estimated tokens saved subtracts that overhead from saved tokens. This estimate excludes classifier input, prompts, and MCP overhead; it is not total token or monetary cost savings.

Provider input tokens for corpus: 24277. MCP smoke usage is excluded.

Total evaluation wall-clock milliseconds: 2932.1. Includes corpus loading, live credential loading and MCP smoke when applicable, and all classifications; excludes report rendering and output.

MCP smoke: Passed initialize, tools/list, classify_status, and one live classify call.

## Aggregate metrics

Micro-aggregate over 24 query/file decisions, not an average of query percentages. A file used in different queries counts once per query, including its token estimate.

| Threshold | Precision | Recall | FP | FP rate | Misses | Miss rate | Cost of miss (tokens) | Retained/baseline tokens | Saved tokens | Classifier-output overhead (tokens) | Net estimated tokens saved | Savings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 56.3% | 100.0% | 7 | 46.7% | 0 | 0.0% | 0 | 14169/17908 | 3739 | 480 | 3259 | 20.9% |
| 0.5 | 81.8% | 100.0% | 2 | 13.3% | 0 | 0.0% | 0 | 11596/17908 | 6312 | 480 | 5832 | 35.2% |
| 0.7 | 80.0% | 88.9% | 2 | 13.3% | 1 | 11.1% | 1072 | 10524/17908 | 7384 | 480 | 6904 | 41.2% |
| 0.9 | 100.0% | 66.7% | 0 | 0.0% | 3 | 33.3% | 1939 | 6082/17908 | 11826 | 480 | 11346 | 66.0% |

## Diagnose a defect

Query: How should an agent diagnose a reported software defect, identify its root cause, and prove the fix?

Labels: Direct diagnosis and fix guidance is relevant; read-only explanation and design exploration are not defect repair.

| Threshold | Precision | Recall | FP | FP rate | Misses | Miss rate | Cost of miss (tokens) | Retained/baseline tokens | Saved tokens | Classifier-output overhead (tokens) | Net estimated tokens saved | Savings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 75.0% | 100.0% | 1 | 33.3% | 0 | 0.0% | 0 | 3761/4692 | 931 | 120 | 811 | 19.8% |
| 0.5 | 100.0% | 100.0% | 0 | 0.0% | 0 | 0.0% | 0 | 3529/4692 | 1163 | 120 | 1043 | 24.8% |
| 0.7 | 100.0% | 100.0% | 0 | 0.0% | 0 | 0.0% | 0 | 3529/4692 | 1163 | 120 | 1043 | 24.8% |
| 0.9 | 100.0% | 100.0% | 0 | 0.0% | 0 | 0.0% | 0 | 3529/4692 | 1163 | 120 | 1043 | 24.8% |

| Threshold | Missed relevant paths |
| --- | --- |
| 0.3 | None |
| 0.5 | None |
| 0.7 | None |
| 0.9 | None |

| Repository path | Relevant label | Probability | Estimated tokens |
| --- | --- | --- | --- |
| skills/diagnosing-bugs/SKILL.md | yes | 0.9700 | 2503 |
| skills/eng-mode/playbooks/bug-fix.md | yes | 0.9600 | 705 |
| skills/principle-fix-root-causes/SKILL.md | yes | 0.9400 | 321 |
| skills/eng-mode/playbooks/investigation.md | no | 0.3100 | 232 |
| skills/eng-mode/playbooks/prototype.md | no | 0.1400 | 634 |
| package.json | no | 0.1800 | 297 |

## Prepare and land a PR

Query: How should an agent establish pull-request merge readiness and then land it with explicit merge authority?

Labels: Readiness review and authorized landing are relevant; repairing a software defect or designing a prototype is a separate task.

| Threshold | Precision | Recall | FP | FP rate | Misses | Miss rate | Cost of miss (tokens) | Retained/baseline tokens | Saved tokens | Classifier-output overhead (tokens) | Net estimated tokens saved | Savings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 66.7% | 100.0% | 1 | 25.0% | 0 | 0.0% | 0 | 2982/4587 | 1605 | 120 | 1485 | 35.0% |
| 0.5 | 100.0% | 100.0% | 0 | 0.0% | 0 | 0.0% | 0 | 2277/4587 | 2310 | 120 | 2190 | 50.4% |
| 0.7 | 100.0% | 50.0% | 0 | 0.0% | 1 | 50.0% | 1072 | 1205/4587 | 3382 | 120 | 3262 | 73.7% |
| 0.9 | 100.0% | 50.0% | 0 | 0.0% | 1 | 50.0% | 1072 | 1205/4587 | 3382 | 120 | 3262 | 73.7% |

| Threshold | Missed relevant paths |
| --- | --- |
| 0.3 | None |
| 0.5 | None |
| 0.7 | skills/eng-mode/playbooks/babysit.md |
| 0.9 | skills/eng-mode/playbooks/babysit.md |

| Repository path | Relevant label | Probability | Estimated tokens |
| --- | --- | --- | --- |
| skills/eng-mode/playbooks/shipping.md | yes | 0.9100 | 1205 |
| skills/eng-mode/playbooks/babysit.md | yes | 0.6200 | 1072 |
| skills/eng-mode/playbooks/bug-fix.md | no | 0.3800 | 705 |
| skills/eng-mode/playbooks/refactoring.md | no | 0.2900 | 674 |
| skills/eng-mode/playbooks/prototype.md | no | 0.0600 | 634 |
| package.json | no | 0.1700 | 297 |

## Author a reusable skill

Query: How should an agent turn recurring workflow instructions into a reusable skill with clear triggers, references, and structural checks?

Labels: Skill authoring and deciding how to encode recurring instructions are relevant; executing diagnosis, PR review, or a prototype is not skill authoring.

| Threshold | Precision | Recall | FP | FP rate | Misses | Miss rate | Cost of miss (tokens) | Retained/baseline tokens | Saved tokens | Classifier-output overhead (tokens) | Net estimated tokens saved | Savings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 33.3% | 100.0% | 4 | 100.0% | 0 | 0.0% | 0 | 5745/5745 | 0 | 120 | -120 | 0.0% |
| 0.5 | 50.0% | 100.0% | 2 | 50.0% | 0 | 0.0% | 0 | 4814/5745 | 931 | 120 | 811 | 16.2% |
| 0.7 | 50.0% | 100.0% | 2 | 50.0% | 0 | 0.0% | 0 | 4814/5745 | 931 | 120 | 811 | 16.2% |
| 0.9 | 100.0% | 50.0% | 0 | 0.0% | 1 | 50.0% | 565 | 674/5745 | 5071 | 120 | 4951 | 88.3% |

| Threshold | Missed relevant paths |
| --- | --- |
| 0.3 | None |
| 0.5 | None |
| 0.7 | None |
| 0.9 | skills/principle-encode-lessons-in-structure/SKILL.md |

| Repository path | Relevant label | Probability | Estimated tokens |
| --- | --- | --- | --- |
| skills/eng-mode/playbooks/authoring-a-skill.md | yes | 0.9300 | 674 |
| skills/principle-encode-lessons-in-structure/SKILL.md | yes | 0.8700 | 565 |
| skills/diagnosing-bugs/SKILL.md | no | 0.7100 | 2503 |
| skills/eng-mode/playbooks/babysit.md | no | 0.7400 | 1072 |
| skills/eng-mode/playbooks/prototype.md | no | 0.4300 | 634 |
| package.json | no | 0.4400 | 297 |

## Migrate an internal API

Query: How should an agent replace an internal API, migrate all callers, remove the legacy API, and preserve observable behavior?

Labels: Behavior-preserving refactoring and caller cutover guidance are relevant; diagnosis, skill authoring, and read-only explanation do not prescribe this migration.

| Threshold | Precision | Recall | FP | FP rate | Misses | Miss rate | Cost of miss (tokens) | Retained/baseline tokens | Saved tokens | Classifier-output overhead (tokens) | Net estimated tokens saved | Savings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 66.7% | 100.0% | 1 | 25.0% | 0 | 0.0% | 0 | 1681/2884 | 1203 | 120 | 1083 | 41.7% |
| 0.5 | 100.0% | 100.0% | 0 | 0.0% | 0 | 0.0% | 0 | 976/2884 | 1908 | 120 | 1788 | 66.2% |
| 0.7 | 100.0% | 100.0% | 0 | 0.0% | 0 | 0.0% | 0 | 976/2884 | 1908 | 120 | 1788 | 66.2% |
| 0.9 | 100.0% | 50.0% | 0 | 0.0% | 1 | 50.0% | 302 | 674/2884 | 2210 | 120 | 2090 | 76.6% |

| Threshold | Missed relevant paths |
| --- | --- |
| 0.3 | None |
| 0.5 | None |
| 0.7 | None |
| 0.9 | skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md |

| Repository path | Relevant label | Probability | Estimated tokens |
| --- | --- | --- | --- |
| skills/eng-mode/playbooks/refactoring.md | yes | 0.9400 | 674 |
| skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md | yes | 0.8300 | 302 |
| skills/eng-mode/playbooks/bug-fix.md | no | 0.3200 | 705 |
| skills/eng-mode/playbooks/authoring-a-skill.md | no | 0.1200 | 674 |
| skills/eng-mode/playbooks/investigation.md | no | 0.2900 | 232 |
| package.json | no | 0.1100 | 297 |
