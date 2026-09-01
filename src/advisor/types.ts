import type { AgentMessage } from "@oh-my-pi/pi-agent-core";

export const ENG_ADVISOR_CURSOR_TYPE = "dev.ajoslin.eng-advisor.cursor";
export const ENG_ADVISOR_STATE_TYPE = "dev.ajoslin.eng-advisor.state";
export const ENG_ADVISOR_FINDING_STATE_TYPE = "dev.ajoslin.eng-advisor.finding-state";
export const ENG_ADVISOR_MESSAGE_TYPE = "dev.ajoslin.eng-advisor.finding";
export const ENG_ADVISOR_VERSION = 2;
export const FINDING_CATEGORIES = [
	"correctness",
	"security",
	"type-contract",
	"lifecycle-concurrency",
	"performance",
	"boundary-case",
	"test-coverage",
	"architecture-standard",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export const TRANSCRIBED_OMP_VERSION = "18.1.0";
export type FindingSeverity = "nit" | "concern" | "blocker";
export type FindingStatus = "open" | "resolved" | "dismissed";

export interface EvidenceAnchor {
	source: string;
	locator: string;
	quote: string;
	claim: string;
}

export interface ProposedFinding {
	category: FindingCategory;
	resource: string;
	evidence: EvidenceAnchor[];
	note: string;
	severity: FindingSeverity;
	status: "open" | "resolved";
}

export interface DurableFinding extends Omit<ProposedFinding, "status"> {
	key: string;
	status: FindingStatus;
	evidenceDigest: string;
	firstSeenAt: number;
	lastSeenAt: number;
	lastEmittedAt: number;
	lastEmittedReview: number;
	occurrences: number;
}

export interface EngAdvisorState {
	version: typeof ENG_ADVISOR_VERSION;
	cursor: number;
	reviewSequence: number;
	prefixDigest: string;
	findings: DurableFinding[];
}

export interface EngAdvisorCardDetails {
	finding: DurableFinding;
	suppressedRepeats: number;
}

export interface ReviewBatch {
	messages: AgentMessage[];
	text: string;
	groundingText: Map<string, string>;
	wip: boolean;
	cursor: number;
}

export interface PolicyDecision {
	kind: "emit" | "suppress" | "resolve";
	finding: DurableFinding;
	reason?: string;
}
