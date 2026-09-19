import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, observeKeySource, removeMcpConfig, setup, upsertMcpConfig, type Paths } from "./jev-sift.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function paths(): Promise<Paths> {
  const home = await mkdtemp(join(tmpdir(), "eng-jev-sift-"));
  roots.push(home);
  const configRoot = join(home, ".omp");
  const agentDir = join(configRoot, "agent");
  const cwd = join(home, "repo");
  await Promise.all([mkdir(agentDir, { recursive: true }), mkdir(cwd, { recursive: true })]);
  return { home, configRoot, agentDir, cwd, installRoot: join(configRoot, "jev-sift"), mcpConfig: join(agentDir, "mcp.json") };
}

describe("jev-sift decision table", () => {
  it("never installs without a key and removes an existing registration", () => {
    for (const installed of [false, true]) {
      expect(decide({ keySource: "missing", installed, registered: false })).toEqual([]);
      expect(decide({ keySource: "missing", installed, registered: true })).toEqual(["unregister"]);
    }
  });

  it("installs before registering and keeps a current installation unchanged", () => {
    for (const keySource of ["env", "keyfile", ".env"] satisfies Array<"env" | "keyfile" | ".env">) {
      expect(decide({ keySource, installed: false, registered: false })).toEqual(["install", "register"]);
      expect(decide({ keySource, installed: false, registered: true })).toEqual(["install", "register"]);
      expect(decide({ keySource, installed: true, registered: false })).toEqual(["register"]);
      expect(decide({ keySource, installed: true, registered: true })).toEqual([]);
    }
  });
});

describe("jev-sift key gate", () => {
  it("accepts either environment key before reading keyfile or dotenv files", async () => {
    const p = await paths();
    await mkdir(join(p.home, ".config", "jev-sift", "api-key"), { recursive: true });
    expect(observeKeySource(p, { JEV_API_KEY: "test-jev" })).toBe("env");
    expect(observeKeySource(p, { JEV_API_KEY: " ", TYPESAFE_API_KEY: "test-typesafe" })).toBe("env");
    expect(observeKeySource(p, { JEV_API_KEY: "test-jev", TYPESAFE_API_KEY: "test-typesafe" })).toBe("env");
  });

  it("prefers a nonblank keyfile over dotenv and ignores blank credentials", async () => {
    const p = await paths();
    expect(observeKeySource(p, { JEV_API_KEY: " ", TYPESAFE_API_KEY: "\t" })).toBe("missing");
    await mkdir(join(p.home, ".config", "jev-sift"), { recursive: true });
    const keyfile = join(p.home, ".config", "jev-sift", "api-key");
    await writeFile(keyfile, " \n");
    expect(observeKeySource(p, {})).toBe("missing");
    await writeFile(join(p.cwd, ".env"), "export TYPESAFE_API_KEY='test-dotenv'\n");
    expect(observeKeySource(p, {})).toBe(".env");
    await writeFile(keyfile, "test-keyfile\n");
    expect(observeKeySource(p, {})).toBe("keyfile");
  });

  it("recognizes both names throughout the OMP dotenv chain using the shared parser", async () => {
    const p = await paths();
    for (const directory of [p.cwd, p.agentDir, p.configRoot, p.home]) {
      for (const name of ["JEV_API_KEY", "TYPESAFE_API_KEY"]) {
        const file = join(directory, ".env");
        await writeFile(file, `${name}_OLD=ignored\nOTHER=${name}\n${name}=\n`);
        expect(observeKeySource(p, {})).toBe("missing");
        await writeFile(file, `${name}=\ndeclare -x ${name}="test-dotenv"\n`);
        expect(observeKeySource(p, {})).toBe(".env");
        await rm(file);
      }
    }
  });
});

describe("jev-sift MCP config", () => {
  it("upserts the pinned server command while preserving every unrelated JSON value", () => {
    const original = JSON.stringify({ version: 2, metadata: { enabled: false, values: [null, 42] }, mcpServers: {
      other: { command: "other", env: { TOKEN: "test-value" } },
      "jev-sift": { command: "old", env: { JEV_API_KEY: "obsolete" } },
    } });
    const updated = upsertMcpConfig(original, "/isolated/jev-sift");
    expect(JSON.parse(updated)).toEqual({ version: 2, metadata: { enabled: false, values: [null, 42] }, mcpServers: {
      other: { command: "other", env: { TOKEN: "test-value" } },
      "jev-sift": { type: "stdio", command: "node", args: ["/isolated/jev-sift/dist/server.mjs"] },
    } });
    expect(upsertMcpConfig(updated, "/isolated/jev-sift")).toBe(updated);
    expect(JSON.parse(original).mcpServers["jev-sift"].command).toBe("old");
  });

  it("creates an absent map and removes only the owned entry", () => {
    expect(JSON.parse(upsertMcpConfig(undefined, "/install"))).toEqual({ mcpServers: {
      "jev-sift": { type: "stdio", command: "node", args: ["/install/dist/server.mjs"] },
    } });
    const original = '{"metadata":{"keep":true},"mcpServers":{"other":{"url":"https://example.invalid"},"jev-sift":{"command":"old"}}}';
    const removed = removeMcpConfig(original);
    expect(removed).toBeDefined();
    expect(JSON.parse(removed ?? "null")).toEqual({ metadata: { keep: true }, mcpServers: { other: { url: "https://example.invalid" } } });
    expect(removeMcpConfig(removed)).toBe(removed);
    expect(removeMcpConfig(undefined)).toBeUndefined();
    expect(removeMcpConfig('{ "keep": true }')).toBe('{ "keep": true }');
  });

  it("rejects invalid JSON and map shapes rather than losing unrelated config", () => {
    for (const text of ["{", "null", "[]", "false", '{"mcpServers":null}', '{"mcpServers":[]}', '{"mcpServers":42}']) {
      expect(() => upsertMcpConfig(text, "/install")).toThrow();
      expect(() => removeMcpConfig(text)).toThrow();
    }
  });

  it("preserves prototype-named JSON properties", () => {
    const text = '{"__proto__":{"keep":true},"mcpServers":{"__proto__":{"command":"other"}}}';
    const removed = removeMcpConfig(upsertMcpConfig(text, "/install"));
    expect(JSON.parse(removed ?? "null")).toEqual(JSON.parse(text));
  });
});

describe("jev-sift local setup", () => {
  it("removes a keyless registration without installing or changing another server", async () => {
    const p = await paths();
    await writeFile(p.mcpConfig, '{"keep":true,"mcpServers":{"jev-sift":{"command":"old"},"other":{"command":"keep"}}}');
    expect(setup(p, {})).toEqual(["unregister"]);
    expect(JSON.parse(await readFile(p.mcpConfig, "utf8"))).toEqual({ keep: true, mcpServers: { other: { command: "keep" } } });
    expect(setup(p, {})).toEqual([]);
  });

  it("does not create MCP config when there is no key or registration", async () => {
    const p = await paths();
    expect(setup(p, {})).toEqual([]);
    await expect(readFile(p.mcpConfig, "utf8")).rejects.toThrow();
  });

  it("leaves malformed config untouched", async () => {
    const p = await paths();
    const malformed = '{"mcpServers":';
    await writeFile(p.mcpConfig, malformed);
    expect(() => setup(p, {})).toThrow();
    expect(await readFile(p.mcpConfig, "utf8")).toBe(malformed);
  });
});
