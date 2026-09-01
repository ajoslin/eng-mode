import { afterEach, describe, expect, it } from "bun:test";
import { lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentSkillsAllowlist, findRepositoryRoot, installAgentSkills, verifyProjectOverlayName } from "./eng-agent-skills.ts";
import { skillNames } from "./manifest.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))));

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "eng-agent-skills-"));
  roots.push(value);
  return value;
}

async function gitRepo(): Promise<string> {
  const value = await root();
  await mkdir(join(value, ".git"));
  return value;
}

async function writeSkill(pluginRoot: string, name: string): Promise<string> {
  const directory = join(pluginRoot, "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\n---\n`);
  return directory;
}

async function writeContract(repositoryRoot: string, name: "verify-project" | "project-standards"): Promise<string> {
  const directory = join(repositoryRoot, ".omp", "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\n---\nconfigured\n`);
  return directory;
}

function tryMissing(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch {
    return true;
  }
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
    const named = new Set<string>(agentSkillsAllowlist);
    expect(named.has("project-standards")).toBeFalse();
    expect(named.has("verify-project")).toBeFalse();
  });
});

describe("findRepositoryRoot", () => {
  it("walks up from a nested cwd and returns undefined without .git", async () => {
    const repositoryRoot = await gitRepo();
    const nested = join(repositoryRoot, "apps", "web");
    await mkdir(nested, { recursive: true });
    expect(findRepositoryRoot(nested)).toBe(repositoryRoot);
    expect(findRepositoryRoot(await root())).toBeUndefined();
    const worktree = await root();
    await writeFile(join(worktree, ".git"), "gitdir: /tmp/fake\n");
    expect(findRepositoryRoot(join(worktree, "src"))).toBe(worktree);
  });
});

