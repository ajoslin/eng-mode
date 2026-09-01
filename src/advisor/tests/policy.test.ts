import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { renderEngAdvisorCard } from "../card";
import { loadEngAdvisorConfig } from "../config";
import { findingIdentityKey } from "../finding-identity";
import { applyFindingPolicy } from "../policy";
import { filterReviewBatch } from "../transcript";
import { cursorSnapshot, digestMessagePrefix, restoreState } from "../state";
import {
	ENG_ADVISOR_CURSOR_TYPE,
	ENG_ADVISOR_FINDING_STATE_TYPE,
	ENG_ADVISOR_STATE_TYPE,
	ENG_ADVISOR_VERSION,
	type EngAdvisorState,
	type ProposedFinding,
	type ReviewBatch,
} from "../types";

const extensionDir = path.resolve(import.meta.dir, "..");
const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const config = await loadEngAdvisorConfig(extensionDir);

function assistant(id: string, name: string, args: Record<string, unknown>): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id, name, arguments: args }],
		api: "openai-responses",
		provider: "openai",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "toolUse",
		timestamp: 1,
	} as AgentMessage;
}

function result(id: string, name: string, text: string): AgentMessage {
	return {
		role: "toolResult",
		toolCallId: id,
		toolName: name,
		content: [{ type: "text", text }],
		isError: false,
		timestamp: 2,
	} as AgentMessage;
}

function user(text: string): AgentMessage {
	return { role: "user", content: [{ type: "text", text }], timestamp: 1 } as AgentMessage;
}

function policyBatch(text = "The unchecked cast is here"): ReviewBatch {
	return {
		messages: [user(text)],
		text: `[message:0] user\n${text}`,
		groundingText: new Map([["message:0", `[message:0] user\n${text}`]]),
		wip: false,
		cursor: 1,
	};
}

function proposal(overrides: Partial<ProposedFinding> = {}): ProposedFinding {
	return {
		category: "type-contract",
		resource: "package.json",
		evidence: [
			{
				source: "repository",
				locator: "package.json:2",
				quote: '"name": "@eng/eng-mode"',
				claim: "The implementation bypasses validation.",
			},
		],
		note: "Validate the external value before narrowing it.",
		severity: "concern",
		status: "open",
		...overrides,
	};
}

function emptyState(): EngAdvisorState {
	return {
		version: ENG_ADVISOR_VERSION,
		cursor: 0,
		reviewSequence: 1,
		prefixDigest: digestMessagePrefix([], 0),
		findings: [],
	};
}

describe("configuration", () => {
	test("defaults to a bounded review deadline", async () => {
		const emptyDir = await fs.mkdtemp(path.join(tmpdir(), "eng-advisor-config-"));
		try {
			expect((await loadEngAdvisorConfig(emptyDir)).reviewTimeoutMs).toBe(120_000);
			expect(config.model).toBe("@advisor");
		} finally {
			await fs.rm(emptyDir, { recursive: true, force: true });
		}
	});
});

describe("operational input transforms", () => {
	test("drops a blacklisted call message and every paired result", () => {
		const messages = [
			assistant("git-1", "bash", { command: "git status" }),
			result("git-1", "bash", "clean"),
			assistant("edit-1", "edit", { path: "src/a.ts" }),
			result("edit-1", "edit", "updated"),
		];
		const batch = filterReviewBatch(messages, 0, false, config);
		expect(batch?.text).not.toContain("git status");
		expect(batch?.text).not.toContain("clean");
		expect(batch?.text).toContain("edit");
		expect(batch?.text).toContain("updated");
	});

	test("drops shell Git commands even when assignments or wrappers precede them", () => {
		const commands = [
			"FOO=bar git status",
			"env FOO=bar gh pr view",
			"sudo -u build gt log",
			"printf done && graphite status",
		];
		for (const [index, command] of commands.entries()) {
			const id = `operational-${index}`;
			expect(
				filterReviewBatch([assistant(id, "bash", { command }), result(id, "bash", "hidden")], 0, false, config),
			).toBeNull();
		}
	});

	test("drops independently blacklisted results and skip-loop text", () => {
		const messages = [
			result("orphan", "github_api", "review threads"),
			user("Skipped due to pending advisory. Do not count this skipped result."),
			user("Fix the parser invariant."),
		];
		const batch = filterReviewBatch(messages, 0, false, config);
		expect(batch?.text).not.toContain("review threads");
		expect(batch?.text).not.toContain("pending advisory");
		expect(batch?.text).toContain("parser invariant");
	});

	test("drops a mixed assistant message rather than leaking sibling calls", () => {
		const base = assistant("edit-1", "edit", { path: "src/a.ts" });
		if (base.role !== "assistant") throw new Error("assistant fixture has the wrong role");
		const mixed: AgentMessage = {
			...base,
			content: [
				{ type: "toolCall", id: "edit-1", name: "edit", arguments: { path: "src/a.ts" } },
				{ type: "toolCall", id: "git-1", name: "gh", arguments: { args: ["pr", "view"] } },
			],
		};
		const batch = filterReviewBatch(
			[mixed, result("edit-1", "edit", "updated"), result("git-1", "gh", "PR")],
			0,
			false,
			config,
		);
		expect(batch).toBeNull();
	});
});

