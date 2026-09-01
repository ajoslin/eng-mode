import type { AgentTool, ToolChoiceDirective } from "@oh-my-pi/pi-agent-core";
import type { AdvisorExtensionAPI } from "./index";
import { FINDING_CATEGORIES, type ProposedFinding } from "./types";

export interface FindingReporter {
	tool: AgentTool;
	begin(): void;
	take(): ProposedFinding[];
	requirement(required?: boolean): ToolChoiceDirective | undefined;
}

type FindingReporterHost = Pick<AdvisorExtensionAPI, "zod">;

export function createFindingReporter(pi: FindingReporterHost): FindingReporter {
	const parameters = pi.zod.object({
		findings: pi.zod
			.array(
				pi.zod.object({
					category: pi.zod.enum(FINDING_CATEGORIES),
					resource: pi.zod.string().min(1).max(512),
					evidence: pi.zod
						.array(
							pi.zod.object({
								source: pi.zod.enum(["transcript", "repository"]),
								locator: pi.zod.string().min(1).max(512),
								quote: pi.zod.string().min(1).max(2_048),
								claim: pi.zod.string().min(1).max(2_048),
							}),
						)
						.min(1)
						.max(6),
					note: pi.zod.string().min(1).max(4_096),
					severity: pi.zod.enum(["nit", "concern", "blocker"]),
					status: pi.zod.enum(["open", "resolved"]),
				}),
			)
			.max(10),
	});
	let report: ProposedFinding[] | undefined;
	let requirementId = 0;
	const tool: AgentTool<typeof parameters> = {
		name: "report_findings",
		label: "Report findings",
		description:
			"Submit the complete structured result for this review exactly once. Use an empty findings array when there is nothing to report.",
		parameters,
		intent: "omit",
		async execute(_id, params) {
			const parsed = parameters.safeParse(params);
			if (!parsed.success) {
				return { content: [{ type: "text", text: parsed.error.message }], isError: true };
			}
			if (report !== undefined) {
				return {
					content: [{ type: "text", text: "Findings were already reported for this review." }],
					isError: true,
				};
			}
			report = parsed.data.findings;
			return { content: [{ type: "text", text: "Findings recorded. End the review." }] };
		},
	};
	return {
		tool,
		begin() {
			report = undefined;
			requirementId++;
		},
		take() {
			if (report === undefined) throw new Error("Eng-Advisor did not call report_findings");
			return report;
		},
		requirement(required?: true) {
			if (report !== undefined) return undefined;
			if (required) return { type: "function", name: "report_findings" };
			return {
				soft: true,
				id: `eng-advisor-report-${requirementId}`,
				toolName: "report_findings",
				reminder: [
					{
						role: "user",
						content: "You must conclude this review by calling report_findings now.",
						attribution: "agent",
						timestamp: Date.now(),
					},
				],
			};
		},
	};
}
