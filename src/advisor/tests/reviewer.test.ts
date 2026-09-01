import { describe, expect, test } from "bun:test";
import { zod } from "@oh-my-pi/pi-coding-agent";
import { createFindingReporter } from "../finding-reporter";

const firstReport = [
	{
		category: "type-contract" as const,
		resource: "src/example.ts",
		evidence: [
			{
				source: "repository" as const,
				locator: "src/example.ts:1",
				quote: "const value = externalValue;",
				claim: "The external value is accepted without validation.",
			},
		],
		note: "Validate the external value before accepting it.",
		severity: "concern" as const,
		status: "open" as const,
	},
];

describe("finding reporter", () => {
	test("keeps the first valid report when the model calls the tool again", async () => {
		const reporter = createFindingReporter({ zod });
		reporter.begin();

		const accepted = await reporter.tool.execute("first", { findings: firstReport });
		const duplicate = await reporter.tool.execute("duplicate", { findings: [{ ...firstReport[0], note: "A different finding." }] });

		expect(accepted.isError).not.toBe(true);
		expect(duplicate.isError).toBe(true);
		expect(reporter.take()).toEqual(firstReport);
	});

	test("makes the report tool mandatory when the inspection budget is exhausted", () => {
		const reporter = createFindingReporter({ zod });
		reporter.begin();

		expect(reporter.requirement()).toMatchObject({ soft: true, toolName: "report_findings" });
		expect(reporter.requirement(true)).toEqual({ type: "function", name: "report_findings" });
	});
});
