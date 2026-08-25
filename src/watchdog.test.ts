import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { installWatchdog, resolveAgentDir, watchdogFileNames } from "./watchdog.ts";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenAdvisorLoads = ["typescript-best-practices", "project-standards", "principle-"];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "eng-mode-watchdog-"));
  roots.push(value);
  return value;
}

describe("resolveAgentDir", () => {
  it("defaults to ~/.omp/agent", () => {
    expect(resolveAgentDir({ env: {}, home: "/home/aj" })).toBe("/home/aj/.omp/agent");
  });

  it("honors PI_CODING_AGENT_DIR on the default profile", () => {
    expect(resolveAgentDir({
      env: { PI_CODING_AGENT_DIR: "/tmp/agent", PI_PROFILE: "default" },
      home: "/home/aj",
    })).toBe("/tmp/agent");
  });

  it("uses the named profile agent dir and ignores PI_CODING_AGENT_DIR", () => {
    expect(resolveAgentDir({
      env: { OMP_PROFILE: "work", PI_CODING_AGENT_DIR: "/tmp/agent" },
      home: "/home/aj",
    })).toBe("/home/aj/.omp/profiles/work/agent");
  });

  it("lets OMP_PROFILE win over PI_PROFILE", () => {
    expect(resolveAgentDir({
      env: { OMP_PROFILE: "work", PI_PROFILE: "other" },
      home: "/home/aj",
    })).toBe("/home/aj/.omp/profiles/work/agent");
  });
});

describe("installWatchdog", () => {
  it("copies the shipped files into the agent dir and is idempotent", async () => {
    const agentDir = join(await root(), "agent");
    const first = installWatchdog({ pluginRoot, agentDir });
    expect(first.files.map((file) => file.status)).toEqual(["installed", "installed"]);
    for (const file of watchdogFileNames) {
      expect(await readFile(join(agentDir, file), "utf8")).toBe(await readFile(join(pluginRoot, file), "utf8"));
    }
    expect(installWatchdog({ pluginRoot, agentDir }).files.map((file) => file.status)).toEqual(["unchanged", "unchanged"]);
    expect((await readdir(agentDir)).toSorted()).toEqual([...watchdogFileNames]);
  });

  it("refreshes a stale dest and leaves config.yml untouched", async () => {
    const agentDir = join(await root(), "agent");
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "WATCHDOG.md"), "old\n");
    await writeFile(join(agentDir, "config.yml"), "modelRoles:\n  advisor: kept\n");
    const result = installWatchdog({ pluginRoot, agentDir });
    expect(result.files[0]).toMatchObject({ file: "WATCHDOG.md", status: "updated" });
    expect(await readFile(join(agentDir, "WATCHDOG.md"), "utf8")).toBe(await readFile(join(pluginRoot, "WATCHDOG.md"), "utf8"));
    expect(await readFile(join(agentDir, "config.yml"), "utf8")).toBe("modelRoles:\n  advisor: kept\n");
  });

  it("treats a dest symlink to the plugin file as already installed", async () => {
    const agentDir = join(await root(), "agent");
    await mkdir(agentDir, { recursive: true });
    await symlink(join(pluginRoot, "WATCHDOG.md"), join(agentDir, "WATCHDOG.md"));
    await symlink(join(pluginRoot, "WATCHDOG.yml"), join(agentDir, "WATCHDOG.yml"));
    expect(installWatchdog({ pluginRoot, agentDir }).files.map((file) => file.status)).toEqual(["unchanged", "unchanged"]);
  });

  it("throws when a shipped source is missing", async () => {
    const plugin = await root();
    expect(() => installWatchdog({ pluginRoot: plugin, agentDir: join(plugin, "agent") })).toThrow(/missing watchdog source/);
  });
});

describe("shipped watchdog", () => {
  it("declares Luna with read/grep/glob and no model or deny list", async () => {
    const text = await readFile(join(pluginRoot, "WATCHDOG.yml"), "utf8");
    const parsed: unknown = parse(text);
    expect(parsed).toEqual({
      advisors: [
        {
          name: "Luna",
          tools: ["read", "grep", "glob"],
          instructions: expect.stringContaining("spec drift"),
        },
      ],
    });
    expect(text).not.toMatch(/deny|model:/i);
  });

  it("does not load standards, TypeScript taste, or principle skills", async () => {
    const bodies = await Promise.all(watchdogFileNames.map((file) => readFile(join(pluginRoot, file), "utf8")));
    for (const body of bodies) {
      for (const fragment of forbiddenAdvisorLoads) {
        expect(body).not.toContain(fragment);
      }
      expect(body).not.toContain("@");
    }
  });
});
