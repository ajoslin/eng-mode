import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { installEngAdvisor } from "./eng-advisor.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))));

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "eng-advisor-"));
  roots.push(value);
  return value;
}

describe("Eng advisor installer", () => {
  it("preserves unrelated watchdog rules and advisors", async () => {
    const pluginRoot = join(import.meta.dir, "..");
    const agentDir = await root();
    await writeFile(join(agentDir, "WATCHDOG.md"), "User rule\n");
    await writeFile(join(agentDir, "WATCHDOG.yml"), "instructions: keep\nadvisors:\n  - name: Existing\n    tools: [read]\n");
    const first = installEngAdvisor({ pluginRoot, agentDir });
    expect(first.files.map((file) => file.status)).toEqual(["updated", "updated"]);
    const second = installEngAdvisor({ pluginRoot, agentDir });
    expect(second.files.map((file) => file.status)).toEqual(["unchanged", "unchanged"]);
    expect(await readFile(join(agentDir, "WATCHDOG.md"), "utf8")).toContain("User rule");
    const yaml = parse(await readFile(join(agentDir, "WATCHDOG.yml"), "utf8"));
    expect(yaml).toMatchObject({ instructions: "keep", advisors: [{ name: "Existing" }, { name: "Luna" }] });
  });

  it("installs idempotently and refreshes stale files", async () => {
    const pluginRoot = join(import.meta.dir, "..");
    const agentDir = await root();
    expect(installEngAdvisor({ pluginRoot, agentDir }).files.map((file) => file.status))
      .toEqual(["installed", "installed"]);
    expect(installEngAdvisor({ pluginRoot, agentDir }).files.map((file) => file.status))
      .toEqual(["unchanged", "unchanged"]);
    await writeFile(join(agentDir, "WATCHDOG.md"), "stale\n");
    expect(installEngAdvisor({ pluginRoot, agentDir }).files[0]?.status).toBe("updated");
    const markdown = await readFile(join(agentDir, "WATCHDOG.md"), "utf8");
    expect(markdown).toContain("stale");
    expect(markdown).toContain((await readFile(join(pluginRoot, "WATCHDOG.md"), "utf8")).trim());
  });
});
