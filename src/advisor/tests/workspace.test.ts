import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceInspector } from "../workspace";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "eng-advisor-inspection-"));
	roots.push(root);
	return root;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("workspace inspection boundary", () => {
	test("reads requested high line ranges instead of truncating from the file head", async () => {
		const root = await tempRoot();
		await writeFile(
			join(root, "source.ts"),
			Array.from({ length: 300 }, (_, index) => `line-${index + 1}`).join("\n"),
		);
		const output = await new WorkspaceInspector(root).read("source.ts:250-251");
		expect(output).toContain("250:line-250");
		expect(output).toContain("251:line-251");
		expect(output).not.toContain("1:line-1\n");
	});

	test("rejects traversal and symlink escapes", async () => {
		const root = await tempRoot();
		const outside = await tempRoot();
		await writeFile(join(outside, "secret.txt"), "outside");
		await symlink(join(outside, "secret.txt"), join(root, "escape.txt"));
		const inspector = new WorkspaceInspector(root);
		expect(inspector.read("../secret.txt")).rejects.toThrow("path must stay inside");
		expect(inspector.read("escape.txt")).rejects.toThrow("path resolves outside");
	});

	test("searches case-insensitively by default and respects explicit glob limits", async () => {
		const root = await tempRoot();
		await writeFile(join(root, "alpha.ts"), "const CriticalValue = 1;\n");
		await writeFile(join(root, "beta.ts"), "const other = 2;\n");
		const inspector = new WorkspaceInspector(root);
		expect(await inspector.grep({ pattern: "criticalvalue", path: "*.ts" })).toEqual([
			"alpha.ts:1:const CriticalValue = 1;",
		]);
		expect(await inspector.glob({ path: "*.ts", limit: 1 })).toHaveLength(1);
	});

	test("stops scans when aborted", async () => {
		const root = await tempRoot();
		await writeFile(join(root, "source.ts"), "content\n");
		const controller = new AbortController();
		controller.abort("cancelled");
		expect(new WorkspaceInspector(root).grep({ pattern: "content" }, controller.signal)).rejects.toBe("cancelled");
	});
});