describe("finding policy", () => {
	test("requires repository evidence with an exact grounded quote", async () => {
		const transcriptOnly = proposal({
			evidence: [{ source: "transcript", locator: "message:0", quote: "unchecked cast", claim: "claim" }],
		});
		const inventedRepositoryQuote = proposal({
			evidence: [{ source: "repository", locator: "package.json:2", quote: "invented text", claim: "claim" }],
		});
		for (const candidate of [transcriptOnly, inventedRepositoryQuote]) {
			const state = emptyState();
			const decisions = await applyFindingPolicy({
				state,
				proposals: [candidate],
				batch: policyBatch(),
				config,
				cwd: repositoryRoot,
				now: 1_000,
			});
			expect(decisions).toEqual([]);
			expect(state.findings).toEqual([]);
		}
	});

	test("blocks operational findings after generation", async () => {
		const state = emptyState();
		const decisions = await applyFindingPolicy({
			state,
			proposals: [proposal({ note: "Retry the failed tool call." })],
			batch: policyBatch(),
			config,
			cwd: repositoryRoot,
			now: 1_000,
		});
		expect(decisions).toEqual([]);
	});

	test("emits once, suppresses unchanged evidence, and cools changed evidence", async () => {
		const state = emptyState();
		const first = await applyFindingPolicy({ state, proposals: [proposal()], batch: policyBatch(), config, cwd: repositoryRoot, now: 1_000 });
		expect(first.map(item => item.kind)).toEqual(["emit"]);
		state.reviewSequence++;
		const repeated = await applyFindingPolicy({ state, proposals: [proposal()], batch: policyBatch(), config, cwd: repositoryRoot, now: 2_000 });
		expect(repeated.map(item => [item.kind, item.reason])).toEqual([["suppress", "unchanged"]]);
		state.reviewSequence++;
		const changed = proposal({ evidence: [{ source: "repository", locator: "package.json:2", quote: "@eng/eng-mode", claim: "More exact evidence." }] });
		const cooled = await applyFindingPolicy({ state, proposals: [changed], batch: policyBatch(), config, cwd: repositoryRoot, now: 3_000 });
		expect(cooled.map(item => [item.kind, item.reason])).toEqual([["suppress", "cooldown"]]);
	});

	test("severity escalation and explicit refresh bypass cooldown", async () => {
		const state = emptyState();
		await applyFindingPolicy({ state, proposals: [proposal()], batch: policyBatch(), config, cwd: repositoryRoot, now: 1_000 });
		state.reviewSequence++;
		const escalatedProposal = proposal({ severity: "blocker" });
		const escalated = await applyFindingPolicy({ state, proposals: [escalatedProposal], batch: policyBatch(), config, cwd: repositoryRoot, now: 2_000 });
		expect(escalated.map(item => item.kind)).toEqual(["emit"]);
		state.reviewSequence++;
		const forced = await applyFindingPolicy({ state, proposals: [escalatedProposal], batch: policyBatch(), config, cwd: repositoryRoot, now: 3_000, force: true });
		expect(forced.map(item => item.kind)).toEqual(["emit"]);
	});

	test("withholds in-progress non-blockers but permits blockers", async () => {
		const batch = { ...policyBatch(), wip: true };
		const state = emptyState();
		expect(await applyFindingPolicy({ state, proposals: [proposal()], batch, config, cwd: repositoryRoot })).toEqual([]);
		const decisions = await applyFindingPolicy({ state, proposals: [proposal({ severity: "blocker" })], batch, config, cwd: repositoryRoot });
		expect(decisions.map(decision => decision.kind)).toEqual(["emit"]);
	});

	test("ignores unknown resolutions and re-emits a resolved finding on regression", async () => {
		const state = emptyState();
		const unknownResolution = await applyFindingPolicy({ state, proposals: [proposal({ status: "resolved" })], batch: policyBatch(), config, cwd: repositoryRoot });
		expect(unknownResolution).toEqual([]);
		await applyFindingPolicy({ state, proposals: [proposal()], batch: policyBatch(), config, cwd: repositoryRoot, now: 1_000 });
		state.reviewSequence++;
		const resolved = await applyFindingPolicy({ state, proposals: [proposal({ status: "resolved" })], batch: policyBatch(), config, cwd: repositoryRoot, now: 2_000 });
		expect(resolved.map(decision => decision.kind)).toEqual(["resolve"]);
		state.reviewSequence++;
		const reopened = await applyFindingPolicy({ state, proposals: [proposal()], batch: policyBatch(), config, cwd: repositoryRoot, now: 3_000 });
		expect(reopened.map(decision => decision.kind)).toEqual(["emit"]);
		expect(state.findings.at(0)?.status).toBe("open");
	});

	test("uses category and repository targets as the stable finding identity", () => {
		const first = proposal();
		const rephrasedResource = proposal({ resource: "package.json · package metadata" });
		const moved = proposal({
			evidence: [{ source: "repository", locator: "package.json:3", quote: '"private": true', claim: "claim" }],
		});
		expect(findingIdentityKey(first)).toBe(findingIdentityKey(rephrasedResource));
		expect(findingIdentityKey(first)).not.toBe(findingIdentityKey(moved));
	});
});

