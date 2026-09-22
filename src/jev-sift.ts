import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
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
    throw new Error("Unable to read jev-sift configuration or credential file");
  }
}

const keyConfigSchema = z.object({ apiKeyEnv: z.string().optional(), apiKeyFile: z.string().optional() });

export function observeKeySource(paths: OmpPaths, env: NodeJS.ProcessEnv = process.env): KeySource {
  const configuredPath = env.JEV_SIFT_CONFIG;
  const configText = readOptional(configuredPath ?? join(paths.home, ".config", serverName, "config.json"));
  if (configText === undefined && configuredPath !== undefined) throw new Error("Invalid jev-sift key configuration");
  let config: z.infer<typeof keyConfigSchema>;
  try {
    config = keyConfigSchema.parse(configText === undefined ? {} : JSON.parse(configText));
  } catch {
    throw new Error("Invalid jev-sift key configuration");
  }
  const names = config.apiKeyEnv ? [config.apiKeyEnv, "JEV_API_KEY", "TYPESAFE_API_KEY"] : ["JEV_API_KEY", "TYPESAFE_API_KEY"];
  if (names.some((name) => nonempty(env[name]))) return "env";
  const keyfile = config.apiKeyFile ?? join(paths.home, ".config", serverName, "api-key");
  if (!isAbsolute(keyfile)) throw new Error("jev-sift key file must be absolute");
  if (nonempty(readOptional(keyfile))) return "keyfile";
  for (const directory of [paths.cwd, paths.agentDir, paths.configRoot, paths.home]) {
    const text = readOptional(join(directory, ".env"));
    if (text === undefined) continue;
    const ompText = text.split(/\r?\n/).filter((line) => !/^\s*declare\s+-x\s+/.test(line)).join("\n");
    if (names.some((name) => nonempty(parseDotenvKey(ompText, name)))) return ".env";
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
  try {
    const parsed: unknown = JSON.parse(text);
    return object(parsed, "MCP config");
  } catch {
    throw new Error("Invalid MCP config");
  }
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
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    throw new Error("Unable to read or update the pinned jev-sift checkout");
  }
}

export function artifactMatches(installRoot: string, revision = pinnedCommit): boolean {
  if (!existsSync(join(installRoot, ".git"))) return false;
  if (!existsSync(join(installRoot, "dist", "server.mjs"))) return false;
  return git(["-C", installRoot, "rev-parse", `${revision}:dist/server.mjs`])
    === git(["-C", installRoot, "hash-object", "dist/server.mjs"]);
}

function updateMcpConfig(paths: Paths, action: "register" | "unregister"): void {
  const lock = `${paths.mcpConfig}.lock`;
  const temporary = `${paths.mcpConfig}.${randomUUID()}.tmp`;
  mkdirSync(paths.agentDir, { recursive: true, mode: 0o700 });
  let descriptor: number;
  try {
    descriptor = openSync(lock, "wx", 0o600);
  } catch {
    throw new Error("Unable to acquire MCP config lock");
  }
  try {
    const current = readOptional(paths.mcpConfig);
    const updated = action === "register" ? upsertMcpConfig(current, paths.installRoot) : removeMcpConfig(current);
    if (updated !== undefined && updated !== current) {
      writeFileSync(temporary, updated, { flag: "wx", mode: 0o600 });
      renameSync(temporary, paths.mcpConfig);
    }
  } catch {
    throw new Error("Unable to update MCP config");
  } finally {
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } finally {
      try {
        closeSync(descriptor);
      } finally {
        unlinkSync(lock);
      }
    }
  }
}

function install(paths: Paths): void {
  mkdirSync(paths.configRoot, { recursive: true, mode: 0o700 });
  if (!existsSync(paths.installRoot)) git(["clone", "--no-checkout", repoUrl, paths.installRoot]);
  git(["-C", paths.installRoot, "restore", `--source=${pinnedCommit}`, "--staged", "--worktree", "--", "dist/server.mjs"]);
  git(["-C", paths.installRoot, "checkout", "--detach", pinnedCommit]);
  if (!artifactMatches(paths.installRoot)) throw new Error("Pinned jev-sift server does not match its tracked artifact");
}

export function setup(paths: Paths, env: NodeJS.ProcessEnv = process.env): readonly Action[] {
  try {
    const text = readOptional(paths.mcpConfig);
    const keySource = observeKeySource(paths, env);
    const hasEntry = Object.hasOwn(servers(parseConfig(text)), serverName);
    const installed = keySource !== "missing" && artifactMatches(paths.installRoot)
      && git(["-C", paths.installRoot, "rev-parse", "HEAD"]) === pinnedCommit;
    const desired = keySource === "missing" ? undefined : upsertMcpConfig(text, paths.installRoot);
    const matches = hasEntry && (keySource === "missing" || JSON.stringify(parseConfig(text)) === JSON.stringify(parseConfig(desired)));
    const actions = decide({ keySource, installed, registered: matches });
    for (const action of actions) {
      if (action === "install") {
        install(paths);
        continue;
      }
      updateMcpConfig(paths, action);
    }
    return actions;
  } catch {
    throw new Error("jev-sift setup failed; check key-file access, MCP JSON, its lock, and the pinned git checkout");
  }
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
