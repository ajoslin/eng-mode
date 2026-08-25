import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const watchdogFileNames = ["WATCHDOG.md", "WATCHDOG.yml"] as const;
export type WatchdogFileName = (typeof watchdogFileNames)[number];

export type WatchdogFileStatus = "installed" | "unchanged" | "updated";

export interface WatchdogFileResult {
  readonly file: WatchdogFileName;
  readonly status: WatchdogFileStatus;
  readonly path: string;
}

export interface InstallWatchdogInput {
  readonly pluginRoot: string;
  readonly agentDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
}

export interface InstallWatchdogResult {
  readonly agentDir: string;
  readonly pluginRoot: string;
  readonly files: readonly WatchdogFileResult[];
}

/**
 * OMP discovers WATCHDOG from the active agent dir and project `.omp/`,
 * not from plugin roots. Default profile: `PI_CODING_AGENT_DIR` or `~/.omp/agent`.
 * Named `OMP_PROFILE` / `PI_PROFILE`: `~/.omp/profiles/<name>/agent`.
 */
export function resolveAgentDir(input: {
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
} = {}): string {
  const env = input.env ?? process.env;
  const home = input.home ?? homedir();
  const profile = (env["OMP_PROFILE"] ?? env["PI_PROFILE"] ?? "").trim();
  const named = profile.length > 0 && profile !== "default";
  const codingAgentDir = env["PI_CODING_AGENT_DIR"]?.trim();
  if (!named && codingAgentDir !== undefined && codingAgentDir.length > 0) {
    return resolve(codingAgentDir);
  }
  const ompRoot = join(home, ".omp");
  if (named) return join(ompRoot, "profiles", profile, "agent");
  return join(ompRoot, "agent");
}

function sameContent(left: string, right: string): boolean {
  return readFileSync(left).equals(readFileSync(right));
}

function samePath(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

function installFile(source: string, dest: string): WatchdogFileStatus {
  if (!existsSync(source)) throw new Error(`missing watchdog source ${source}`);
  mkdirSync(resolve(dest, ".."), { recursive: true });
  if (existsSync(dest)) {
    if (samePath(dest, source) || sameContent(dest, source)) return "unchanged";
    if (lstatSync(dest).isSymbolicLink()) unlinkSync(dest);
    copyFileSync(source, dest);
    return "updated";
  }
  copyFileSync(source, dest);
  return "installed";
}

function resolveInputFrom(input: InstallWatchdogInput): {
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
} {
  return {
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.home === undefined ? {} : { home: input.home }),
  };
}

export function installWatchdog(input: InstallWatchdogInput): InstallWatchdogResult {
  const pluginRoot = resolve(input.pluginRoot);
  const agentDir = input.agentDir === undefined
    ? resolveAgentDir(resolveInputFrom(input))
    : resolve(input.agentDir);
  const files = watchdogFileNames.map((file) => {
    const path = join(agentDir, file);
    return { file, status: installFile(join(pluginRoot, file), path), path };
  });
  return { agentDir, pluginRoot, files };
}

if (import.meta.main) {
  const pluginRoot = process.argv[2] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(installWatchdog({ pluginRoot }), null, 2)}\n`);
}