describe("durable state", () => {
	test("restores full findings plus the latest lightweight cursor", () => {
		const messageEntry = {
			type: "message",
			id: "m1",
			parentId: null,
			timestamp: "2026-01-01",
			message: user("hello"),
		} as SessionEntry;
		const state = emptyState();
		state.findings = [];
		const entries = [
			messageEntry,
			{
				type: "custom",
				id: "s1",
				parentId: "m1",
				timestamp: "2026-01-01",
				customType: ENG_ADVISOR_STATE_TYPE,
				data: state,
			},
		] as SessionEntry[];
		const prefix = digestMessagePrefix([messageEntry as Extract<SessionEntry, { type: "message" }>], 1);
		entries.push({
			type: "custom",
			id: "c1",
			parentId: "s1",
			timestamp: "2026-01-01",
			customType: ENG_ADVISOR_CURSOR_TYPE,
			data: { ...cursorSnapshot(state), cursor: 1, reviewSequence: 7, prefixDigest: prefix },
		} as SessionEntry);
		const restored = restoreState(entries);
		expect(restored.cursor).toBe(1);
		expect(restored.reviewSequence).toBe(7);
		expect(restored.prefixDigest).toBe(prefix);
	});

	test("migrates version-one finding identities and categories", () => {
		const persisted = {
			version: 1,
			cursor: 0,
			reviewSequence: 3,
			prefixDigest: digestMessagePrefix([], 0),
			findings: [
				{
					...proposal(),
					category: "api-contract",
					key: "legacy-key",
					status: "open",
					evidenceDigest: "evidence",
					firstSeenAt: 1,
					lastSeenAt: 2,
					lastEmittedAt: 1,
					lastEmittedReview: 1,
					occurrences: 2,
				},
			],
		};
		const entries = [
			{
				type: "custom",
				id: "legacy-state",
				parentId: null,
				timestamp: "2026-01-01",
				customType: ENG_ADVISOR_STATE_TYPE,
				data: persisted,
			},
		] as SessionEntry[];
		const restored = restoreState(entries);
		expect(restored.version).toBe(ENG_ADVISOR_VERSION);
		const migrated = restored.findings.at(0);
		expect(migrated?.category).toBe("type-contract");
		expect(migrated?.key).toBe(migrated ? findingIdentityKey(migrated) : undefined);
		expect(migrated?.occurrences).toBe(2);
	});

	test("restores coalesced repeat counts", async () => {
		const state = emptyState();
		await applyFindingPolicy({ state, proposals: [proposal()], batch: policyBatch(), config, cwd: repositoryRoot, now: 1 });
		state.reviewSequence++;
		await applyFindingPolicy({ state, proposals: [proposal()], batch: policyBatch(), config, cwd: repositoryRoot, now: 2 });
		const entries = [{ type: "custom", id: "finding-state", parentId: null, timestamp: "2026-01-01", customType: ENG_ADVISOR_FINDING_STATE_TYPE, data: { version: ENG_ADVISOR_VERSION, finding: state.findings.at(0) } }] as SessionEntry[];
		expect(restoreState(entries).findings.at(0)?.occurrences).toBe(2);
	});

	test("resets a cursor whose branch prefix changed", () => {
		const messageEntry = {
			type: "message",
			id: "m2",
			parentId: null,
			timestamp: "2026-01-01",
			message: user("changed"),
		} as SessionEntry;
		const state = { ...emptyState(), cursor: 1, prefixDigest: "stale" };
		const entries = [
			messageEntry,
			{
				type: "custom",
				id: "s1",
				parentId: "m2",
				timestamp: "2026-01-01",
				customType: ENG_ADVISOR_STATE_TYPE,
				data: state,
			},
		] as SessionEntry[];
		expect(restoreState(entries).cursor).toBe(0);
	});
});

describe("finding card", () => {
	test("renders a bordered, actionable Eng-Advisor card", async () => {
		const state = emptyState();
		await applyFindingPolicy({
			state,
			proposals: [proposal()],
			batch: policyBatch(),
			config,
			cwd: repositoryRoot,
			now: 1,
		});
		const finding = state.findings.at(0);
		if (!finding) throw new Error("Expected a rendered finding");
		const card = renderEngAdvisorCard(
			{ finding, suppressedRepeats: 3 },
			{
				boxRound: {
					topLeft: "╭",
					topRight: "╮",
					bottomLeft: "╰",
					bottomRight: "╯",
					horizontal: "─",
					vertical: "│",
				},
				bold: text => text,
				fg: (_color, text) => text,
				bg: (_color, text) => text,
			},
		);
		const rendered = card.render(80).join("\n");
		expect(rendered).toContain("╭");
		expect(rendered).toContain("Eng-Advisor · concern · 3 repeats coalesced");
		expect(rendered).toContain("Validate the external value before narrowing it.");
		expect(rendered).toContain(`package.json · ${finding.key.slice(0, 12)}`);
	});
});
