import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { agentSkillsAllowlist } from "./manifest.ts";

export { agentSkillsAllowlist };

export const verifyProjectOverlayName = "verify-project";

export type AgentSkillStatus = AgentSkillResult["status"];

export type AgentSkillResult =
  | { readonly status: "installed"; readonly name: string; readonly dest: string; readonly source: string }
  | { readonly status: "unchanged"; readonly name: string; readonly dest: string; readonly source: string }
  | { readonly status: "retargeted"; readonly name: string; readonly dest: string; readonly source: string }
  | { readonly status: "skipped"; readonly name: string; readonly dest: string; readonly source: string; readonly reason: string }
  | { readonly status: "missing"; readonly name: string; readonly dest: string; readonly source: string; readonly reason: string };

export interface InstallAgentSkillsInput {
  readonly pluginRoot: string;
  readonly cwd?: string;
}

export type InstallAgentSkillsResult =
  | {
      readonly overlay: "skipped";
      readonly reason: string;
      readonly pluginRoot: string;
      readonly cwd: string;
    }
  | {
      readonly overlay: "applied";
      readonly pluginRoot: string;
      readonly cwd: string;
      readonly repositoryRoot: string;
      readonly skillsDir: string;
      readonly skills: readonly AgentSkillResult[];
    };

function tryLstat(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

export function findRepositoryRoot(start: string): string | undefined {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function isPluginSkillPath(target: string, name: string): boolean {
  return basename(target) === name && basename(dirname(target)) === "skills";
}

function isRepoContractPath(target: string, name: string): boolean {
  return (
    basename(target) === name &&
    basename(dirname(target)) === "skills" &&
    basename(dirname(dirname(target))) === ".omp"
  );
}

function readSymlinkTarget(dest: string): string {
  const parent = dirname(dest);
  try {
    return resolve(realpathSync(parent), readlinkSync(dest));
  } catch {
    return resolve(parent, readlinkSync(dest));
  }
}

function resolvesTo(dest: string, source: string): boolean {
  try {
    return realpathSync(dest) === source;
  } catch {
    return false;
  }
}

function writeSymlink(dest: string, target: string): void {
  mkdirSync(resolve(dest, ".."), { recursive: true });
  const temporary = `${dest}.eng-mode-${process.pid}-${crypto.randomUUID()}`;
  symlinkSync(target, temporary);
  try {
    renameSync(temporary, dest);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function resolveOverlaySkillsDir(repositoryRoot: string): string {
  const declared = join(repositoryRoot, ".agents", "skills");
  const stat = tryLstat(declared);
  if (stat === undefined) {
    mkdirSync(declared, { recursive: true });
    return declared;
  }
  if (stat.isSymbolicLink()) {
    mkdirSync(resolve(dirname(declared), readlinkSync(declared)), { recursive: true });
    return declared;
  }
  if (stat.isDirectory()) return declared;
  throw new Error(`repository .agents/skills is not a directory or symlink: ${declared}`);
}

function applySymlink(input: {
  readonly name: string;
  readonly dest: string;
  readonly source: string;
  readonly linkTarget: string;
  readonly owned: (target: string) => boolean;
}): AgentSkillResult {
  const destStat = tryLstat(input.dest);
  if (destStat === undefined) {
    writeSymlink(input.dest, input.linkTarget);
    return { status: "installed", name: input.name, dest: input.dest, source: input.source };
  }
  if (destStat.isSymbolicLink()) {
    if (resolvesTo(input.dest, input.source)) {
      return { status: "unchanged", name: input.name, dest: input.dest, source: input.source };
    }
    const target = readSymlinkTarget(input.dest);
    if (input.owned(target)) {
      writeSymlink(input.dest, input.linkTarget);
      return { status: "retargeted", name: input.name, dest: input.dest, source: input.source };
    }
    return {
      status: "skipped",
      name: input.name,
      dest: input.dest,
      source: input.source,
      reason: "existing symlink is not an overlay we own",
    };
  }
  return {
    status: "skipped",
    name: input.name,
    dest: input.dest,
    source: input.source,
    reason: "destination exists and is not a symlink we own",
  };
}

function installPluginSkill(name: string, pluginRoot: string, declaredSkillsDir: string): AgentSkillResult {
  const source = join(pluginRoot, "skills", name);
  const dest = join(declaredSkillsDir, name);
  if (!existsSync(join(source, "SKILL.md"))) {
    return { status: "missing", name, dest, source, reason: "plugin skill directory or SKILL.md is absent" };
  }
  const resolvedSource = realpathSync(source);
  return applySymlink({
    name,
    dest,
    source: resolvedSource,
    linkTarget: resolvedSource,
    owned: (target) => isPluginSkillPath(target, name),
  });
}

function installVerifyProject(repositoryRoot: string, declaredSkillsDir: string): AgentSkillResult {
  const source = join(repositoryRoot, ".omp", "skills", verifyProjectOverlayName);
  const dest = join(declaredSkillsDir, verifyProjectOverlayName);
  if (!existsSync(join(source, "SKILL.md"))) {
    return {
      status: "missing",
      name: verifyProjectOverlayName,
      dest,
      source,
      reason: "repository verify-project contract is absent",
    };
  }
  const resolvedSource = realpathSync(source);
  return applySymlink({
    name: verifyProjectOverlayName,
    dest,
    source: resolvedSource,
    linkTarget: relative(realpathSync(declaredSkillsDir), resolvedSource),
    owned: (target) => isRepoContractPath(target, verifyProjectOverlayName),
  });
}

export function installAgentSkills(input: InstallAgentSkillsInput): InstallAgentSkillsResult {
  const pluginRoot = resolve(input.pluginRoot);
  const cwd = resolve(input.cwd ?? process.cwd());
  const repositoryRoot = findRepositoryRoot(cwd);
  if (repositoryRoot === undefined) {
    return { overlay: "skipped", reason: "no git repository root from cwd", pluginRoot: realpathSync(pluginRoot), cwd };
  }
  const skillsDir = resolveOverlaySkillsDir(repositoryRoot);
  return {
    overlay: "applied",
    pluginRoot: realpathSync(pluginRoot),
    cwd,
    repositoryRoot,
    skillsDir,
    skills: [
      ...agentSkillsAllowlist.map((name) => installPluginSkill(name, pluginRoot, skillsDir)),
      installVerifyProject(repositoryRoot, skillsDir),
    ],
  };
}

if (import.meta.main) {
  const pluginRoot = process.argv[2] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(installAgentSkills({ pluginRoot }), null, 2)}\n`);
}
