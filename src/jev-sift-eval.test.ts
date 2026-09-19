import { describe, expect, test } from "bun:test";
import { thresholdMetrics, type ScoredItem } from "./jev-sift-eval";

const items: ScoredItem[] = [
	{ path: "positive-high", relevant: true, probability: 0.9, estimatedTokens: 100 },
	{ path: "positive-boundary", relevant: true, probability: 0.5, estimatedTokens: 200 },
	{ path: "positive-low", relevant: true, probability: 0.1, estimatedTokens: 300 },
	{ path: "negative-high", relevant: false, probability: 0.8, estimatedTokens: 400 },
	{ path: "negative-low", relevant: false, probability: 0.2, estimatedTokens: 500 },
];

describe("Jev Sift threshold metrics", () => {
	test("counts boundary scores, false positives, misses, and weighted savings", () => {
		expect(thresholdMetrics(items, 0.5)).toEqual({
			threshold: 0.5,
			truePositives: 2,
			falsePositives: 1,
			misses: 1,
			trueNegatives: 1,
			precision: 2 / 3,
			recall: 2 / 3,
			falsePositiveRate: 0.5,
			missRate: 1 / 3,
			baselineTokens: 1500,
			retainedTokens: 700,
			savedTokens: 800,
			missedTokens: 300,
			classifierOutputOverheadTokens: 100,
			netEstimatedTokensSaved: 700,
			tokenSavings: 8 / 15,
		});
	});

	test("a stricter threshold changes quality and savings independently", () => {
		expect(thresholdMetrics(items, 0.9)).toEqual({
			threshold: 0.9,
			truePositives: 1,
			falsePositives: 0,
			misses: 2,
			trueNegatives: 2,
			precision: 1,
			recall: 1 / 3,
			falsePositiveRate: 0,
			missRate: 2 / 3,
			baselineTokens: 1500,
			retainedTokens: 100,
			savedTokens: 1400,
			missedTokens: 500,
			classifierOutputOverheadTokens: 100,
			netEstimatedTokensSaved: 1300,
			tokenSavings: 14 / 15,
		});
	});

	test("no retained items leaves precision undefined rather than perfect", () => {
		expect(thresholdMetrics(items, 1)).toEqual({
			threshold: 1,
			truePositives: 0,
			falsePositives: 0,
			misses: 3,
			trueNegatives: 2,
			precision: null,
			recall: 0,
			falsePositiveRate: 0,
			missRate: 1,
			baselineTokens: 1500,
			retainedTokens: 0,
			savedTokens: 1500,
			missedTokens: 600,
			classifierOutputOverheadTokens: 100,
			netEstimatedTokensSaved: 1400,
			tokenSavings: 1,
		});
	});

	test("pooled queries count repeated paths per task and weight counts and tokens, not query ratios", () => {
		const queries: ScoredItem[][] = [
			[
				{ path: "shared", relevant: true, probability: 0.9, estimatedTokens: 100 },
				{ path: "miss-a", relevant: true, probability: 0.2, estimatedTokens: 200 },
				{ path: "false-positive", relevant: false, probability: 0.8, estimatedTokens: 300 },
			],
			[
				{ path: "miss-b", relevant: true, probability: 0.1, estimatedTokens: 400 },
				{ path: "shared", relevant: false, probability: 0.3, estimatedTokens: 100 },
			],
		];
		expect(thresholdMetrics(queries.flat(), 0.5)).toEqual({
			threshold: 0.5,
			truePositives: 1,
			falsePositives: 1,
			misses: 2,
			trueNegatives: 1,
			precision: 0.5,
			recall: 1 / 3,
			falsePositiveRate: 0.5,
			missRate: 2 / 3,
			baselineTokens: 1100,
			retainedTokens: 400,
			savedTokens: 700,
			missedTokens: 600,
			classifierOutputOverheadTokens: 100,
			netEstimatedTokensSaved: 600,
			tokenSavings: 7 / 11,
		});
	});

	test("classifier-output overhead can exceed savings even when no content is missed", () => {
		expect(thresholdMetrics([
			{ path: "retained", relevant: true, probability: 0.8, estimatedTokens: 100 },
			{ path: "omitted", relevant: false, probability: 0.1, estimatedTokens: 10 },
		], 0.5)).toMatchObject({
			missedTokens: 0,
			savedTokens: 10,
			classifierOutputOverheadTokens: 40,
			netEstimatedTokensSaved: -30,
		});
	});

	test("empty denominators are undefined", () => {
		expect(thresholdMetrics([], 0)).toEqual({
			threshold: 0,
			truePositives: 0,
			falsePositives: 0,
			misses: 0,
			trueNegatives: 0,
			precision: null,
			recall: null,
			falsePositiveRate: null,
			missRate: null,
			baselineTokens: 0,
			retainedTokens: 0,
			savedTokens: 0,
			missedTokens: 0,
			classifierOutputOverheadTokens: 0,
			netEstimatedTokensSaved: 0,
			tokenSavings: null,
		});
	});
});
