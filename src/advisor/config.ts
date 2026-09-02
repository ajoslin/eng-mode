import * as fs from "node:fs/promises";
import * as path from "node:path";
import { RE2JS } from "re2js";
import { z } from "zod";

const RegexRuleSchema = z.object({
	pattern: z.string().max(512),
	flags: z
		.string()
		.regex(/^[imsu]*$/)
		.optional(),
});

const ThinkingSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]);

const ConfigSchema = z.object({
	model: z.string().min(1).optional(),
	thinking: ThinkingSchema.optional(),
	cooldownMs: z.number().int().min(0).max(86_400_000).optional(),
	cooldownReviews: z.number().int().min(0).max(10_000).optional(),
	reviewEveryTurns: z.number().int().min(1).max(100).optional(),
	reviewFinalAfterTurns: z.number().int().min(1).max(100).optional(),
	maxBatchMessages: z.number().int().min(1).max(1_000).optional(),
	maxReviewChars: z.number().int().min(4_096).max(1_000_000).optional(),
	reviewTimeoutMs: z
		.number()
		.int()
		.min(1_000)
		.max(15 * 60_000)
		.optional(),
	maxFindingsPerReview: z.number().int().min(1).max(10).optional(),
	maxFieldChars: z.number().int().min(1_024).max(65_536).optional(),
	ignoredToolNames: z.array(z.string()).optional(),
	ignoredToolNamePrefixes: z.array(z.string()).optional(),
	ignoredToolNamePatterns: z.array(RegexRuleSchema).optional(),
	ignoredShellCommandPatterns: z.array(RegexRuleSchema).optional(),
	ignoredTranscriptPatterns: z.array(RegexRuleSchema).optional(),
	ignoredCustomMessageTypes: z.array(z.string()).optional(),
	ignoredOutputPatterns: z.array(RegexRuleSchema).optional(),
});

export type RegexRuleConfig = z.infer<typeof RegexRuleSchema>;
export type EngAdvisorConfigInput = z.infer<typeof ConfigSchema>;

export interface EngAdvisorConfig {
	model: string;
	maxBatchMessages: number;
	maxReviewChars: number;
	thinking: z.infer<typeof ThinkingSchema>;
	cooldownMs: number;
	cooldownReviews: number;
	reviewEveryTurns: number;
	reviewFinalAfterTurns: number;
	maxFindingsPerReview: number;
	reviewTimeoutMs: number;
	maxFieldChars: number;
	ignoredToolNames: string[];
	ignoredToolNamePrefixes: string[];
	ignoredToolNamePatterns: RegexRuleConfig[];
	ignoredShellCommandPatterns: RegexRuleConfig[];
	ignoredTranscriptPatterns: RegexRuleConfig[];
	ignoredCustomMessageTypes: string[];
	ignoredOutputPatterns: RegexRuleConfig[];
}

export interface CompiledEngAdvisorConfig extends EngAdvisorConfig {
	ignoredToolNameRegexes: RE2JS[];
	ignoredShellCommandRegexes: RE2JS[];
	ignoredTranscriptRegexes: RE2JS[];
	ignoredOutputRegexes: RE2JS[];
}

const DEFAULT_CONFIG: EngAdvisorConfig = {
	model: "@advisor",
	thinking: "low",
	maxBatchMessages: 32,
	maxReviewChars: 32_768,
	reviewTimeoutMs: 60_000,
	cooldownMs: 5 * 60_000,
	cooldownReviews: 8,
	reviewEveryTurns: 4,
	reviewFinalAfterTurns: 1,
	maxFindingsPerReview: 1,
	maxFieldChars: 8_192,
	ignoredToolNames: ["git", "gh", "github", "gt", "graphite"],
	ignoredToolNamePrefixes: ["github_", "git_", "gh_", "graphite_", "gt_", "mcp__github", "xd.github"],
	ignoredToolNamePatterns: [{ pattern: "(?:^|[^a-z0-9])(?:git|gh|github|gt|graphite)(?:$|[^a-z0-9])", flags: "i" }],
	ignoredShellCommandPatterns: [
		{
			pattern: "(?:^|[^A-Za-z0-9_])(?:git|github|graphite|gh|gt)(?:$|[^A-Za-z0-9_])",
			flags: "i",
		},
	],
	ignoredTranscriptPatterns: [
		{ pattern: "Skipped due to (?:queued user message|pending advisory)", flags: "i" },
		{ pattern: "Do not count this skipped result", flags: "i" },
	],
	ignoredCustomMessageTypes: [
		"advisor",
		"eng-advisor",
		"dev.ajoslin.eng-advisor.finding",
		"todo-reminder",
		"goal-reminder",
	],
	ignoredOutputPatterns: [
		{ pattern: "\\b(?:git|github|graphite|gh|gt|pull request|tool call|tool result)\\b", flags: "i" },
		{
			pattern:
				"\\b(?:shell|bash|command|tool)\\b(?:\\s+\\S+){0,12}\\s+\\b(?:skipped|failed|timed out|timeout|retry|retried)\\b",
			flags: "i",
		},
	],
};

