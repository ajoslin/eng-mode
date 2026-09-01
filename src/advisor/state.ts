import { createHash } from "node:crypto";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { z } from "zod";
import { findingIdentityKey, normalizeFindingCategory } from "./finding-identity";
import {
	type DurableFinding,
	ENG_ADVISOR_CURSOR_TYPE,
	ENG_ADVISOR_FINDING_STATE_TYPE,
	ENG_ADVISOR_STATE_TYPE,
	ENG_ADVISOR_VERSION,
	type EngAdvisorState,
} from "./types";

const EvidenceSchema = z.object({
	source: z.string(),
	locator: z.string(),
	quote: z.string(),
	claim: z.string(),
});

const FindingSchema = z.object({
	key: z.string(),
	category: z.string(),
	resource: z.string(),
	evidence: z.array(EvidenceSchema),
	note: z.string(),
	severity: z.enum(["nit", "concern", "blocker"]),
	status: z.enum(["open", "resolved", "dismissed"]),
	evidenceDigest: z.string(),
	firstSeenAt: z.number(),
	lastSeenAt: z.number(),
	lastEmittedAt: z.number(),
	lastEmittedReview: z.number(),
	occurrences: z.number(),
});

const PersistedVersionSchema = z.union([z.literal(1), z.literal(ENG_ADVISOR_VERSION)]);

const StateSchema = z.object({
	version: PersistedVersionSchema,
	cursor: z.number().int().min(0),
	reviewSequence: z.number().int().min(0),
	prefixDigest: z.string(),
	findings: z.array(FindingSchema),
});

const CursorSchema = z.object({
	version: PersistedVersionSchema,
	cursor: z.number().int().min(0),
	reviewSequence: z.number().int().min(0),
	prefixDigest: z.string(),
});

const FindingUpdateSchema = z.object({
	version: PersistedVersionSchema,
	finding: FindingSchema,
});

function migrateFinding(finding: z.infer<typeof FindingSchema>): DurableFinding {
	const migrated = { ...finding, category: normalizeFindingCategory(finding.category) };
	return { ...migrated, key: findingIdentityKey(migrated) };
}

function migrateState(persisted: z.infer<typeof StateSchema>): EngAdvisorState {
	return {
		...persisted,
		version: ENG_ADVISOR_VERSION,
		findings: persisted.findings.map(migrateFinding),
	};
}

export function messageEntries(branch: SessionEntry[]): Extract<SessionEntry, { type: "message" }>[] {
	return branch.filter((entry): entry is Extract<SessionEntry, { type: "message" }> => entry.type === "message");
}

export function digestMessagePrefix(entries: Extract<SessionEntry, { type: "message" }>[], cursor: number): string {
	const hash = createHash("sha256");
	for (const entry of entries.slice(0, Math.min(cursor, entries.length))) hash.update(`${entry.id}\n`);
	return hash.digest("hex");
}

export function restoreState(branch: SessionEntry[]): EngAdvisorState {
	let state: EngAdvisorState = {
		version: ENG_ADVISOR_VERSION,
		cursor: 0,
		reviewSequence: 0,
		prefixDigest: digestMessagePrefix([], 0),
		findings: [],
	};
	for (const entry of branch) {
		if (entry.type !== "custom") continue;
		if (entry.customType === ENG_ADVISOR_STATE_TYPE) {
			const parsed = StateSchema.safeParse(entry.data);
			if (parsed.success) state = migrateState(parsed.data);
		} else if (entry.customType === ENG_ADVISOR_FINDING_STATE_TYPE) {
			const parsed = FindingUpdateSchema.safeParse(entry.data);
			if (parsed.success) {
				const finding = migrateFinding(parsed.data.finding);
				const index = state.findings.findIndex(existing => existing.key === finding.key);
				if (index === -1) state.findings.push(finding);
				else state.findings[index] = finding;
			}
		} else if (entry.customType === ENG_ADVISOR_CURSOR_TYPE) {
			const parsed = CursorSchema.safeParse(entry.data);
			if (parsed.success) {
				state.cursor = parsed.data.cursor;
				state.reviewSequence = parsed.data.reviewSequence;
				state.prefixDigest = parsed.data.prefixDigest;
			}
		}
	}
	const messages = messageEntries(branch);
	if (state.cursor > messages.length || digestMessagePrefix(messages, state.cursor) !== state.prefixDigest) {
		state.cursor = 0;
		state.prefixDigest = digestMessagePrefix(messages, 0);
	}
	return state;
}

export function cursorSnapshot(state: EngAdvisorState): Omit<EngAdvisorState, "findings"> {
	return {
		version: state.version,
		cursor: state.cursor,
		reviewSequence: state.reviewSequence,
		prefixDigest: state.prefixDigest,
	};
}
