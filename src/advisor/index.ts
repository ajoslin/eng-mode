import * as path from "node:path";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import type { ExtensionAPI as OmpExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { renderEngAdvisorCard } from "./card";
import { type CompiledEngAdvisorConfig, loadEngAdvisorConfig } from "./config";
import { applyFindingPolicy } from "./policy";
import { filterReviewBatch } from "./transcript";
import { InProcessReviewer } from "./reviewer";
import {
	advisorRoleLabel,
	loadAdvisorRoleInstructions,
	resolveAdvisorRole,
	type AdvisorRole,
} from "./role-prompts";
import { cursorSnapshot, digestMessagePrefix, messageEntries, restoreState } from "./state";
import {
	ENG_ADVISOR_CURSOR_TYPE,
	ENG_ADVISOR_FINDING_STATE_TYPE,
	ENG_ADVISOR_MESSAGE_TYPE,
	ENG_ADVISOR_VERSION,
	type EngAdvisorCardDetails,
	type EngAdvisorState,
	type ProposedFinding,
	TRANSCRIBED_OMP_VERSION,
} from "./types";
import { collectWatchdogInstructions } from "./watchdog";

export type AdvisorExtensionAPI = Pick<
	OmpExtensionAPI,
	"appendEntry" | "on" | "pi" | "registerCommand" | "registerMessageRenderer" | "sendMessage" | "zod"
>;

const FAILURE_BACKOFF_MS = 60_000;

function isWorkInProgress(message: AgentMessage): boolean {
	return message.role === "assistant" && message.content.some(block => block.type === "toolCall");
}
export function advisorReviewIsDue(options: {
	turnsSinceReview: number;
	wip: boolean;
	reviewEveryTurns: number;
	reviewFinalAfterTurns: number;
	force?: boolean;
}): boolean {
	return (
		options.force === true ||
		options.turnsSinceReview >= options.reviewEveryTurns ||
		(!options.wip && options.turnsSinceReview >= options.reviewFinalAfterTurns)
	);
}

function openFindings(state: EngAdvisorState) {
	return state.findings.filter(finding => finding.status === "open");
}

function formatStatus(options: {
	enabled: boolean;
	running: boolean;
	state: EngAdvisorState;
	config: CompiledEngAdvisorConfig | undefined;
	role: AdvisorRole;
	roleSources: readonly string[];
	lastReviewAt: number;
	lastError: string | undefined;
}): string {
	const lines = [
		`Eng-Advisor: ${options.enabled ? "enabled" : "paused"}${options.running ? ", reviewing" : ""}`,
		`Runtime transcription: OMP ${TRANSCRIBED_OMP_VERSION}`,
		`Cursor: ${options.state.cursor}; reviews: ${options.state.reviewSequence}`,
		`Open findings: ${openFindings(options.state).length}`,
	];
	for (const source of options.roleSources) lines.push(`Role prompt: ${source}`);
	if (options.config) {
		lines.push(
			`Model: ${options.config.model}:${options.config.thinking}`,
			`Cooldown: ${options.config.cooldownMs}ms and ${options.config.cooldownReviews} reviews; timeout: ${options.config.reviewTimeoutMs}ms`,
			`Review cadence: every ${options.config.reviewEveryTurns} in-progress turns; completed after ${options.config.reviewFinalAfterTurns} turn(s)`,
		);
	}
	if (options.lastReviewAt) lines.push(`Last review: ${new Date(options.lastReviewAt).toISOString()}`);
	if (options.lastError) lines.push(`Last error: ${options.lastError}`);
	const findings = openFindings(options.state);
	for (const finding of findings.slice(0, 20)) {
		lines.push(`- ${finding.key.slice(0, 12)} [${finding.severity}] ${finding.note} (${finding.resource})`);
	}
	if (findings.length > 20) lines.push(`- ${findings.length - 20} more open findings`);
	return lines.join("\n");
}

export function registerEngAdvisor(pi: AdvisorExtensionAPI): void {
	let config: CompiledEngAdvisorConfig | undefined;
	let state: EngAdvisorState = {
		version: ENG_ADVISOR_VERSION,
		cursor: 0,
		reviewSequence: 0,
		prefixDigest: digestMessagePrefix([], 0),
		findings: [],
	};
	let enabled = true;
	let running = false;
	let scheduled = false;
	let pending = false;
	let latestWip = false;
	let turnsSinceReview = 0;
	let forceReview = false;
	let lastReviewAt = 0;
	let lastError: string | undefined;
	let failureUntil = 0;
	let forceReemit = false;
	let generation = 0;
	let queuedContext: ExtensionContext | undefined;
	let reviewAbort: AbortController | undefined;
	let reviewer: InProcessReviewer | undefined;
	let role: AdvisorRole = { kind: "main" };
	let roleSources: readonly string[] = [];
	const hiddenCallIds = new Set<string>();

	function persistCursor(): void {
		pi.appendEntry(ENG_ADVISOR_CURSOR_TYPE, cursorSnapshot(state));
	}

	function persistFinding(finding: EngAdvisorState["findings"][number]): void {
		pi.appendEntry(ENG_ADVISOR_FINDING_STATE_TYPE, {
			version: ENG_ADVISOR_VERSION,
			finding: structuredClone(finding),
		});
	}

	function deliverFinding(finding: EngAdvisorState["findings"][number]): void {
		const snapshot = structuredClone(finding);
		pi.sendMessage(
			{
				customType: ENG_ADVISOR_MESSAGE_TYPE,
				content: snapshot.note,
				display: true,
				details: {
					finding: snapshot,
					suppressedRepeats: Math.max(0, snapshot.occurrences - 1),
				} satisfies EngAdvisorCardDetails,
				attribution: "agent",
			},
			{ deliverAs: "nextTurn", triggerTurn: false },
		);
	}

	async function initialize(ctx: ExtensionContext): Promise<void> {
		const expectedGeneration = ++generation;
		reviewAbort?.abort();
		reviewer?.dispose();
		reviewer = undefined;
		queuedContext = ctx;
		state = restoreState(ctx.sessionManager.getBranch());
		hiddenCallIds.clear();
		turnsSinceReview = 0;
		forceReview = false;
		try {
			const nextConfig = await loadEngAdvisorConfig(import.meta.dir);
			const nextRole = resolveAdvisorRole(ctx.sessionManager.getBranch());
			const watchdog = await collectWatchdogInstructions(import.meta.dir, pi.pi.getAgentDir(), ctx.cwd);
			const roleInstructions = await loadAdvisorRoleInstructions({
				extensionRoot: path.resolve(import.meta.dir, "..", ".."),
				cwd: ctx.cwd,
				role: nextRole,
			});
			const nextInstructions = [watchdog, roleInstructions.text].filter(Boolean).join("\n\n");
			if (expectedGeneration !== generation) return;
			const nextReviewer = new InProcessReviewer({ pi, ctx, config: nextConfig, instructions: nextInstructions });
			if (expectedGeneration !== generation) {
				nextReviewer.dispose();
				return;
			}
			config = nextConfig;
			role = nextRole;
			roleSources = roleInstructions.sources;
			reviewer = nextReviewer;
			lastError = undefined;
		} catch (error) {
			if (expectedGeneration !== generation) return;
			enabled = false;
			lastError = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Eng-Advisor disabled: ${lastError}`, "error");
		}
	}

	async function reviewOnce(ctx: ExtensionContext, expectedGeneration: number): Promise<void> {
		if (!enabled || !config || !reviewer || Date.now() < failureUntil) return;
		const entries = messageEntries(ctx.sessionManager.getBranch());
		if (state.cursor > entries.length || digestMessagePrefix(entries, state.cursor) !== state.prefixDigest) {
			state.cursor = 0;
			state.prefixDigest = digestMessagePrefix(entries, 0);
		}
		const targetCursor = entries.length;
		if (targetCursor === state.cursor) return;
		const messages = entries.slice(state.cursor).map(entry => entry.message);
		const batch = filterReviewBatch(messages, state.cursor, latestWip, config, hiddenCallIds);
		if (!batch) {
			state.cursor = targetCursor;
			state.prefixDigest = digestMessagePrefix(entries, targetCursor);
			persistCursor();
			return;
		}
		const controller = new AbortController();
		reviewAbort = controller;
		const reviewTimeoutMs = config.reviewTimeoutMs;
		const timeout = setTimeout(
			() => controller.abort(new Error(`Eng-Advisor review exceeded ${reviewTimeoutMs}ms`)),
			reviewTimeoutMs,
		);
		const reviewedTurns = turnsSinceReview;
		let proposals: ProposedFinding[];
		try {
			proposals = await reviewer.review({
				batch,
				openFindings: openFindings(state),
				signal: controller.signal,
			});
		} finally {
			if (reviewAbort === controller) reviewAbort = undefined;
			clearTimeout(timeout);
		}
		if (expectedGeneration !== generation) return;
		state.reviewSequence++;
		const decisions = await applyFindingPolicy({
			state,
			proposals,
			batch,
			config,
			cwd: ctx.cwd,
			force: forceReemit,
		});
		forceReemit = false;
		state.cursor = targetCursor;
		state.prefixDigest = digestMessagePrefix(entries, targetCursor);
		lastReviewAt = Date.now();
		lastError = undefined;
		turnsSinceReview = Math.max(0, turnsSinceReview - reviewedTurns);
		persistCursor();
		for (const decision of decisions) {
			persistFinding(decision.finding);
			if (decision.kind === "emit") deliverFinding(decision.finding);
		}
	}

	async function drain(): Promise<void> {
		if (running) {
			pending = true;
			return;
		}
		running = true;
		try {
			do {
				pending = false;
				const ctx = queuedContext;
				if (!ctx) break;
				const expectedGeneration = generation;
				try {
					await reviewOnce(ctx, expectedGeneration);
				} catch (error) {
					if (expectedGeneration !== generation) continue;
					if (!enabled) continue;
					lastError = error instanceof Error ? error.message : String(error);
					failureUntil = Date.now() + FAILURE_BACKOFF_MS;
					ctx.ui.notify(`Eng-Advisor review failed; retrying after cooldown: ${lastError}`, "warning");
				}
			} while (pending && enabled);
		} finally {
			running = false;
		}
	}

	function schedule(ctx: ExtensionContext, wip: boolean, force = false): void {
		queuedContext = ctx;
		latestWip = wip;
		if (!enabled || !config) return;
		if (!force) turnsSinceReview++;
		forceReview ||= force;
		if (
			!advisorReviewIsDue({
				turnsSinceReview,
				wip,
				reviewEveryTurns: config.reviewEveryTurns,
				reviewFinalAfterTurns: config.reviewFinalAfterTurns,
				force: forceReview,
			})
		) {
			return;
		}
		forceReview = false;
		if (running) {
			pending = true;
			return;
		}
		if (scheduled) return;
		scheduled = true;
		ctx.setTimeout(async () => {
			scheduled = false;
			await drain();
		}, 0);
	}

	pi.registerMessageRenderer<EngAdvisorCardDetails>(ENG_ADVISOR_MESSAGE_TYPE, (message, _options, theme) => {
		const details = message.details;
		if (!details?.finding) return new pi.pi.Text(String(message.content), 1, 0);
		return renderEngAdvisorCard(details, theme);
	});

	pi.registerCommand("eng-advisor", {
		description: "Show, pause, refresh, reload, or dismiss Eng-Advisor findings",
		handler: async (args, ctx) => {
			const [command = "status", value] = args.trim().split(/\s+/, 2);
			if (command === "off") {
				enabled = false;
				generation++;
				reviewAbort?.abort("Eng-Advisor paused");
				ctx.ui.notify("Eng-Advisor paused", "info");
				return;
			}
			if (command === "on") {
				enabled = true;
				failureUntil = 0;
				if (!reviewer) await initialize(ctx);
				if (!reviewer) return;
				ctx.ui.notify("Eng-Advisor enabled", "info");
				schedule(ctx, false, true);
				return;
			}
			if (command === "reload") {
				const nextConfig = await loadEngAdvisorConfig(import.meta.dir);
				const nextRole = resolveAdvisorRole(ctx.sessionManager.getBranch());
				const watchdog = await collectWatchdogInstructions(import.meta.dir, pi.pi.getAgentDir(), ctx.cwd);
				const roleInstructions = await loadAdvisorRoleInstructions({
					extensionRoot: path.resolve(import.meta.dir, "..", ".."),
					cwd: ctx.cwd,
					role: nextRole,
				});
				const nextInstructions = [watchdog, roleInstructions.text].filter(Boolean).join("\n\n");
				const nextReviewer = new InProcessReviewer({
					pi,
					ctx,
					config: nextConfig,
					instructions: nextInstructions,
				});
				generation++;
				reviewAbort?.abort("Eng-Advisor reloading");
				roleSources = roleInstructions.sources;
				reviewer?.dispose();
				config = nextConfig;
				reviewer = nextReviewer;
				role = nextRole;
				failureUntil = 0;
				lastError = undefined;
				ctx.ui.notify("Eng-Advisor configuration reloaded", "info");
				schedule(ctx, false, true);
				return;
			}
			if (command === "dismiss") {
				const matches = state.findings.filter(
					finding => finding.status === "open" && value && finding.key.startsWith(value),
				);
				if (matches.length !== 1) {
					ctx.ui.notify(
						`Dismiss requires one unique open finding key prefix; matched ${matches.length}`,
						"warning",
					);
					return;
				}
				const finding = matches[0];
				if (!finding) return;
				finding.status = "dismissed";
				persistFinding(finding);
				ctx.ui.notify(`Dismissed ${finding.key.slice(0, 12)}`, "info");
				return;
			}
			if (command === "refresh") {
				const entries = messageEntries(ctx.sessionManager.getBranch());
				const retained = Math.max(0, entries.length - (config?.maxBatchMessages ?? 64));
				state.cursor = retained;
				state.prefixDigest = digestMessagePrefix(entries, retained);
				forceReemit = true;
				failureUntil = 0;
				schedule(ctx, false, true);
				ctx.ui.notify("Eng-Advisor refresh scheduled", "info");
				return;
			}
			if (command !== "status") {
				ctx.ui.notify(`Unknown Eng-Advisor command: ${command}`, "warning");
				return;
			}
			ctx.ui.notify(
				formatStatus({ enabled, running, state, config, role, roleSources, lastReviewAt, lastError }),
				lastError ? "warning" : "info",
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => initialize(ctx));
	pi.on("session_switch", async (_event, ctx) => initialize(ctx));
	pi.on("session_branch", async (_event, ctx) => initialize(ctx));
	pi.on("turn_end", (event, ctx) => schedule(ctx, isWorkInProgress(event.message)));
	pi.on("session_shutdown", () => {
		generation++;
		reviewAbort?.abort();
		reviewer?.dispose();
		reviewer = undefined;
		queuedContext = undefined;
		enabled = false;
	});
}
