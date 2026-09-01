import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { agentNames } from "../../manifest";
import {
	advisorRoleLabel,
	loadAdvisorRoleInstructions,
	resolveAdvisorRole,
} from "../role-prompts";

const roots: string[] = [];
const extensionRoot = path.resolve(import.meta.dir, "../../..");

afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

function sessionInit(agent?: string): SessionEntry {
	return {
		type: "session_init",
		id: `init-${agent ?? "main"}`,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		systemPrompt: "",
		task: "",
		tools: [],
		...(agent === undefined ? {} : { agent }),
	};
}

async function workspace(): Promise<string> {
	const root = await fs.mkdtemp(path.join(tmpdir(), "eng-advisor-role-"));
	roots.push(root);
	const cwd = path.join(root, "project", "package");
	await fs.mkdir(cwd, { recursive: true });
	return cwd;
}

describe("advisor role prompts", () => {
	test("resolves every shipped agent from authoritative session metadata", () => {
		for (const agent of agentNames) {
			const role = resolveAdvisorRole([sessionInit(agent)]);
			expect(role).toEqual({ kind: "shipped", agent });
			expect(advisorRoleLabel(role)).toBe(agent);
		}
	});

	test("uses the latest branch-local session initialization", () => {
		expect(resolveAdvisorRole([sessionInit("implementation-agent"), sessionInit("comment-sicko")])).toEqual({
			kind: "shipped",
			agent: "comment-sicko",
		});
	});

	test("loads a distinct shipped default for every role", async () => {
		const cwd = await workspace();
		const expected = {
			"implementation-agent": "precisely scoped implementation brief",
			"judgment-agent": "concurrency-heavy",
			"comment-sicko": "MUST KILL, KEEP, or RESHAPE",
			"panel-opus": "independent high-judgment risks",
			"panel-sol": "concrete failure paths",
			"panel-fable": "stated design story",
			"panel-grok": "unusual edge cases",
		} as const;

		for (const agent of agentNames) {
			const loaded = await loadAdvisorRoleInstructions({ extensionRoot, cwd, role: { kind: "shipped", agent } });
			expect(loaded.text).toContain(expected[agent]);
			expect(loaded.sources).toEqual([path.join(extensionRoot, ".eng-advisor", `${agent}.md`)]);
		}
	});

	test("layers repository prompts from ancestor to workspace after the shipped default", async () => {
		const cwd = await workspace();
		const root = path.dirname(path.dirname(cwd));
		const project = path.dirname(cwd);
		await fs.mkdir(path.join(root, ".eng-advisor"));
		await fs.mkdir(path.join(project, ".eng-advisor"));
		await fs.mkdir(path.join(cwd, ".eng-advisor"));
		await fs.writeFile(path.join(root, ".eng-advisor", "implementation-agent.md"), "root-override");
		await fs.writeFile(path.join(project, ".eng-advisor", "implementation-agent.md"), "project-override");
		await fs.writeFile(path.join(cwd, ".eng-advisor", "implementation-agent.md"), "workspace-override");

		const loaded = await loadAdvisorRoleInstructions({
			extensionRoot,
			cwd,
			role: { kind: "shipped", agent: "implementation-agent" },
		});
		expect(loaded.text.indexOf("precisely scoped")).toBeLessThan(loaded.text.indexOf("root-override"));
		expect(loaded.text.indexOf("root-override")).toBeLessThan(loaded.text.indexOf("project-override"));
		expect(loaded.text.indexOf("project-override")).toBeLessThan(loaded.text.indexOf("workspace-override"));
		expect(loaded.sources).toHaveLength(4);
	});

	test("uses custom files only for safe unknown role names", async () => {
		const cwd = await workspace();
		await fs.mkdir(path.join(cwd, ".eng-advisor"));
		await fs.writeFile(path.join(cwd, ".eng-advisor", "third-party-agent.md"), "custom-role-guidance");
		await fs.writeFile(path.join(cwd, ".eng-advisor", "unknown.md"), "unsafe-role-guidance");
		const safeRole = resolveAdvisorRole([sessionInit("third-party-agent")]);
		const unsafeRole = resolveAdvisorRole([sessionInit("../../escape")]);
		const safe = await loadAdvisorRoleInstructions({ extensionRoot, cwd, role: safeRole });
		const unsafe = await loadAdvisorRoleInstructions({ extensionRoot, cwd, role: unsafeRole });
		expect(safe.text).toContain("does not recognize");
		expect(safe.text).toContain("unsafe-role-guidance");
		expect(safe.text).toContain("custom-role-guidance");
		expect(safe.text.indexOf("unsafe-role-guidance")).toBeLessThan(safe.text.indexOf("custom-role-guidance"));
		expect(unsafe.text).toContain("unsafe-role-guidance");
		expect(unsafe.text).not.toContain("../../escape");
		expect(advisorRoleLabel(unsafeRole)).toBe("../../escape");
	});

	test("loads main and unknown fallbacks", async () => {
		const cwd = await workspace();
		const main = await loadAdvisorRoleInstructions({ extensionRoot, cwd, role: resolveAdvisorRole([]) });
		const unknown = await loadAdvisorRoleInstructions({
			extensionRoot,
			cwd,
			role: resolveAdvisorRole([sessionInit("third-party-agent")]),
		});
		expect(main.text).toContain("owns the user's request end to end");
		expect(unknown.text).toContain("does not recognize");
		expect(unknown.text).not.toContain("third-party-agent");
	});
});
