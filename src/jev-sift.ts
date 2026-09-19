import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDotenvKey, resolvePaths as resolveOmpPaths, type Paths as OmpPaths } from "./compact-adviser.ts";

export const serverName = "jev-sift";
export const repoUrl = "https://github.com/kbhuw/jev-sift.git";
export const pinnedCommit = "966de12e2bb5f94d47886ee51f30a07ec8ef1607";

export type KeySource = "env" | "keyfile" | ".env" | "missing";
export interface Paths extends OmpPaths {
  readonly installRoot: string;
  readonly mcpConfig: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Paths {
  const paths = resolveOmpPaths(env, cwd);
  return { ...paths, installRoot: join(paths.configRoot, serverName), mcpConfig: join(paths.agentDir, "mcp.json") };
}

function nonempty(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

function readOptional(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export function observeKeySource(paths: OmpPaths, env: NodeJS.ProcessEnv = process.env): KeySource {
  if (nonempty(env.JEV_API_KEY) || nonempty(env.TYPESAFE_API_KEY)) return "env";
  if (nonempty(readOptional(join(paths.home, ".config", serverName, "api-key")))) return "keyfile";
  for (const directory of [paths.cwd, paths.agentDir, paths.configRoot, paths.home]) {
    const text = readOptional(join(directory, ".env"));
    if (text !== undefined && (nonempty(parseDotenvKey(text, "JEV_API_KEY")) || nonempty(parseDotenvKey(text, "TYPESAFE_API_KEY")))) {
      return ".env";
    }
  }
  return "missing";
}

export interface Observation {
  readonly keySource: KeySource;
  readonly installed: boolean;
  readonly registered: boolean;
}

export type Action = "install" | "register" | "unregister";

export function decide(observation: Observation): readonly Action[] {
  if (observation.keySource === "missing") return observation.registered ? ["unregister"] : [];
  if (!observation.installed) return ["install", "register"];
  return observation.registered ? [] : ["register"];
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function parseConfig(text: string | undefined): Record<string, unknown> {
  if (text === undefined) return {};
  const parsed: unknown = JSON.parse(text);
  return object(parsed, "MCP config");
}

function servers(config: Record<string, unknown>): Record<string, unknown> {
  return Object.hasOwn(config, "mcpServers") ? object(config.mcpServers, "mcpServers") : {};
}

export function upsertMcpConfig(text: string | undefined, installRoot: string): string {
  const config = parseConfig(text);
  const entries = servers(config);
  entries[serverName] = { type: "stdio", command: "node", args: [join(installRoot, "dist", "server.mjs")] };
  return `${JSON.stringify({ ...config, mcpServers: entries }, null, 2)}\n`;
}

export function removeMcpConfig(text: string | undefined): string | undefined {
  const config = parseConfig(text);
  const entries = servers(config);
  if (!Object.hasOwn(entries, serverName)) return text;
  delete entries[serverName];
  return `${JSON.stringify({ ...config, mcpServers: entries }, null, 2)}\n`;
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function install(paths: Paths): void {
  mkdirSync(paths.configRoot, { recursive: true, mode: 0o700 });
  if (!existsSync(paths.installRoot)) git(["clone", "--no-checkout", repoUrl, paths.installRoot]);
  git(["-C", paths.installRoot, "checkout", "--detach", pinnedCommit]);
  if (!existsSync(join(paths.installRoot, "dist", "server.mjs"))) throw new Error("Pinned jev-sift server is missing");
}

export function setup(paths: Paths, env: NodeJS.ProcessEnv = process.env): readonly Action[] {
  const text = readOptional(paths.mcpConfig);
  const keySource = observeKeySource(paths, env);
  const hasEntry = Object.hasOwn(servers(parseConfig(text)), serverName);
  const installed = keySource !== "missing" && existsSync(join(paths.installRoot, "dist", "server.mjs"))
    && git(["-C", paths.installRoot, "rev-parse", "HEAD"]) === pinnedCommit;
  const desired = keySource === "missing" ? undefined : upsertMcpConfig(text, paths.installRoot);
  const matches = hasEntry && (keySource === "missing" || JSON.stringify(parseConfig(text)) === JSON.stringify(parseConfig(desired)));
  const actions = decide({ keySource, installed, registered: matches });
  for (const action of actions) {
    if (action === "install") {
      install(paths);
      continue;
    }
    const updated = action === "register" ? desired : removeMcpConfig(text);
    if (updated !== undefined) {
      mkdirSync(paths.agentDir, { recursive: true, mode: 0o700 });
      writeFileSync(paths.mcpConfig, updated, { mode: 0o600 });
    }
  }
  return actions;
}

if (import.meta.main) {
  try {
    const actions = setup(resolvePaths());
    console.log(`jev-sift: ${actions.length === 0 ? "no change" : actions.join(", ")}`);
    console.log("jev-sift: restart OMP for MCP changes to take effect");
  } catch {
    console.error("jev-sift: setup failed; check key-file access, MCP JSON, and the pinned git checkout");
    process.exitCode = 1;
  }
}
