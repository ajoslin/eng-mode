import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { agentNames } from "../manifest";
import type { AgentName } from "../manifest";

export type AdvisorRole =
	| { readonly kind: "main" }
	| { readonly kind: "shipped"; readonly agent: AgentName }
	| { readonly kind: "unknown"; readonly agent: string };

export interface AdvisorRoleInstructions {
	readonly role: AdvisorRole;
	readonly text: string;
	readonly sources: readonly string[];
}

const agentNameSet: ReadonlySet<string> = new Set(agentNames);
const SAFE_ROLE_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function isAgentName(value: string): value is AgentName {
	return agentNameSet.has(value);
}

async function readPrompt(file: string, required: boolean): Promise<string | null> {
	try {
		const content = (await fs.readFile(file, "utf8")).trim();
		if (content) return content;
		if (required) throw new Error(`Eng-Advisor role prompt is empty: ${file}`);
		return null;
	} catch (error) {
		if (!required && error instanceof Error && "code" in error && error.code === "ENOENT") return null;
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

function repositoryPromptNames(role: AdvisorRole): readonly string[] {
	if (role.kind === "main") return ["main.md"];
	if (role.kind === "shipped") return [`${role.agent}.md`];
	return SAFE_ROLE_NAME.test(role.agent) ? ["unknown.md", `${role.agent}.md`] : ["unknown.md"];
}

export function resolveAdvisorRole(entries: readonly SessionEntry[]): AdvisorRole {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.type !== "session_init") continue;
		if (entry.agent === undefined) return { kind: "main" };
		if (isAgentName(entry.agent)) return { kind: "shipped", agent: entry.agent };
		return { kind: "unknown", agent: entry.agent };
	}
	return { kind: "main" };
}

export function advisorRoleLabel(role: AdvisorRole): string {
	if (role.kind === "main") return "main";
	return role.agent;
}

export async function loadAdvisorRoleInstructions(options: {
	readonly extensionRoot: string;
	readonly cwd: string;
	readonly role: AdvisorRole;
}): Promise<AdvisorRoleInstructions> {
	const packageName = options.role.kind === "main"
		? "main.md"
		: options.role.kind === "shipped"
			? `${options.role.agent}.md`
			: "unknown.md";
	const packageFile = path.join(options.extensionRoot, ".eng-advisor", packageName);
	const repositoryFiles = ancestors(options.cwd).flatMap(directory =>
		repositoryPromptNames(options.role).map(fileName => path.join(directory, ".eng-advisor", fileName)),
	);
	const sections: string[] = [];
	const sources: string[] = [];
	const packagePrompt = await readPrompt(packageFile, true);
	if (packagePrompt) {
		sections.push(packagePrompt);
		sources.push(packageFile);
	}
	for (const file of repositoryFiles) {
		if (path.resolve(file) === path.resolve(packageFile)) continue;
		const prompt = await readPrompt(file, false);
		if (!prompt) continue;
		sections.push(prompt);
		sources.push(file);
	}
	return { role: options.role, text: sections.join("\n\n"), sources };
}
