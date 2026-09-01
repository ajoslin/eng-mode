import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CompiledEngAdvisorConfig } from "./config";
import { digestFindingValue, findingIdentityKey, normalizeFindingValue } from "./finding-identity";
import type {
	DurableFinding,
	EngAdvisorState,
	EvidenceAnchor,
	FindingSeverity,
	PolicyDecision,
	ProposedFinding,
	ReviewBatch,
} from "./types";

const CONTENT_FREE_NOTES: Record<string, true> = {
	stop: true,
	done: true,
	complete: true,
	finished: true,
	ok: true,
	okay: true,
	lgtm: true,
	continue: true,
	"looks good": true,
	"all good": true,
	"no issue": true,
	"no issues": true,
	"no concerns": true,
	"nothing to add": true,
	"nothing to flag": true,
	"nothing to report": true,
	"on track": true,
};

const SEVERITY_RANK: Record<FindingSeverity, number> = { nit: 1, concern: 2, blocker: 3 };

function evidenceDigest(evidence: EvidenceAnchor[]): string {
	const stable = evidence
		.map(item =>
			[normalizeFindingValue(item.source), normalizeFindingValue(item.locator), item.quote.trim()].join("\u001e"),
		)
		.sort()
		.join("\u001f");
	return digestFindingValue(stable);
}

function outputBlocked(finding: ProposedFinding, config: CompiledEngAdvisorConfig): boolean {
	const evidenceText = finding.evidence
		.map(item => `${item.source}\n${item.locator}\n${item.quote}\n${item.claim}`)
		.join("\n");
	const text = `${finding.category}\n${finding.resource}\n${finding.note}\n${evidenceText}`.slice(
		0,
		config.maxFieldChars,
	);
	return config.ignoredOutputRegexes.some(pattern => pattern.test(text));
}

function contentFree(note: string): boolean {
	const key = note
		.toLowerCase()
		.normalize("NFKC")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
	return key.length === 0 || CONTENT_FREE_NOTES[key] === true;
}

function repositoryLocator(locator: string): { file: string; line: number } | null {
	const match = /^(.*):(\d+)(?:-\d+)?$/u.exec(locator);
	const file = match?.[1];
	const lineText = match?.[2];
	if (!file || !lineText) return null;
	const line = Number.parseInt(lineText, 10);
	return Number.isSafeInteger(line) && line > 0 ? { file, line } : null;
}

async function validatesEvidence(
	evidence: EvidenceAnchor,
	batch: ReviewBatch,
	cwd: string,
	maxFieldChars: number,
): Promise<boolean> {
	const quote = evidence.quote.trim();
	if (!quote || quote.length > 2_048) return false;
	if (evidence.source === "transcript") {
		const source = batch.groundingText.get(evidence.locator);
		return source?.includes(quote) ?? false;
	}
	if (evidence.source !== "repository") return false;
	const locator = repositoryLocator(evidence.locator);
	if (!locator) return false;
	const absolute = path.resolve(cwd, locator.file);
	let realRoot: string;
	let realSource: string;
	try {
		[realRoot, realSource] = await Promise.all([fs.realpath(cwd), fs.realpath(absolute)]);
	} catch {
		return false;
	}
	const relative = path.relative(realRoot, realSource);
	if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
	let source: string;
	try {
		source = await fs.readFile(realSource, "utf8");
	} catch {
		return false;
	}
	if (source.length > 1_048_576) return false;
	const lines = source.split("\n");
	const from = Math.max(0, locator.line - 4);
	const to = Math.min(lines.length, locator.line + 3);
	return lines.slice(from, to).join("\n").slice(0, maxFieldChars).includes(quote);
}

async function validatesFinding(
	finding: ProposedFinding,
	batch: ReviewBatch,
	config: CompiledEngAdvisorConfig,
	cwd: string,
): Promise<boolean> {
	if (contentFree(finding.note) || outputBlocked(finding, config)) return false;
	if (!finding.evidence.some(evidence => evidence.source === "repository")) return false;
	for (const evidence of finding.evidence) {
		if (!(await validatesEvidence(evidence, batch, cwd, config.maxFieldChars))) return false;
	}
	return true;
}

function durableFinding(proposal: ProposedFinding, sequence: number, now: number): DurableFinding {
	return {
		...proposal,
		key: findingIdentityKey(proposal),
		evidenceDigest: evidenceDigest(proposal.evidence),
		firstSeenAt: now,
		lastSeenAt: now,
		lastEmittedAt: 0,
		lastEmittedReview: sequence,
		occurrences: 1,
	};
}

export async function applyFindingPolicy(options: {
	state: EngAdvisorState;
	proposals: ProposedFinding[];
	batch: ReviewBatch;
	config: CompiledEngAdvisorConfig;
	cwd: string;
	now?: number;
	force?: boolean;
}): Promise<PolicyDecision[]> {
	const now = options.now ?? Date.now();
	const decisions: PolicyDecision[] = [];
	const byKey = new Map(options.state.findings.map(finding => [finding.key, finding]));
	for (const proposal of options.proposals) {
		if (options.batch.wip && proposal.severity !== "blocker") continue;
		if (!(await validatesFinding(proposal, options.batch, options.config, options.cwd))) continue;
		const candidate = durableFinding(proposal, options.state.reviewSequence, now);
		const existing = byKey.get(candidate.key);
		if (!existing) {
			if (proposal.status === "resolved") continue;
			candidate.lastEmittedAt = now;
			options.state.findings.push(candidate);
			byKey.set(candidate.key, candidate);
			decisions.push({ kind: "emit", finding: candidate });
			continue;
		}
		existing.lastSeenAt = now;
		existing.occurrences++;
		if (proposal.status === "resolved") {
			existing.status = "resolved";
			existing.evidence = proposal.evidence;
			existing.evidenceDigest = candidate.evidenceDigest;
			decisions.push({ kind: "resolve", finding: existing });
			continue;
		}
		const reopened = existing.status === "resolved";
		const changedEvidence = existing.evidenceDigest !== candidate.evidenceDigest;
		if (existing.status === "dismissed" && !changedEvidence) {
			decisions.push({ kind: "suppress", finding: existing, reason: "dismissed" });
			continue;
		}
		const escalated = SEVERITY_RANK[proposal.severity] > SEVERITY_RANK[existing.severity];
		const withinTime = now - existing.lastEmittedAt < options.config.cooldownMs;
		const withinReviews = options.state.reviewSequence - existing.lastEmittedReview < options.config.cooldownReviews;
		if (!reopened && !changedEvidence && !escalated && !options.force) {
			decisions.push({ kind: "suppress", finding: existing, reason: "unchanged" });
			continue;
		}
		Object.assign(existing, proposal, {
			status: "open",
			evidenceDigest: candidate.evidenceDigest,
		});
		if (!reopened && !options.force && !escalated && withinTime && withinReviews) {
			decisions.push({ kind: "suppress", finding: existing, reason: "cooldown" });
			continue;
		}
		existing.lastEmittedAt = now;
		existing.lastEmittedReview = options.state.reviewSequence;
		decisions.push({ kind: "emit", finding: existing });
	}
	return decisions;
}
