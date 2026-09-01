import * as fs from "node:fs/promises";
import * as path from "node:path";

async function readIfPresent(file: string): Promise<string | null> {
	try {
		const content = (await fs.readFile(file, "utf8")).trim();
		return content ? `## ${file}\n${content}` : null;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
}

function ancestors(cwd: string): string[] {
	const result: string[] = [];
	let current = path.resolve(cwd);
	while (true) {
		result.push(current);
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return result.reverse();
}

export async function collectWatchdogInstructions(extensionDir: string, agentDir: string, cwd: string): Promise<string> {
	const candidates = [
		path.resolve(extensionDir, "..", "..", "WATCHDOG.md"),
		path.join(agentDir, "WATCHDOG.md"),
		...ancestors(cwd).flatMap(directory => [
			path.join(directory, "WATCHDOG.md"),
			path.join(directory, ".omp", "WATCHDOG.md"),
		]),
	];
	const unique = [...new Set(candidates.map(candidate => path.resolve(candidate)))];
	const sections = await Promise.all(unique.map(readIfPresent));
	return sections.filter((section): section is string => section !== null).join("\n\n");
}
