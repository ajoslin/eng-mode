import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentTool } from "@oh-my-pi/pi-agent-core";
import type { AdvisorExtensionAPI } from "./index";
import { RE2JS } from "re2js";

const MAX_READ_CHARS = 64 * 1024;
const MAX_READ_LINES = 200;
const MAX_SOURCE_BYTES = 1_048_576;
const MAX_GLOB_RESULTS = 200;
const MAX_GREP_FILES = 200;
const MAX_GREP_MATCHES = 100;
const GLOB_META = /[*?{[]/u;

interface WorkspaceFile {
	absolute: string;
	relative: string;
	size: number;
}

interface GrepOptions {
	pattern: string;
	path?: string | undefined;
	case?: boolean | undefined;
}

interface GlobOptions {
	path: string;
	hidden?: boolean | undefined;
	limit?: number | undefined;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

function safeRelativePattern(input: string): string {
	const normalized = input.replaceAll("\\", "/").replace(/^\.\//u, "");
	if (!normalized || path.isAbsolute(normalized) || normalized.split("/").includes("..")) {
		throw new Error("path must stay inside the working directory");
	}
	return normalized;
}

function parseReadTarget(input: string): { file: string; from: number; to: number } {
	const match = /^(.*):(\d+)(?:-(\d+))?$/u.exec(input);
	const file = match?.[1];
	const fromText = match?.[2];
	if (!file || !fromText) return { file: input, from: 1, to: MAX_READ_LINES };
	const from = Math.max(1, Number.parseInt(fromText, 10));
	const requestedTo = match[3] ? Number.parseInt(match[3], 10) : from + MAX_READ_LINES - 1;
	return { file, from, to: Math.max(from, Math.min(requestedTo, from + MAX_READ_LINES - 1)) };
}

export class WorkspaceInspector {
	readonly #root: Promise<string>;

	constructor(cwd: string) {
		this.#root = fs.realpath(cwd);
	}

	async #resolveFile(input: string): Promise<WorkspaceFile> {
		const relative = safeRelativePattern(input);
		const root = await this.#root;
		const absolute = await fs.realpath(path.resolve(root, relative));
		const resolvedRelative = path.relative(root, absolute);
		if (!resolvedRelative || resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) {
			throw new Error("path resolves outside the working directory");
		}
		const stat = await fs.stat(absolute);
		if (!stat.isFile()) throw new Error("path is not a file");
		return { absolute, relative: resolvedRelative, size: stat.size };
	}

	async #candidateFiles(input: string | undefined, signal?: AbortSignal): Promise<string[]> {
		const pattern = safeRelativePattern(input?.trim() || "**/*");
		const root = await this.#root;
		let scanPattern = pattern;
		if (!GLOB_META.test(pattern)) {
			try {
				const absolute = await fs.realpath(path.resolve(root, pattern));
				const stat = await fs.stat(absolute);
				if (stat.isFile()) return [(await this.#resolveFile(pattern)).relative];
				if (stat.isDirectory()) scanPattern = `${pattern.replace(/\/$/u, "")}/**/*`;
			} catch {
				throwIfAborted(signal);
			}
		}
		const paths: string[] = [];
		for await (const entry of new Bun.Glob(scanPattern).scan({
			cwd: root,
			dot: false,
			onlyFiles: true,
			followSymlinks: false,
		})) {
			throwIfAborted(signal);
			if (entry.split("/").some(part => part === ".git" || part === "node_modules")) continue;
			paths.push(entry);
			if (paths.length >= MAX_GREP_FILES) break;
		}
		return paths;
	}

	async read(input: string, signal?: AbortSignal): Promise<string> {
		throwIfAborted(signal);
		const target = parseReadTarget(input);
		const resolved = await this.#resolveFile(target.file);
		if (resolved.size > MAX_SOURCE_BYTES) throw new Error("file exceeds 1 MiB");
		const source = await fs.readFile(resolved.absolute, "utf8");
		throwIfAborted(signal);
		if (source.includes("\0")) throw new Error("binary files are not supported");
		const lines = source.split("\n");
		const to = Math.min(lines.length, target.to);
		const body = lines
			.slice(target.from - 1, to)
			.map((line, index) => `${target.from + index}:${line}`)
			.join("\n")
			.slice(0, MAX_READ_CHARS);
		return `[${resolved.relative}]\n${body}`;
	}

	async grep(options: GrepOptions, signal?: AbortSignal): Promise<string[]> {
		throwIfAborted(signal);
		if (options.pattern.length > 512) throw new Error("pattern exceeds 512 characters");
		const regex = RE2JS.compile(options.pattern, options.case ? 0 : RE2JS.CASE_INSENSITIVE);
		const matches: string[] = [];
		for (const file of await this.#candidateFiles(options.path, signal)) {
			throwIfAborted(signal);
			try {
				const resolved = await this.#resolveFile(file);
				if (resolved.size > MAX_SOURCE_BYTES) continue;
				const source = await fs.readFile(resolved.absolute, "utf8");
				throwIfAborted(signal);
				if (source.includes("\0")) continue;
				for (const [index, line] of source.split("\n").entries()) {
					if (!regex.test(line)) continue;
					matches.push(`${resolved.relative}:${index + 1}:${line}`);
					if (matches.length >= MAX_GREP_MATCHES) break;
				}
			} catch {
				throwIfAborted(signal);
			}
			if (matches.length >= MAX_GREP_MATCHES) break;
		}
		return matches;
	}

	async glob(options: GlobOptions, signal?: AbortSignal): Promise<string[]> {
		throwIfAborted(signal);
		const pattern = safeRelativePattern(options.path);
		const root = await this.#root;
		const limit = Math.min(options.limit ?? MAX_GLOB_RESULTS, MAX_GLOB_RESULTS);
		const matches: string[] = [];
		for await (const entry of new Bun.Glob(pattern).scan({
			cwd: root,
			dot: options.hidden ?? false,
			followSymlinks: false,
		})) {
			throwIfAborted(signal);
			if (entry.split("/").some(part => part === ".git" || part === "node_modules")) continue;
			matches.push(entry);
			if (matches.length >= limit) break;
		}
		return matches;
	}
}

export function createInspectionTools(pi: AdvisorExtensionAPI, cwd: string): AgentTool[] {
	const inspector = new WorkspaceInspector(cwd);
	const readParameters = pi.zod.object({ path: pi.zod.string() });
	const grepParameters = pi.zod.object({
		pattern: pi.zod.string(),
		path: pi.zod.string().optional(),
		case: pi.zod.boolean().optional(),
	});
	const globParameters = pi.zod.object({
		path: pi.zod.string(),
		hidden: pi.zod.boolean().optional(),
		limit: pi.zod.number().int().positive().max(MAX_GLOB_RESULTS).optional(),
	});
	const readTool: AgentTool<typeof readParameters> = {
		name: "read",
		label: "Read",
		description: "Read a workspace-relative source file. Append :line or :line-line for a bounded range.",
		parameters: readParameters,
		intent: "omit",
		async execute(_id, params, signal) {
			try {
				return { content: [{ type: "text", text: await inspector.read(params.path, signal) }] };
			} catch (error) {
				return {
					content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
					isError: true,
				};
			}
		},
	};
	const grepTool: AgentTool<typeof grepParameters> = {
		name: "grep",
		label: "Grep",
		description: "Search bounded workspace source text with a linear-time RE2 pattern.",
		parameters: grepParameters,
		intent: "omit",
		async execute(_id, params, signal) {
			try {
				const matches = await inspector.grep(params, signal);
				return {
					content: [{ type: "text", text: matches.join("\n") || "No matches" }],
					useless: matches.length === 0,
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
					isError: true,
				};
			}
		},
	};
	const globTool: AgentTool<typeof globParameters> = {
		name: "glob",
		label: "Glob",
		description: "List paths matching a workspace-relative glob without following symlinks.",
		parameters: globParameters,
		intent: "omit",
		async execute(_id, params, signal) {
			try {
				const matches = await inspector.glob(params, signal);
				return {
					content: [{ type: "text", text: matches.join("\n") || "No matches" }],
					useless: matches.length === 0,
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
					isError: true,
				};
			}
		},
	};
	return [readTool, grepTool, globTool];
}
