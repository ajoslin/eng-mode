import { afterEach, expect, spyOn, test } from "bun:test";
import * as path from "node:path";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { createMockModel } from "@oh-my-pi/pi-ai";
import {
	type ExtensionCommandContext,
	type ExtensionContext,
	type SessionEntry,
	zod,
} from "@oh-my-pi/pi-coding-agent";
import { registerEngAdvisor, type AdvisorExtensionAPI } from "../index";
import * as policy from "../policy";
import * as advisorConfig from "../config";
import { InProcessReviewer } from "../reviewer";
import { restoreState } from "../state";
import {
	ENG_ADVISOR_CURSOR_TYPE,
	ENG_ADVISOR_FINDING_STATE_TYPE,
	type ProposedFinding,
	type ReviewBatch,
} from "../types";
import { ENG_MODE_ENTERED_TYPE } from "../../eng-mode-state";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const originalPolicy = policy.applyFindingPolicy;
const restorers: Array<() => void> = [];
afterEach(() => {
	for (const restore of restorers.splice(0).reverse()) restore();
});

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

const finding: ProposedFinding = {
	category: "type-contract",
	resource: "package.json",
	evidence: [
		{
			source: "repository",
			locator: "package.json:2",
			quote: '"name": "@eng/eng-mode"',
			claim: "Validate external values.",
		},
	],
	note: "Validate the external value before narrowing it.",
	severity: "concern",
	status: "open",
};

function user(text: string): AgentMessage {
	return { role: "user", content: text, timestamp: 1 };
}

async function harness(messages: AgentMessage[], options: { engMode?: boolean } = {}) {
	let branch: SessionEntry[] = [];
	const events = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => unknown
	>();
	let command:
		| ((args: string, ctx: ExtensionCommandContext) => Promise<void>)
		| undefined;
	const timers: Array<() => unknown> = [];
	const delivered: unknown[] = [];
	const notices: string[] = [];
	let nextId = 0;
	const append = (customType: string, data: unknown) => {
		branch.push({
			type: "custom",
			id: `c${nextId++}`,
			parentId: null,
			timestamp: "2026-01-01",
			customType,
			data,
		});
	};
	const add = (message: AgentMessage) =>
		branch.push({
			type: "message",
			id: `m${nextId++}`,
			parentId: null,
			timestamp: "2026-01-01",
			message,
		});
	if (options.engMode !== false) append(ENG_MODE_ENTERED_TYPE, undefined);
	messages.forEach(add);
	const { model } = createMockModel({
		handler: () => {
			throw new Error("Unexpected model call");
		},
	});
	const ctx = {
		cwd: repositoryRoot,
		sessionManager: {
			getBranch: () => branch,
			getSessionId: () => "advisor-test",
		},
		models: { resolve: () => model },
		modelRegistry: {
			resolver: () => {
				throw new Error("Live model calls are forbidden");
			},
		},
		ui: { notify: (text: string) => notices.push(text) },
		setTimeout: (callback: () => unknown) => {
			timers.push(callback);
			return () => {};
		},
	} as unknown as ExtensionCommandContext;
	const host = {
		appendEntry: append,
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => unknown,
		) => events.set(name, handler),
		registerCommand: (_name: string, value: { handler: typeof command }) => {
			command = value.handler;
		},
		registerMessageRenderer: () => {},
		sendMessage: (message: unknown) => delivered.push(message),
		pi: { getAgentDir: () => repositoryRoot },
		zod,
	} as unknown as AdvisorExtensionAPI;
	registerEngAdvisor(host);
	const event = async (name: string, payload: unknown = {}) => {
		await events.get(name)?.(payload, ctx);
	};
	await event("session_start");
	expect(notices.filter((text) => text.includes("disabled"))).toEqual([]);
	return {
		add,
		append,
		notices,
		timers,
		delivered,
		event,
		state: () => restoreState(branch),
		entries: () => branch,
		command: async (args: string) => {
			if (!command) throw new Error("Missing command");
			await command(args, ctx);
		},
		flush: async () => {
			const callback = timers.shift();
			if (!callback) throw new Error("Missing scheduled review");
			await callback();
		},
		switchSession: async () => {
			branch = [];
			add(user("New session boundary"));
			await event("session_switch");
		},
	};
}

