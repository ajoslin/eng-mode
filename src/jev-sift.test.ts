import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactMatches, decide, observeKeySource, removeMcpConfig, setup, upsertMcpConfig, type Paths } from "./jev-sift.ts";

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
        await writeFile(file, `${name}=\nexport ${name}="test-dotenv"\n`);
        expect(observeKeySource(p, {})).toBe(".env");
        await rm(file);
      }
    }
  });

  it("does not fall back to the default keyfile when a custom file is missing or blank", async () => {
    const p = await paths();
    const directory = join(p.home, ".config", "jev-sift");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "api-key"), "default-test-key");
    const custom = join(p.home, "custom-key");
    await writeFile(join(directory, "config.json"), JSON.stringify({ apiKeyFile: custom }));
    expect(observeKeySource(p, {})).toBe("missing");
    await writeFile(custom, " \n");
    expect(observeKeySource(p, {})).toBe("missing");
    await writeFile(custom, "custom-test-key");
    expect(observeKeySource(p, {})).toBe("keyfile");
  });

  it("reads a custom config and its environment key, including OMP dotenv", async () => {
    const p = await paths();
    const config = join(p.home, "custom-config.json");
    await writeFile(config, JSON.stringify({ apiKeyEnv: "CUSTOM_JEV_KEY" }));
    expect(observeKeySource(p, { JEV_SIFT_CONFIG: config, CUSTOM_JEV_KEY: "test-custom" })).toBe("env");
    expect(observeKeySource(p, { JEV_SIFT_CONFIG: config, TYPESAFE_API_KEY: "test-fallback" })).toBe("env");
    await writeFile(join(p.cwd, ".env"), "export CUSTOM_JEV_KEY=test-dotenv\n");
    expect(observeKeySource(p, { JEV_SIFT_CONFIG: config })).toBe(".env");
  });

  it("rejects declare-only dotenv without rejecting an OMP-compatible assignment", async () => {
    const p = await paths();
    const file = join(p.cwd, ".env");
    await writeFile(file, "declare -x JEV_API_KEY=test-jev\n declare -x TYPESAFE_API_KEY=test-typesafe\n");
    expect(observeKeySource(p, {})).toBe("missing");
    await writeFile(file, "export JEV_API_KEY=test-jev\ndeclare -x JEV_API_KEY=\n");
    expect(observeKeySource(p, {})).toBe(".env");
  });

  it("does not expose invalid key configuration values in errors", async () => {
    const p = await paths();
    const config = join(p.home, "invalid-config.json");
    await writeFile(config, '{"apiKeyEnv":"private-test-value"');
    expect(() => observeKeySource(p, { JEV_SIFT_CONFIG: config })).toThrow("Invalid jev-sift key configuration");

    const missing = join(p.home, "missing-config.json");
    expect(() => observeKeySource(p, { JEV_SIFT_CONFIG: missing })).toThrow("Invalid jev-sift key configuration");
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
  it("fails closed on an existing lock and can proceed after its owner releases it", async () => {
    const p = await paths();
    const original = '{"mcpServers":{"jev-sift":{"command":"old"},"other":{"command":"keep"}}}';
    await writeFile(p.mcpConfig, original);
    await writeFile(`${p.mcpConfig}.lock`, "other-owner");
    expect(() => setup(p, {})).toThrow();
    expect(await readFile(p.mcpConfig, "utf8")).toBe(original);
    expect(await readFile(`${p.mcpConfig}.lock`, "utf8")).toBe("other-owner");
    await rm(`${p.mcpConfig}.lock`);
    expect(setup(p, {})).toEqual(["unregister"]);
    expect(JSON.parse(await readFile(p.mcpConfig, "utf8"))).toEqual({ mcpServers: { other: { command: "keep" } } });
    await expect(readFile(`${p.mcpConfig}.lock`, "utf8")).rejects.toThrow();
  });

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

describe("jev-sift tracked artifact", () => {
  it("reports a missing install root as not matching", async () => {
    const p = await paths();
    expect(artifactMatches(p.installRoot)).toBe(false);
  });

  it("reports an artifact without a checkout as not matching but rejects a malformed checkout", async () => {
    const p = await paths();
    await mkdir(join(p.installRoot, "dist"), { recursive: true });
    await writeFile(join(p.installRoot, "dist", "server.mjs"), "export const server = true;\n");
    expect(artifactMatches(p.installRoot)).toBe(false);
    await mkdir(join(p.installRoot, ".git"));
    expect(() => artifactMatches(p.installRoot)).toThrow("Unable to read or update the pinned jev-sift checkout");
  });

  it("rejects a modified or missing artifact even when the revision is unchanged", async () => {
    const p = await paths();
    await mkdir(join(p.installRoot, "dist"), { recursive: true });
    const file = join(p.installRoot, "dist", "server.mjs");
    await writeFile(file, "export const server = true;\n");
    const git = (...args: string[]) => execFileSync("git", ["-C", p.installRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init");
    git("add", "dist/server.mjs");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture");
    const revision = git("rev-parse", "HEAD");
    expect(artifactMatches(p.installRoot, revision)).toBe(true);
    await writeFile(file, "export const server = false;\n");
    expect(artifactMatches(p.installRoot, revision)).toBe(false);
    await rm(file);
    expect(artifactMatches(p.installRoot, revision)).toBe(false);
  });
});
