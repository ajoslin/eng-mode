import { afterEach, describe, expect, it } from "bun:test";
import { lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentSkillsAllowlist, installAgentSkills } from "./eng-agent-skills.ts";
import { skillNames } from "./manifest.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))));

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "eng-agent-skills-"));
  roots.push(value);
  return value;
}

async function writeSkill(pluginRoot: string, name: string): Promise<string> {
  const directory = join(pluginRoot, "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\n---\n`);
  return directory;
}

const operatorSkillNames = [
  "eng-mode",
  "setup-eng-mode",
  "arena",
  "swarm",
  "omp-workflows",
  "pre-pr-swarm",
  "architect",
  "interrogate",
  "figure-it-out",
  "github-graphite",
  "graphite",
  "pr-cockpit",
  "recall",
  "reflect",
  "prototype",
  "automate-me",
  "bro",
  "capture-learning",
  "teach",
] as const;

describe("agentSkillsAllowlist", () => {
  it("is the judgment layer plus every principle-* skillName", () => {
    expect(new Set(agentSkillsAllowlist)).toEqual(new Set([
      "how",
      "why",
      "diagnosing-bugs",
      "domain-modeling",
      "codebase-design",
      "blast-radius",
      "typescript-best-practices",
      "tdd",
      "no-comments",
      "unslop",
      "technical-writing",
      "thermo-nuclear-code-quality-review",
      "meaningful-contribution",
      "show-me-your-work",
      "create-verification-skill",
      "maintain-verification-skill",
      ...skillNames.filter((name) => name.startsWith("principle-")),
    ]));
    expect(agentSkillsAllowlist.every((name) => skillNames.includes(name))).toBeTrue();
    expect(operatorSkillNames.some((name) => agentSkillsAllowlist.includes(name))).toBeFalse();
  });
});

describe("Eng agent-skills overlay", () => {
  it("installs allowlisted skill directories as home-dir symlinks", async () => {
    const pluginRoot = await root();
    const homeDir = await root();
    const how = await writeSkill(pluginRoot, "how");
    await writeSkill(pluginRoot, "eng-mode");
    const result = installAgentSkills({ pluginRoot, homeDir });
    const dest = join(homeDir, ".agents", "skills", "how");
    expect(result.skillsDir).toBe(join(homeDir, ".agents", "skills"));
    expect(result.skills.find((skill) => skill.name === "how")).toEqual({
      status: "installed",
      name: "how",
      dest,
      source: realpathSync(how),
    });
    expect(lstatSync(dest).isSymbolicLink()).toBeTrue();
    expect(realpathSync(dest)).toBe(realpathSync(how));
    expect(result.skills.find((skill) => skill.name === "why")?.status).toBe("missing");
    expect(await readdir(join(homeDir, ".agents", "skills"))).toEqual(["how"]);
  });

  it("is unchanged when the dest already points at the current plugin skill", async () => {
    const pluginRoot = await root();
    const homeDir = await root();
    await writeSkill(pluginRoot, "how");
    expect(installAgentSkills({ pluginRoot, homeDir }).skills.find((skill) => skill.name === "how")?.status).toBe("installed");
    expect(installAgentSkills({ pluginRoot, homeDir }).skills.find((skill) => skill.name === "how")?.status).toBe("unchanged");
  });

  it("retargets an owned symlink that still points at a stale plugin path", async () => {
    const staleRoot = await root();
    const pluginRoot = await root();
    const homeDir = await root();
    const staleHow = await writeSkill(staleRoot, "how");
    const currentHow = await writeSkill(pluginRoot, "how");
    const dest = join(homeDir, ".agents", "skills", "how");
    mkdirSync(join(homeDir, ".agents", "skills"), { recursive: true });
    symlinkSync(staleHow, dest);
    const result = installAgentSkills({ pluginRoot, homeDir });
    expect(result.skills.find((skill) => skill.name === "how")).toEqual({
      status: "retargeted",
      name: "how",
      dest,
      source: realpathSync(currentHow),
    });
    expect(realpathSync(dest)).toBe(realpathSync(currentHow));
  });

  it("retargets a broken owned symlink whose target still looks like a plugin skill", async () => {
    const pluginRoot = await root();
    const homeDir = await root();
    const currentHow = await writeSkill(pluginRoot, "how");
    const dest = join(homeDir, ".agents", "skills", "how");
    mkdirSync(join(homeDir, ".agents", "skills"), { recursive: true });
    symlinkSync(join(homeDir, "gone-plugin", "skills", "how"), dest);
    expect(installAgentSkills({ pluginRoot, homeDir }).skills.find((skill) => skill.name === "how")?.status).toBe("retargeted");
    expect(realpathSync(dest)).toBe(realpathSync(currentHow));
  });

  it("skips a real directory or a user-owned symlink and never clobbers it", async () => {
    const pluginRoot = await root();
    const homeDir = await root();
    const userHome = await root();
    await writeSkill(pluginRoot, "how");
    await writeSkill(pluginRoot, "why");
    const directoryDest = join(homeDir, ".agents", "skills", "how");
    const symlinkDest = join(homeDir, ".agents", "skills", "why");
    const userWhy = join(userHome, "custom-why");
    mkdirSync(directoryDest, { recursive: true });
    writeFileSync(join(directoryDest, "SKILL.md"), "user skill\n");
    mkdirSync(join(homeDir, ".agents", "skills"), { recursive: true });
    mkdirSync(userWhy, { recursive: true });
    writeFileSync(join(userWhy, "SKILL.md"), "user why\n");
    symlinkSync(userWhy, symlinkDest);
    const result = installAgentSkills({ pluginRoot, homeDir });
    expect(result.skills.find((skill) => skill.name === "how")).toMatchObject({
      status: "skipped",
      dest: directoryDest,
      reason: "destination exists and is not a symlink we own",
    });
    expect(result.skills.find((skill) => skill.name === "why")).toMatchObject({
      status: "skipped",
      dest: symlinkDest,
      reason: "existing symlink is not an eng-mode plugin skill",
    });
    expect(lstatSync(directoryDest).isSymbolicLink()).toBeFalse();
    expect(readlinkSync(symlinkDest)).toBe(userWhy);
  });

  it("reports a missing allowlisted skill directory without creating a dest", async () => {
    const pluginRoot = await root();
    const homeDir = await root();
    await mkdir(join(pluginRoot, "skills", "how"), { recursive: true });
    const result = installAgentSkills({ pluginRoot, homeDir });
    const how = result.skills.find((skill) => skill.name === "how");
    expect(how).toEqual({
      status: "missing",
      name: "how",
      dest: join(homeDir, ".agents", "skills", "how"),
      source: join(pluginRoot, "skills", "how"),
      reason: "plugin skill directory or SKILL.md is absent",
    });
    expect(tryMissing(join(homeDir, ".agents", "skills", "how"))).toBeTrue();
  });

  it("installs the shipped allowlist from the real plugin and never writes the project worktree", async () => {
    const pluginRoot = join(import.meta.dir, "..");
    const homeDir = await root();
    const project = await root();
    await mkdir(join(project, ".agents", "skills"), { recursive: true });
    const previous = process.cwd();
    process.chdir(project);
    try {
      const result = installAgentSkills({ pluginRoot, homeDir });
      expect(result.skills.map((skill) => skill.status)).toEqual(agentSkillsAllowlist.map(() => "installed"));
      expect(realpathSync(join(homeDir, ".agents", "skills", "how"))).toBe(realpathSync(join(pluginRoot, "skills", "how")));
      expect(tryMissing(join(homeDir, ".agents", "skills", "eng-mode"))).toBeTrue();
      expect(tryMissing(join(homeDir, ".agents", "skills", "architect"))).toBeTrue();
      expect(await readdir(join(project, ".agents", "skills"))).toEqual([]);
    } finally {
      process.chdir(previous);
    }
  });
});

function tryMissing(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch {
    return true;
  }
}
