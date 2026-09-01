import { describe, expect, test } from "bun:test";
import type { Model } from "@oh-my-pi/pi-ai";
import { zod } from "@oh-my-pi/pi-coding-agent";
import { advisorCredentialOptions } from "../reviewer";
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

test("routes child agent credentials through the parent model registry", async () => {
	const model = { provider: "openrouter", id: "advisor-model" } as Model;
	const credential = () => "oauth-token";
	const calls: Array<{ model: Model; sessionId: string | undefined }> = [];
	const options = advisorCredentialOptions(
		{
			resolver: (requestModel: Model, sessionId?: string) => {
				calls.push({ model: requestModel, sessionId });
				return credential;
			},
		},
		"primary-eng-advisor",
	);

	expect(options.getApiKey).toBeDefined();
	expect(await options.getApiKey?.(model)).toBe(credential);
	expect(calls).toEqual([{ model, sessionId: "primary-eng-advisor" }]);
});

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