describe("Eng agent-skills overlay", () => {
  it("installs allowlisted skill directories into the repository .agents/skills", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    const homeDir = await root();
    const how = await writeSkill(pluginRoot, "how");
    await writeSkill(pluginRoot, "eng-mode");
    const nested = join(repositoryRoot, "src");
    await mkdir(nested, { recursive: true });
    const previous = process.env.HOME;
    process.env.HOME = homeDir;
    try {
      const result = installAgentSkills({ pluginRoot, cwd: nested });
      expect(result).toMatchObject({
        overlay: "applied",
        repositoryRoot,
        skillsDir: join(repositoryRoot, ".agents", "skills"),
      });
      if (result.overlay !== "applied") throw new Error("expected applied overlay");
      const dest = join(repositoryRoot, ".agents", "skills", "how");
      expect(result.skills.find((skill) => skill.name === "how")).toEqual({
        status: "installed",
        name: "how",
        dest,
        source: realpathSync(how),
      });
      expect(lstatSync(dest).isSymbolicLink()).toBeTrue();
      expect(realpathSync(dest)).toBe(realpathSync(how));
      expect(result.skills.find((skill) => skill.name === "why")?.status).toBe("missing");
      expect(result.skills.find((skill) => skill.name === verifyProjectOverlayName)?.status).toBe("missing");
      expect(await readdir(join(repositoryRoot, ".agents", "skills"))).toEqual(["how"]);
      expect(tryMissing(join(homeDir, ".agents"))).toBeTrue();
    } finally {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
    }
  });

  it("skips the overlay entirely when cwd has no git repository", async () => {
    const pluginRoot = await root();
    const cwd = await root();
    const homeDir = await root();
    await writeSkill(pluginRoot, "how");
    const previous = process.env.HOME;
    process.env.HOME = homeDir;
    try {
      expect(installAgentSkills({ pluginRoot, cwd })).toEqual({
        overlay: "skipped",
        reason: "no git repository root from cwd",
        pluginRoot: realpathSync(pluginRoot),
        cwd,
      });
      expect(tryMissing(join(cwd, ".agents"))).toBeTrue();
      expect(tryMissing(join(homeDir, ".agents"))).toBeTrue();
    } finally {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
    }
  });

  it("is unchanged when the dest already points at the current plugin skill", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    await writeSkill(pluginRoot, "how");
    const first = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    const second = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    expect(first.overlay).toBe("applied");
    expect(second.overlay).toBe("applied");
    if (first.overlay !== "applied" || second.overlay !== "applied") throw new Error("expected applied overlay");
    expect(first.skills.find((skill) => skill.name === "how")?.status).toBe("installed");
    expect(second.skills.find((skill) => skill.name === "how")?.status).toBe("unchanged");
  });

  it("retargets an owned symlink that still points at a stale plugin path", async () => {
    const staleRoot = await root();
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    const staleHow = await writeSkill(staleRoot, "how");
    const currentHow = await writeSkill(pluginRoot, "how");
    const dest = join(repositoryRoot, ".agents", "skills", "how");
    mkdirSync(join(repositoryRoot, ".agents", "skills"), { recursive: true });
    symlinkSync(staleHow, dest);
    const result = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    if (result.overlay !== "applied") throw new Error("expected applied overlay");
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
    const repositoryRoot = await gitRepo();
    const currentHow = await writeSkill(pluginRoot, "how");
    const dest = join(repositoryRoot, ".agents", "skills", "how");
    mkdirSync(join(repositoryRoot, ".agents", "skills"), { recursive: true });
    symlinkSync(join(repositoryRoot, "gone-plugin", "skills", "how"), dest);
    const result = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    if (result.overlay !== "applied") throw new Error("expected applied overlay");
    expect(result.skills.find((skill) => skill.name === "how")?.status).toBe("retargeted");
    expect(realpathSync(dest)).toBe(realpathSync(currentHow));
  });

  it("skips product skill dirs and user-owned dests and never clobbers them", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    const userRoot = await root();
    await writeSkill(pluginRoot, "how");
    await writeSkill(pluginRoot, "why");
    const directoryDest = join(repositoryRoot, ".agents", "skills", "how");
    const symlinkDest = join(repositoryRoot, ".agents", "skills", "why");
    const effect = join(repositoryRoot, ".agents", "skills", "effect");
    const codeReview = join(repositoryRoot, ".agents", "skills", "code-review");
    const userWhy = join(userRoot, "custom-why");
    mkdirSync(directoryDest, { recursive: true });
    writeFileSync(join(directoryDest, "SKILL.md"), "user skill\n");
    mkdirSync(effect, { recursive: true });
    writeFileSync(join(effect, "SKILL.md"), "product\n");
    mkdirSync(codeReview, { recursive: true });
    writeFileSync(join(codeReview, "SKILL.md"), "product\n");
    mkdirSync(userWhy, { recursive: true });
    writeFileSync(join(userWhy, "SKILL.md"), "user why\n");
    symlinkSync(userWhy, symlinkDest);
    const result = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    if (result.overlay !== "applied") throw new Error("expected applied overlay");
    expect(result.skills.find((skill) => skill.name === "how")).toMatchObject({
      status: "skipped",
      dest: directoryDest,
      reason: "destination exists and is not a symlink we own",
    });
    expect(result.skills.find((skill) => skill.name === "why")).toMatchObject({
      status: "skipped",
      dest: symlinkDest,
      reason: "existing symlink is not an overlay we own",
    });
    expect(lstatSync(directoryDest).isSymbolicLink()).toBeFalse();
    expect(readlinkSync(symlinkDest)).toBe(userWhy);
    expect(await readdir(effect)).toEqual(["SKILL.md"]);
    expect(await readdir(codeReview)).toEqual(["SKILL.md"]);
  });

  it("reports a missing allowlisted skill directory without creating a dest", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    await mkdir(join(pluginRoot, "skills", "how"), { recursive: true });
    const result = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    if (result.overlay !== "applied") throw new Error("expected applied overlay");
    expect(result.skills.find((skill) => skill.name === "how")).toEqual({
      status: "missing",
      name: "how",
      dest: join(repositoryRoot, ".agents", "skills", "how"),
      source: join(pluginRoot, "skills", "how"),
      reason: "plugin skill directory or SKILL.md is absent",
    });
    expect(tryMissing(join(repositoryRoot, ".agents", "skills", "how"))).toBeTrue();
  });

  it("symlinks verify-project relatively to the repo contract and does not overlay project-standards", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    await writeSkill(pluginRoot, "how");
    const contract = await writeContract(repositoryRoot, "verify-project");
    await writeContract(repositoryRoot, "project-standards");
    const result = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    if (result.overlay !== "applied") throw new Error("expected applied overlay");
    const dest = join(repositoryRoot, ".agents", "skills", "verify-project");
    expect(result.skills.find((skill) => skill.name === "verify-project")).toEqual({
      status: "installed",
      name: "verify-project",
      dest,
      source: realpathSync(contract),
    });
    expect(readlinkSync(dest)).toBe("../../.omp/skills/verify-project");
    expect(realpathSync(dest)).toBe(realpathSync(contract));
    expect(tryMissing(join(repositoryRoot, ".agents", "skills", "project-standards"))).toBeTrue();
    const second = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    expect(second.overlay).toBe("applied");
    if (second.overlay !== "applied") throw new Error("expected applied overlay");
    expect(second.skills.find((skill) => skill.name === "verify-project")?.status).toBe("unchanged");
  });

  it("follows a .agents/skills symlink and never replaces it", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    const how = await writeSkill(pluginRoot, "how");
    const contract = await writeContract(repositoryRoot, "verify-project");
    const opencodeSkills = join(repositoryRoot, ".opencode", "skills");
    mkdirSync(opencodeSkills, { recursive: true });
    mkdirSync(join(opencodeSkills, "effect"), { recursive: true });
    writeFileSync(join(opencodeSkills, "effect", "SKILL.md"), "product\n");
    mkdirSync(join(repositoryRoot, ".agents"), { recursive: true });
    symlinkSync("../.opencode/skills", join(repositoryRoot, ".agents", "skills"));
    const result = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    if (result.overlay !== "applied") throw new Error("expected applied overlay");
    expect(readlinkSync(join(repositoryRoot, ".agents", "skills"))).toBe("../.opencode/skills");
    expect(realpathSync(join(repositoryRoot, ".agents", "skills", "how"))).toBe(realpathSync(how));
    expect(realpathSync(join(opencodeSkills, "how"))).toBe(realpathSync(how));
    expect(readlinkSync(join(repositoryRoot, ".agents", "skills", "verify-project"))).toBe("../../.omp/skills/verify-project");
    expect(realpathSync(join(repositoryRoot, ".agents", "skills", "verify-project"))).toBe(realpathSync(contract));
    expect(await readdir(join(opencodeSkills, "effect"))).toEqual(["SKILL.md"]);
  });

  it("installs the shipped allowlist from the real plugin into a disposable repo only", async () => {
    const pluginRoot = join(import.meta.dir, "..");
    const repositoryRoot = await gitRepo();
    const homeDir = await root();
    const contract = await writeContract(repositoryRoot, "verify-project");
    const previous = process.env.HOME;
    process.env.HOME = homeDir;
    try {
      const result = installAgentSkills({ pluginRoot, cwd: repositoryRoot });
      if (result.overlay !== "applied") throw new Error("expected applied overlay");
      expect(result.skills.filter((skill) => skill.name !== verifyProjectOverlayName).map((skill) => skill.status))
        .toEqual(agentSkillsAllowlist.map(() => "installed"));
      expect(result.skills.find((skill) => skill.name === "verify-project")?.status).toBe("installed");
      expect(realpathSync(join(repositoryRoot, ".agents", "skills", "how"))).toBe(realpathSync(join(pluginRoot, "skills", "how")));
      expect(readlinkSync(join(repositoryRoot, ".agents", "skills", "verify-project"))).toBe("../../.omp/skills/verify-project");
      expect(realpathSync(join(repositoryRoot, ".agents", "skills", "verify-project"))).toBe(realpathSync(contract));
      expect(tryMissing(join(repositoryRoot, ".agents", "skills", "eng-mode"))).toBeTrue();
      expect(tryMissing(join(repositoryRoot, ".agents", "skills", "architect"))).toBeTrue();
      expect(tryMissing(join(repositoryRoot, ".agents", "skills", "project-standards"))).toBeTrue();
      expect(tryMissing(join(homeDir, ".agents"))).toBeTrue();
    } finally {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
    }
  });
});
