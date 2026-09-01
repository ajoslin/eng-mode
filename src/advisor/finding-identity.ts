import { createHash } from "node:crypto";
import { FINDING_CATEGORIES, type FindingCategory, type ProposedFinding } from "./types";

export function normalizeFindingValue(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKC")
		.replace(/[^\p{L}\p{N}./#:_-]+/gu, " ")
		.trim();
}

export function digestFindingValue(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function normalizeFindingCategory(value: string): FindingCategory {
	const normalized = normalizeFindingValue(value);
	if ((FINDING_CATEGORIES as readonly string[]).includes(normalized)) return normalized as FindingCategory;
	if (/security|credential|auth|injection|vulnerab/u.test(normalized)) return "security";
	if (/type|contract|api/u.test(normalized)) return "type-contract";
	if (/lifecycle|concurr|race|resource|leak/u.test(normalized)) return "lifecycle-concurrency";
	if (/performance|latency|throughput|allocation/u.test(normalized)) return "performance";
	if (/boundary|edge|error|failure/u.test(normalized)) return "boundary-case";
	if (/test|coverage|verification/u.test(normalized)) return "test-coverage";
	if (/architecture|standard|pattern|layer/u.test(normalized)) return "architecture-standard";
	return "correctness";
}

export function findingIdentityKey(finding: Pick<ProposedFinding, "category" | "evidence">): string {
	const repositoryTargets = finding.evidence
		.filter(item => item.source === "repository")
		.map(item => normalizeFindingValue(item.locator))
		.sort()
		.join("\u001e");
	return digestFindingValue(`${normalizeFindingValue(finding.category)}\u001f${repositoryTargets}`);
}
