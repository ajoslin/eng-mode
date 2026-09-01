import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export const repositoryContractNames = ["project-standards", "verify-project"] as const;

export type AgentSkillStatus = AgentSkillResult["status"];

export type AgentSkillResult =
  | { readonly status: "installed" | "updated" | "unchanged"; readonly name: string; readonly dest: string; readonly source: string }
  | { readonly status: "missing"; readonly name: string; readonly dest: string; readonly source: string; readonly reason: string };

export interface InstallAgentSkillsInput {
  readonly pluginRoot: string;
  readonly cwd?: string;
}

export type InstallAgentSkillsResult =
  | { readonly overlay: "skipped"; readonly reason: string; readonly pluginRoot: string; readonly cwd: string }
  | {
      readonly overlay: "applied";
      readonly pluginRoot: string;
      readonly cwd: string;
      readonly repositoryRoot: string;
      readonly skillsDir: string;
      readonly skills: readonly AgentSkillResult[];
    };

async function tryLstat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
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

async function resolveOverlaySkillsDir(repositoryRoot: string): Promise<string> {
  const declared = join(repositoryRoot, ".agents", "skills");
  const stat = await tryLstat(declared);
  if (stat === undefined) {
    await mkdir(declared, { recursive: true });
    return declared;
  }
  if (stat.isSymbolicLink()) {
    const target = resolve(dirname(declared), await readlink(declared));
    await mkdir(target, { recursive: true });
    return declared;
  }
  if (stat.isDirectory()) return declared;
  throw new Error(`repository .agents/skills is not a directory or symlink: ${declared}`);
}

async function filesEqual(left: string, right: string): Promise<boolean> {
  const [leftStat, rightStat] = await Promise.all([lstat(left), lstat(right)]);
  if (leftStat.isSymbolicLink() || rightStat.isSymbolicLink()) {
    return leftStat.isSymbolicLink() && rightStat.isSymbolicLink() && await readlink(left) === await readlink(right);
  }
  if (leftStat.isFile() || rightStat.isFile()) {
    return leftStat.isFile() && rightStat.isFile() && Buffer.compare(await readFile(left), await readFile(right)) === 0;
  }
  if (!leftStat.isDirectory() || !rightStat.isDirectory()) return false;
  const [leftNames, rightNames] = await Promise.all([readdir(left), readdir(right)]);
  leftNames.sort();
  rightNames.sort();
  if (leftNames.length !== rightNames.length || leftNames.some((name, index) => name !== rightNames[index])) return false;
  return (await Promise.all(leftNames.map((name) => filesEqual(join(left, name), join(right, name))))).every(Boolean);
}

async function publishCompleteEntry(dest: string, stage: string): Promise<"installed" | "updated"> {
  const existing = await tryLstat(dest);
  if (existing === undefined) {
    await rename(stage, dest);
    return "installed";
  }
  const backup = `${dest}.eng-mode-backup-${process.pid}-${crypto.randomUUID()}`;
  await rename(dest, backup);
  try {
    await rename(stage, dest);
  } catch (error) {
    await rename(backup, dest);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
  return "updated";
}

async function copySkill(name: string, source: string, skillsDir: string): Promise<AgentSkillResult> {
  const dest = join(skillsDir, name);
  const stage = `${dest}.eng-mode-stage-${process.pid}-${crypto.randomUUID()}`;
  await cp(source, stage, { recursive: true, preserveTimestamps: true });
  try {
    const existing = await tryLstat(dest);
    if (existing?.isDirectory() && !existing.isSymbolicLink() && await filesEqual(source, dest)) {
      return { status: "unchanged", name, dest, source };
    }
    const status = await publishCompleteEntry(dest, stage);
    return { status, name, dest, source };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function linkContract(name: typeof repositoryContractNames[number], repositoryRoot: string, skillsDir: string): Promise<AgentSkillResult> {
  const source = join(repositoryRoot, ".omp", "skills", name);
  const dest = join(skillsDir, name);
  if ((await tryLstat(join(source, "SKILL.md"))) === undefined) {
    return { status: "missing", name, dest, source, reason: `repository ${name} contract is absent` };
  }
  const target = relative(await realpath(skillsDir), source);
  const existing = await tryLstat(dest);
  if (existing?.isSymbolicLink() && await readlink(dest) === target) {
    return { status: "unchanged", name, dest, source };
  }
  const stage = `${dest}.eng-mode-stage-${process.pid}-${crypto.randomUUID()}`;
  await symlink(target, stage);
  try {
    const status = await publishCompleteEntry(dest, stage);
    return { status, name, dest, source };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function discoverPluginSkills(pluginRoot: string): Promise<readonly { name: string; source: string }[]> {
  const skillsRoot = join(pluginRoot, "skills");
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills: { name: string; source: string }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || repositoryContractNames.some((name) => name === entry.name)) continue;
    const source = join(skillsRoot, entry.name);
    if ((await tryLstat(join(source, "SKILL.md"))) !== undefined) skills.push({ name: entry.name, source });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export async function installAgentSkills(input: InstallAgentSkillsInput): Promise<InstallAgentSkillsResult> {
  const pluginRoot = await realpath(resolve(input.pluginRoot));
  const cwd = resolve(input.cwd ?? process.cwd());
  const repositoryRoot = findRepositoryRoot(cwd);
  if (repositoryRoot === undefined) {
    return { overlay: "skipped", reason: "no git repository root from cwd", pluginRoot, cwd };
  }
  const [skillsDir, pluginSkills] = await Promise.all([
    resolveOverlaySkillsDir(repositoryRoot),
    discoverPluginSkills(pluginRoot),
  ]);
  const skills: AgentSkillResult[] = [];
  for (const skill of pluginSkills) skills.push(await copySkill(skill.name, skill.source, skillsDir));
  for (const name of repositoryContractNames) skills.push(await linkContract(name, repositoryRoot, skillsDir));
  return { overlay: "applied", pluginRoot, cwd, repositoryRoot, skillsDir, skills };
}

if (import.meta.main) {
  const pluginRoot = process.argv[2] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(await installAgentSkills({ pluginRoot }), null, 2)}\n`);
}