test("stays paused outside Eng Mode and arms once the session enters it", async () => {
	const reviews: ReviewBatch[] = [];
	stubReview(async ({ batch }) => {
		reviews.push(batch);
		return [];
	});
	const app = await harness([user("Plain session")], { engMode: false });
	try {
		await app.command("status");
		expect(app.notices.at(-1)).toStartWith("Eng-Advisor: paused");
		await app.event("turn_end", { message: user("Plain turn") });
		expect(app.timers).toEqual([]);
		app.append(ENG_MODE_ENTERED_TYPE, undefined);
		app.add(user("Entered Eng Mode"));
		await app.event("turn_end", { message: user("Eng Mode turn") });
		await app.flush();
		expect(reviews).toHaveLength(1);
		await app.command("status");
		expect(app.notices.at(-1)).toStartWith("Eng-Advisor: enabled");
	} finally {
		await app.event("session_shutdown");
	}
});

test("reload publication invalidates reviews started while configuration was loading", async () => {
	const app = await harness([user("Pending boundary")]);
	const loading = deferred();
	const releaseConfig = deferred();
	const policyReady = deferred();
	const releasePolicy = deferred();
	const originalLoad = advisorConfig.loadEngAdvisorConfig;
	const loadSpy = spyOn(
		advisorConfig,
		"loadEngAdvisorConfig",
	).mockImplementation(async (...args) => {
		loading.resolve();
		await releaseConfig.promise;
		return originalLoad(...args);
	});
	restorers.push(() => loadSpy.mockRestore());
	stubReview(async () => [finding]);
	const policySpy = spyOn(policy, "applyFindingPolicy").mockImplementation(
		async (options) => {
			const decisions = await originalPolicy(options);
			policyReady.resolve();
			await releasePolicy.promise;
			return decisions;
		},
	);
	restorers.push(() => policySpy.mockRestore());
	try {
		const reload = app.command("reload");
		await loading.promise;
		await app.command("on");
		const review = app.flush();
		await policyReady.promise;
		releaseConfig.resolve();
		await reload;
		releasePolicy.resolve();
		stubReview(async () => {
			throw new Error("No subsequent review commit");
		});
		await review;
		expect(app.delivered).toEqual([]);
		expect(app.state().cursor).toBe(0);
	} finally {
		releaseConfig.resolve();
		releasePolicy.resolve();
		await app.event("session_shutdown");
	}
});

function stubReview(implementation: InProcessReviewer["review"]) {
	const spy = spyOn(InProcessReviewer.prototype, "review").mockImplementation(
		implementation,
	);
	restorers.push(() => spy.mockRestore());
}

test("commits only reviewed transcript prefixes, retries failures, and accounts for an oversized latest message on a later poll", async () => {
	const batches: ReviewBatch[] = [];
	let fail = true;
	stubReview(async ({ batch }) => {
		batches.push(batch);
		if (fail) {
			fail = false;
			throw new Error("Review failed");
		}
		return [];
	});
	const oversized: AgentMessage = {
		role: "user",
		content: Array.from({ length: 5 }, () => ({
			type: "text",
			text: "x".repeat(8_192),
		})),
		timestamp: 2,
	};
	const app = await harness([user("Oldest pending boundary"), oversized]);
	try {
		await app.command("on");
		await app.flush();
		expect(app.state().cursor).toBe(0);
		await app.command("on");
		await app.flush();
		expect(batches[1]?.text).toBe(batches[0]?.text);
		expect(app.state().cursor).toBe(1);
		app.add(user("Later poll boundary"));
		await app.command("on");
		await app.flush();
		expect(batches[2]?.text).toContain("oversize message:1");
		expect(batches[2]?.text.length).toBeLessThanOrEqual(32_768);
		expect(app.state().cursor).toBe(2);
		await app.command("on");
		await app.flush();
		expect(batches[3]?.text).toContain("Later poll boundary");
		expect(app.state().cursor).toBe(3);
	} finally {
		await app.event("session_shutdown");
	}
});

