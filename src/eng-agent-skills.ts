import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { agentSkillsAllowlist } from "./manifest.ts";

export { agentSkillsAllowlist };

export type AgentSkillStatus = AgentSkillResult["status"];

export type AgentSkillResult =
  | { readonly status: "installed"; readonly name: string; readonly dest: string; readonly source: string }
  | { readonly status: "unchanged"; readonly name: string; readonly dest: string; readonly source: string }
  | { readonly status: "retargeted"; readonly name: string; readonly dest: string; readonly source: string }
  | { readonly status: "skipped"; readonly name: string; readonly dest: string; readonly source: string; readonly reason: string }
  | { readonly status: "missing"; readonly name: string; readonly dest: string; readonly source: string; readonly reason: string };

export interface InstallAgentSkillsInput {
  readonly pluginRoot: string;
  readonly homeDir?: string;
}

export interface InstallAgentSkillsResult {
  readonly homeDir: string;
  readonly skillsDir: string;
  readonly pluginRoot: string;
  readonly skills: readonly AgentSkillResult[];
}

function tryLstat(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

function isPluginSkillPath(target: string, name: string): boolean {
  return basename(target) === name && basename(dirname(target)) === "skills";
}

function resolvesTo(dest: string, source: string): boolean {
  try {
    return realpathSync(dest) === source;
  } catch {
    return false;
  }
}

function writeSymlink(dest: string, source: string): void {
  mkdirSync(resolve(dest, ".."), { recursive: true });
  const temporary = `${dest}.eng-mode-${process.pid}-${crypto.randomUUID()}`;
  symlinkSync(source, temporary);
  try {
    renameSync(temporary, dest);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function installSkill(name: string, pluginRoot: string, skillsDir: string): AgentSkillResult {
  const source = join(pluginRoot, "skills", name);
  const dest = join(skillsDir, name);
  if (!existsSync(join(source, "SKILL.md"))) {
    return { status: "missing", name, dest, source, reason: "plugin skill directory or SKILL.md is absent" };
  }
  const resolvedSource = realpathSync(source);
  const destStat = tryLstat(dest);
  if (destStat === undefined) {
    writeSymlink(dest, resolvedSource);
    return { status: "installed", name, dest, source: resolvedSource };
  }
  if (destStat.isSymbolicLink()) {
    if (resolvesTo(dest, resolvedSource)) {
      return { status: "unchanged", name, dest, source: resolvedSource };
    }
    const target = resolve(dirname(dest), readlinkSync(dest));
    if (isPluginSkillPath(target, name)) {
      writeSymlink(dest, resolvedSource);
      return { status: "retargeted", name, dest, source: resolvedSource };
    }
    return { status: "skipped", name, dest, source: resolvedSource, reason: "existing symlink is not an eng-mode plugin skill" };
  }
  return { status: "skipped", name, dest, source: resolvedSource, reason: "destination exists and is not a symlink we own" };
}

function resolveHomeDir(homeDir: string | undefined): string {
  if (homeDir !== undefined && homeDir.length > 0) return resolve(homeDir);
  const fromEnv = process.env.HOME;
  if (fromEnv !== undefined && fromEnv.length > 0) return resolve(fromEnv);
  return resolve(homedir());
}

export function installAgentSkills(input: InstallAgentSkillsInput): InstallAgentSkillsResult {
  const pluginRoot = resolve(input.pluginRoot);
  const homeDir = resolveHomeDir(input.homeDir);
  const skillsDir = join(homeDir, ".agents", "skills");
  mkdirSync(skillsDir, { recursive: true });
  return {
    homeDir,
    skillsDir,
    pluginRoot: realpathSync(pluginRoot),
    skills: agentSkillsAllowlist.map((name) => installSkill(name, pluginRoot, skillsDir)),
  };
}

if (import.meta.main) {
  const pluginRoot = process.argv[2] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(installAgentSkills({ pluginRoot }), null, 2)}\n`);
}
