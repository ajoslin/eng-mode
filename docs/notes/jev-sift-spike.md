# jev-sift spike

## Decision

Adopt jev-sift later as a key-gated, opt-in companion. Do not enable it by default or use it as a correctness boundary.

The live trial retained every labeled relevant file at threshold `0.5`, with 35.2% estimated downstream source-token savings in the latest run. Threshold `0.7` saved 41.2% and missed one of nine relevant query/file decisions. Threshold `0.9` saved 66.0% but missed three relevant decisions. No tested threshold met both the proposed bar of at least 90% recall and at least 50% downstream savings.

The trial covered four repository tasks and 24 query/file decisions. It is evidence that the MCP wiring works and that sift can reduce downstream reads for these task classes. It is not enough evidence for a default threshold or automatic use.

`compact-adviser` and jev-sift address different costs. `compact-adviser` decides when to compact conversation history. jev-sift classifies candidate content for relevance before downstream reading. It does not compact the conversation, replace checkpoint and rewind, or establish that rejected content is safe to ignore.

## Methodology

The evaluator uses four fixed task queries. Each query has six repository files with hand-written relevance labels, including adjacent negatives. The baseline sends every candidate to the downstream model.

The sweep compares thresholds of `0.3`, `0.5`, `0.7`, and `0.9`. For each threshold, it reports precision, recall, false positives, missed relevant files, cost of missed relevant content, and estimated classifier-output overhead. The live run also reports TypeSafe input tokens, elapsed wall-clock time, and an isolated MCP initialize, tool discovery, status, and classify sequence.

Estimate downstream tokens with `ceil(chars / 4)`. This is a size proxy, not a tokenizer count, a billing estimate, or measured end-to-end savings. The live corpus used 24,277 provider input tokens in each run. The report's downstream savings exclude classifier input, prompts, output, and MCP overhead. The report subtracts a fixed 20-token-per-item output estimate from gross savings, but that estimate is not a provider bill.

Mock mode uses synthetic scores to exercise the report path. It provides no evidence of model quality. Live mode calls `jev-latest` and records the returned probabilities. Three live runs were made against the same working tree and corpus.

## Live evidence

The evaluator ran three live trials against the same working tree and corpus. Each run used 24,277 provider input tokens and passed the MCP smoke sequence. The latest run took 2,966 ms, including setup, MCP smoke, and 24 sequential classifications.

| Threshold | Precision | Recall | Misses | Cost of miss (tokens) | Gross savings | Net estimated savings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.3 | 56.3% | 100.0% | 0 | 0 | 21.1% | 3,290 tokens |
| 0.5 | 81.8% | 100.0% | 0 | 0 | 35.2% | 5,832 tokens |
| 0.7 | 80.0% | 88.9% | 1 | 1,072 | 41.2% | 6,904 tokens |
| 0.9 | 100.0% | 66.7% | 3 | 1,939 | 66.0% | 11,346 tokens |

The latest run missed `skills/eng-mode/playbooks/babysit.md` at threshold `0.7`, and missed that file plus `skills/principle-encode-lessons-in-structure/SKILL.md` and `skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md` at `0.9`. At `0.5`, all nine labeled relevant decisions were retained. Across the three runs, threshold `0.5` recall stayed at 100%; precision varied from 75.0% to 81.8%.

No corpus item exceeded Jev Sift's 60,000-character limit, so this trial did not measure truncation handling. The evaluator rejects an oversized corpus item rather than silently changing the input. The live runs reported no request failures or rate limits.


## Recommendation criteria

Keep jev-sift opt-in unless live evidence supports all of these claims:

- The selected threshold retains every file required for the evaluated tasks, with misses reviewed individually.
- Rejected content saves enough downstream reading to justify the classification call's input cost and latency.
- MCP initialization, discovery, status, and classification succeed without exposing credentials.
- The result repeats on tasks outside the fixed corpus, including ambiguous files and dependencies whose names do not match the task.

The current evidence meets the MCP criterion and shows perfect recall at `0.5` for this corpus, but it misses the 50% savings target. Threshold `0.7` also misses the savings target and misses a required file. Threshold `0.9` meets the savings target but misses three required decisions. Recommend no default threshold yet.

## Risks and boundaries

Relevance labels encode the evaluator author's judgment. Fixed repository files may favor familiar naming patterns. Content changes can invalidate labels, and provider changes can change scores. Preserve the repository revision, provider identity, and raw run artifact with each report.

Only send content you are permitted to disclose to the configured provider. Keep secrets out of the corpus and reports. A relevance score is advisory, not a security boundary.

The setup utility is opt-in. It clones the pinned jev-sift repository into the OMP config root and registers a stdio MCP server in the user's MCP config. It never stores the API key in MCP config. Without a key, it removes only its own MCP entry.

The MCP path differs from `compact-adviser`: jev-sift is a checked-out stdio MCP server that the model calls explicitly, while `compact-adviser` is an `omp-plugins` npm extension that hooks automatic compaction. Jev Sift accepts `JEV_API_KEY`, `TYPESAFE_API_KEY`, or `~/.config/jev-sift/api-key`; compact-adviser uses its TypeSafe gate and plugin-owned saved configuration.