test("a failed review does not forget paired results hidden by an earlier batch", async () => {
	const batches: ReviewBatch[] = [];
	let fail = false;
	stubReview(async ({ batch }) => {
		batches.push(batch);
		if (fail) {
			fail = false;
			throw new Error("Review failed");
		}
		return [];
	});
	const ignoredCall: AgentMessage = {
		role: "assistant",
		api: "openai-responses",
		provider: "openai",
		model: "test",
		timestamp: 1,
		content: [
			{
				type: "toolCall",
				id: "hidden-edit",
				name: "edit",
				arguments: { path: "src/a.ts" },
			},
			{
				type: "toolCall",
				id: "hidden-git",
				name: "bash",
				arguments: { command: "git status" },
			},
		],
		stopReason: "toolUse",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
	const app = await harness([ignoredCall, user("Review invariant")]);
	try {
		await app.command("on");
		await app.flush();
		app.add({
			role: "toolResult",
			toolCallId: "hidden-edit",
			toolName: "edit",
			content: [{ type: "text", text: "Must remain hidden" }],
			isError: false,
			timestamp: 2,
		});
		app.add(user("Next invariant"));
		fail = true;
		await app.command("on");
		await app.flush();
		expect(app.state().cursor).toBe(2);
		await app.command("on");
		await app.flush();
		expect(batches[1]?.text).not.toContain("Must remain hidden");
		expect(batches[2]?.text).toBe(batches[1]?.text);
		expect(app.state().cursor).toBe(4);
	} finally {
		await app.event("session_shutdown");
	}
});

for (const transition of [
	"session",
	"off",
	"reload",
	"refresh",
	"dismiss",
] as const) {
	test(`discards policy results invalidated by ${transition} while evidence validation is pending`, async () => {
		stubReview(async () => [finding]);
		const app = await harness([user("Original session boundary")]);
		try {
			if (transition === "dismiss") {
				await app.command("on");
				await app.flush();
				app.add(user("Next boundary"));
			}
			const entered = deferred();
			const release = deferred();
			const policySpy = spyOn(policy, "applyFindingPolicy").mockImplementation(
				async (options) => {
					const decisions = await originalPolicy(options);
					entered.resolve();
					await release.promise;
					return decisions;
				},
			);
			restorers.push(() => policySpy.mockRestore());
			await app.command("on");
			const review = app.flush();
			await entered.promise;
			if (transition === "session") await app.switchSession();
			else if (transition === "dismiss")
				await app.command(`dismiss ${app.state().findings[0]?.key}`);
			else await app.command(transition);
			const stateBefore = app.state();
			const entriesBefore = app
				.entries()
				.filter(
					(entry) =>
						entry.type === "custom" &&
						[ENG_ADVISOR_CURSOR_TYPE, ENG_ADVISOR_FINDING_STATE_TYPE].includes(
							entry.customType,
						),
				).length;
			const deliveredBefore = app.delivered.length;
			stubReview(async () => {
				throw new Error("Subsequent review is outside this transition");
			});
			release.resolve();
			await review;
			expect(app.state()).toEqual(stateBefore);
			expect(
				app
					.entries()
					.filter(
						(entry) =>
							entry.type === "custom" &&
							[
								ENG_ADVISOR_CURSOR_TYPE,
								ENG_ADVISOR_FINDING_STATE_TYPE,
							].includes(entry.customType),
					).length,
			).toBe(entriesBefore);
			expect(app.delivered.length).toBe(deliveredBefore);
			if (transition === "dismiss")
				expect(app.state().findings[0]?.status).toBe("dismissed");
		} finally {
			await app.event("session_shutdown");
		}
	});
}
