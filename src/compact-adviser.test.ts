import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, observeKeySource, type Paths } from "./compact-adviser.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function paths(): Promise<Paths> {
  const home = await mkdtemp(join(tmpdir(), "eng-compact-adviser-"));
  roots.push(home);
  const configRoot = join(home, ".omp");
  const agentDir = join(configRoot, "agent");
  const cwd = join(home, "repo");
  await Promise.all([mkdir(agentDir, { recursive: true }), mkdir(cwd, { recursive: true })]);
  return { agentDir, configRoot, cwd, home };
}

describe("compact-adviser key gate", () => {
  it("never enables or installs without a key, and disables an enabled plugin", () => {
    expect(decide({ keySource: "missing", installed: false, enabled: false, configExists: false })).toEqual([]);
    expect(decide({ keySource: "missing", installed: true, enabled: false, configExists: false })).toEqual([]);
    expect(decide({ keySource: "missing", installed: true, enabled: true, configExists: true })).toEqual(["disable"]);
  });

  it("installs, enables, and seeds auto mode once a key exists", () => {
    expect(decide({ keySource: "env", installed: false, enabled: false, configExists: false })).toEqual([
      "install",
      "write-default-config",
    ]);
    expect(decide({ keySource: ".env", installed: true, enabled: false, configExists: true })).toEqual(["enable"]);
    expect(decide({ keySource: "saved", installed: true, enabled: true, configExists: true })).toEqual([]);
  });
});

describe("compact-adviser key sources", () => {
  it("prefers env, then saved settings, then dotenv files in OMP load order", async () => {
    const p = await paths();
    expect(observeKeySource(p, {})).toBe("missing");
    expect(observeKeySource(p, { TYPESAFE_API_KEY: " " })).toBe("missing");

    await writeFile(join(p.home, ".env"), "# comment\nexport TYPESAFE_API_KEY='home'\n");
    expect(observeKeySource(p, {})).toBe(".env");

    await writeFile(join(p.agentDir, "compact-adviser.json"), JSON.stringify({ typesafeApiKey: "saved" }));
    expect(observeKeySource(p, {})).toBe("saved");

    expect(observeKeySource(p, { TYPESAFE_API_KEY: "env" })).toBe("env");
  });

  it("ignores a saved key that is blank and a dotenv assignment for another name", async () => {
    const p = await paths();
    await writeFile(join(p.agentDir, "compact-adviser.json"), JSON.stringify({ typesafeApiKey: "" }));
    await writeFile(join(p.cwd, ".env"), "TYPESAFE_API_KEY_OLD=x\nOTHER=TYPESAFE_API_KEY\n");
    expect(observeKeySource(p, {})).toBe("missing");
    await writeFile(join(p.cwd, ".env"), "TYPESAFE_API_KEY=\nTYPESAFE_API_KEY=\"late\"\n");
    expect(observeKeySource(p, {})).toBe(".env");
  });
});
