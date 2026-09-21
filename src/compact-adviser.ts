import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Key-gated setup for the `compact-adviser` OMP plugin (npm:compact-adviser).
 *
 * compact-adviser resolves `TYPESAFE_API_KEY` from the process env, then a key
 * saved through `/compact-adviser`, then `./.env`. OMP itself loads
 * `./.env`, `<agent>/.env`, `<config-root>/.env`, and `~/.env` into the process
 * env at launch, so this script checks the same chain. A `/login typesafe`
 * credential lives in OMP's auth store and is not visible to compact-adviser,
 * so it does not count.
 */

export const pluginName = "compact-adviser";
export const configFile = "compact-adviser.json";

export type KeySource = "env" | "saved" | ".env" | "missing";

export interface Observation {
  readonly keySource: KeySource;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly configExists: boolean;
}

export type Action = "install" | "enable" | "disable" | "write-default-config";

export function decide(observation: Observation): readonly Action[] {
  if (observation.keySource === "missing") {
    return observation.installed && observation.enabled ? ["disable"] : [];
  }
  const actions: Action[] = [];
  if (!observation.installed) actions.push("install");
  else if (!observation.enabled) actions.push("enable");
  if (!observation.configExists) actions.push("write-default-config");
  return actions;
}

export const defaultConfig = {
  version: 1,
  mode: "auto",
  minContextTokens: 40000,
  autoAcknowledged: true,
  logRequests: false,
} as const;

const dotenvPrefix = /^(?:export|declare\s+-x)\s+/;

/** Same rule as compact-adviser: last `KEY=VALUE` wins; comments and blanks ignored. */
export function parseDotenvKey(text: string, name: string): string | undefined {
  let found: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(dotenvPrefix, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0 || line.slice(0, eq).trim() !== name) continue;
    const value = line.slice(eq + 1).trim();
    const quote = value[0];
    const quoted = value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote);
    found = quoted ? value.slice(1, -1) : value;
  }
  return found;
}

function nonempty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

function dotenvKey(path: string): string | undefined {
  try {
    return nonempty(parseDotenvKey(readFileSync(path, "utf8"), "TYPESAFE_API_KEY"));
  } catch {
    return undefined;
  }
}

function savedKey(agentDir: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(agentDir, configFile), "utf8"));
    if (parsed && typeof parsed === "object" && "typesafeApiKey" in parsed) {
      const key = (parsed as { typesafeApiKey?: unknown }).typesafeApiKey;
      return typeof key === "string" ? nonempty(key) : undefined;
    }
  } catch {
    // Missing or invalid settings mean no saved key.
  }
  return undefined;
}

export interface Paths {
  readonly agentDir: string;
  readonly configRoot: string;
  readonly cwd: string;
  readonly home: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Paths {
  const home = homedir();
  const configRoot = join(home, env.PI_CONFIG_DIR ?? ".omp");
  const agentDir = env.PI_CODING_AGENT_DIR ? resolve(env.PI_CODING_AGENT_DIR) : join(configRoot, "agent");
  return { agentDir, configRoot, cwd, home };
}

export function observeKeySource(paths: Paths, env: NodeJS.ProcessEnv = process.env): KeySource {
  if (nonempty(env.TYPESAFE_API_KEY)) return "env";
  if (savedKey(paths.agentDir)) return "saved";
  const dotenvFiles = [
    join(paths.cwd, ".env"),
    join(paths.agentDir, ".env"),
    join(paths.configRoot, ".env"),
    join(paths.home, ".env"),
  ];
  return dotenvFiles.some((file) => dotenvKey(file)) ? ".env" : "missing";
}

interface PluginRow {
  readonly name: string;
  readonly enabled: boolean;
}

function omp(args: readonly string[]): string {
  return execFileSync("omp", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function observePlugin(): Pick<Observation, "installed" | "enabled"> {
  const listed: unknown = JSON.parse(omp(["plugin", "list", "--json"]));
  const rows = (listed as { npm?: readonly PluginRow[] }).npm ?? [];
  const row = rows.find((plugin) => plugin.name === pluginName);
  return { installed: row !== undefined, enabled: row?.enabled === true };
}

export function writeDefaultConfig(agentDir: string): string {
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const path = join(agentDir, configFile);
  writeFileSync(path, `${JSON.stringify(defaultConfig, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export function apply(action: Action, paths: Paths): string {
  switch (action) {
    case "install":
      omp(["plugin", "install", `npm:${pluginName}`]);
      return `installed npm:${pluginName}`;
    case "enable":
      omp(["plugin", "enable", pluginName]);
      return `enabled ${pluginName}`;
    case "disable":
      omp(["plugin", "disable", pluginName]);
      return `disabled ${pluginName}`;
    case "write-default-config":
      return `wrote mode auto to ${writeDefaultConfig(paths.agentDir)}`;
  }
}

if (import.meta.main) {
  const paths = resolvePaths();
  const observation: Observation = {
    keySource: observeKeySource(paths),
    ...observePlugin(),
    configExists: existsSync(join(paths.agentDir, configFile)),
  };
  const actions = decide(observation);
  console.log(`compact-adviser: Key: ${observation.keySource}`);
  for (const action of actions) console.log(`compact-adviser: ${apply(action, paths)}`);
  if (actions.length === 0) {
    console.log(
      `compact-adviser: ${observation.installed && observation.enabled ? "enabled" : "disabled"} (no change)`
    );
  }
  console.log("compact-adviser: restart OMP for plugin state changes to take effect");
}
