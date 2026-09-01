import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, lstatSync, readlinkSync, symlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findRepositoryRoot, installAgentSkills, repositoryContractNames } from "./eng-agent-skills.ts";

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

async function writeSkill(pluginRoot: string, name: string, body = name): Promise<string> {
  const directory = join(pluginRoot, "skills", name);
  await mkdir(join(directory, "references"), { recursive: true });
  await writeFile(join(directory, "SKILL.md"), body);
  await writeFile(join(directory, "references", "detail.txt"), `${body} detail`);
  return directory;
}

async function writeContract(repositoryRoot: string, name: typeof repositoryContractNames[number]): Promise<string> {
  const directory = join(repositoryRoot, ".omp", "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), name);
  return directory;
}

describe("findRepositoryRoot", () => {
  it("walks up from a nested cwd and supports worktree .git files", async () => {
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

describe("Eng agent-skills synchronization", () => {
  it("copies every shipped skill recursively and preserves unrelated skills", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    await writeSkill(pluginRoot, "how");
    await writeSkill(pluginRoot, "eng-mode");
    const unrelated = join(repositoryRoot, ".agents", "skills", "product-skill");
    await mkdir(unrelated, { recursive: true });
    await writeFile(join(unrelated, "SKILL.md"), "product");

    const result = await installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    expect(result.overlay).toBe("applied");
    expect(lstatSync(join(repositoryRoot, ".agents", "skills", "how")).isSymbolicLink()).toBeFalse();
    expect(await readFile(join(repositoryRoot, ".agents", "skills", "how", "references", "detail.txt"), "utf8")).toBe("how detail");
    expect(await readFile(join(repositoryRoot, ".agents", "skills", "eng-mode", "SKILL.md"), "utf8")).toBe("eng-mode");
    expect(await readFile(join(unrelated, "SKILL.md"), "utf8")).toBe("product");
  });

  it("refreshes copies, is idempotent, and migrates legacy skill symlinks", async () => {
    const staleRoot = await root();
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    const stale = await writeSkill(staleRoot, "how", "stale");
    await writeSkill(pluginRoot, "how", "current");
    const dest = join(repositoryRoot, ".agents", "skills", "how");
    await mkdir(join(repositoryRoot, ".agents", "skills"), { recursive: true });
    symlinkSync(stale, dest);

    const first = await installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    const second = await installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    expect(first.overlay).toBe("applied");
    expect(second.overlay).toBe("applied");
    if (first.overlay !== "applied" || second.overlay !== "applied") throw new Error("expected applied overlay");
    expect(first.skills.find((skill) => skill.name === "how")?.status).toBe("updated");
    expect(second.skills.find((skill) => skill.name === "how")?.status).toBe("unchanged");
    expect(lstatSync(dest).isSymbolicLink()).toBeFalse();
    expect(await readFile(join(dest, "SKILL.md"), "utf8")).toBe("current");

    await writeFile(join(pluginRoot, "skills", "how", "SKILL.md"), "new current");
    const third = await installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    if (third.overlay !== "applied") throw new Error("expected applied overlay");
    expect(third.skills.find((skill) => skill.name === "how")?.status).toBe("updated");
    expect(await readFile(join(dest, "SKILL.md"), "utf8")).toBe("new current");
  });

  it("symlinks both repository contracts relatively and keeps them live", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    await writeSkill(pluginRoot, "how");
    for (const name of repositoryContractNames) await writeContract(repositoryRoot, name);

    await installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    for (const name of repositoryContractNames) {
      const dest = join(repositoryRoot, ".agents", "skills", name);
      expect(lstatSync(dest).isSymbolicLink()).toBeTrue();
      expect(readlinkSync(dest)).toBe(`../../.omp/skills/${name}`);
      await writeFile(join(repositoryRoot, ".omp", "skills", name, "SKILL.md"), `${name} updated`);
      expect(await readFile(join(dest, "SKILL.md"), "utf8")).toBe(`${name} updated`);
    }
  });

  it("preserves a linked .agents/skills root and writes through it", async () => {
    const pluginRoot = await root();
    const repositoryRoot = await gitRepo();
    await writeSkill(pluginRoot, "how");
    const target = join(repositoryRoot, ".opencode", "skills");
    await mkdir(target, { recursive: true });
    await mkdir(join(repositoryRoot, ".agents"), { recursive: true });
    symlinkSync("../.opencode/skills", join(repositoryRoot, ".agents", "skills"));

    await installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    expect(readlinkSync(join(repositoryRoot, ".agents", "skills"))).toBe("../.opencode/skills");
    expect(await readFile(join(target, "how", "SKILL.md"), "utf8")).toBe("how");
  });

  it("does nothing outside a git repository", async () => {
    const pluginRoot = await root();
    const cwd = await root();
    await writeSkill(pluginRoot, "how");
    const result = await installAgentSkills({ pluginRoot, cwd });
    expect(result).toMatchObject({ overlay: "skipped", reason: "no git repository root from cwd" });
    expect(existsSync(join(cwd, ".agents"))).toBeFalse();
  });

  it("copies the complete real skills inventory", async () => {
    const pluginRoot = join(import.meta.dir, "..");
    const repositoryRoot = await gitRepo();
    const expected = (await readdir(join(pluginRoot, "skills"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !repositoryContractNames.some((contract) => contract === name))
      .sort();
    const result = await installAgentSkills({ pluginRoot, cwd: repositoryRoot });
    if (result.overlay !== "applied") throw new Error("expected applied overlay");
    expect(result.skills.filter((skill) => !repositoryContractNames.some((name) => name === skill.name)).map((skill) => skill.name)).toEqual(expected);
    expect(await readdir(join(repositoryRoot, ".agents", "skills", "eng-mode", "playbooks"))).toContain("feature.md");
  });
});