function compileRules(rules: RegexRuleConfig[]): RE2JS[] {
	return rules.map(rule => {
		const flags = rule.flags ?? "i";
		const re2Flags =
			(flags.includes("i") ? RE2JS.CASE_INSENSITIVE : 0) |
			(flags.includes("m") ? RE2JS.MULTILINE : 0) |
			(flags.includes("s") ? RE2JS.DOTALL : 0);
		return RE2JS.compile(rule.pattern, re2Flags);
	});
}

export async function loadEngAdvisorConfig(extensionDir: string): Promise<CompiledEngAdvisorConfig> {
	const configPath = path.join(extensionDir, "eng-advisor.json");
	let input: EngAdvisorConfigInput = {};
	try {
		const parsed = ConfigSchema.safeParse(JSON.parse(await fs.readFile(configPath, "utf8")));
		if (!parsed.success) throw new Error(`Invalid Eng-Advisor config: ${parsed.error.message}`);
		input = parsed.data;
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
	}
	const config: EngAdvisorConfig = {
		model: input.model ?? DEFAULT_CONFIG.model,
		thinking: input.thinking ?? DEFAULT_CONFIG.thinking,
		maxBatchMessages: input.maxBatchMessages ?? DEFAULT_CONFIG.maxBatchMessages,
		maxReviewChars: input.maxReviewChars ?? DEFAULT_CONFIG.maxReviewChars,
		reviewTimeoutMs: input.reviewTimeoutMs ?? DEFAULT_CONFIG.reviewTimeoutMs,
		cooldownMs: input.cooldownMs ?? DEFAULT_CONFIG.cooldownMs,
		cooldownReviews: input.cooldownReviews ?? DEFAULT_CONFIG.cooldownReviews,
		reviewEveryTurns: input.reviewEveryTurns ?? DEFAULT_CONFIG.reviewEveryTurns,
		reviewFinalAfterTurns: input.reviewFinalAfterTurns ?? DEFAULT_CONFIG.reviewFinalAfterTurns,
		maxFindingsPerReview: input.maxFindingsPerReview ?? DEFAULT_CONFIG.maxFindingsPerReview,
		maxFieldChars: input.maxFieldChars ?? DEFAULT_CONFIG.maxFieldChars,
		ignoredToolNames: input.ignoredToolNames ?? DEFAULT_CONFIG.ignoredToolNames,
		ignoredToolNamePrefixes: input.ignoredToolNamePrefixes ?? DEFAULT_CONFIG.ignoredToolNamePrefixes,
		ignoredToolNamePatterns: input.ignoredToolNamePatterns ?? DEFAULT_CONFIG.ignoredToolNamePatterns,
		ignoredShellCommandPatterns: input.ignoredShellCommandPatterns ?? DEFAULT_CONFIG.ignoredShellCommandPatterns,
		ignoredTranscriptPatterns: input.ignoredTranscriptPatterns ?? DEFAULT_CONFIG.ignoredTranscriptPatterns,
		ignoredCustomMessageTypes: input.ignoredCustomMessageTypes ?? DEFAULT_CONFIG.ignoredCustomMessageTypes,
		ignoredOutputPatterns: input.ignoredOutputPatterns ?? DEFAULT_CONFIG.ignoredOutputPatterns,
	};
	return {
		...config,
		ignoredToolNameRegexes: compileRules(config.ignoredToolNamePatterns),
		ignoredShellCommandRegexes: compileRules(config.ignoredShellCommandPatterns),
		ignoredTranscriptRegexes: compileRules(config.ignoredTranscriptPatterns),
		ignoredOutputRegexes: compileRules(config.ignoredOutputPatterns),
	};
}
