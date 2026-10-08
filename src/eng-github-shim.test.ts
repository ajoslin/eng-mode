import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { installEngGithubShim, SHIM_MARKER } from "./eng-github-shim.ts";

const repoRoot = resolve(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "eng-github-shim-"));
  dirs.push(dir);
  return dir;
}

function runShim(binDir: string, args: string[]) {
  return Bun.spawnSync([join(binDir, "eng-github"), ...args], {
    env: { PATH: "/usr/bin:/bin", HOME: tempDir() },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("eng-github shim", () => {
  it("runs the installed plugin's CLI from a bare launchd-style PATH", () => {
    const binDir = tempDir();
    expect(installEngGithubShim({ packageRoot: repoRoot, binDir, bunCandidates: ["/nonexistent/bun", process.execPath] })).toBe("written");
    expect(statSync(join(binDir, "eng-github")).mode & 0o111).toBe(0o111);

    const result = runShim(binDir, ["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toStartWith("usage: eng-github COMMAND [args]");
  });

  it("is idempotent and repoints at the current plugin copy after an upgrade", () => {
    const binDir = tempDir();
    const options = { packageRoot: "/old/plugin", binDir, bunCandidates: [process.execPath] };
    expect(installEngGithubShim(options)).toBe("written");
    expect(installEngGithubShim(options)).toBe("unchanged");
    expect(installEngGithubShim({ ...options, packageRoot: repoRoot })).toBe("written");
    expect(runShim(binDir, ["--help"]).exitCode).toBe(0);
    expect(readdirSync(binDir)).toEqual(["eng-github"]);
  });

  it("never overwrites an eng-github the operator installed", () => {
    const binDir = tempDir();
    writeFileSync(join(binDir, "eng-github"), "#!/bin/sh\necho mine\n");
    expect(installEngGithubShim({ packageRoot: repoRoot, binDir, bunCandidates: [process.execPath] })).toBe("foreign-file");
    expect(readFileSync(join(binDir, "eng-github"), "utf8")).not.toContain(SHIM_MARKER);
  });

  it("fails with exit 127 and names the missing script when the plugin is gone", () => {
    const binDir = tempDir();
    installEngGithubShim({ packageRoot: "/gone/plugin", binDir, bunCandidates: [process.execPath] });
    const result = runShim(binDir, ["--help"]);
    expect(result.exitCode).toBe(127);
    expect(result.stderr.toString()).toContain("/gone/plugin/skills/eng-github/scripts/eng-github.ts is missing");
  });
});

const LONG_PATH = /scripts\/eng-github\.ts/;
const SHIPPED_TEXT = ["skills", "agents", "docs", ".agents/skills"];

function textFiles(directory: string): string[] {
  return readdirSync(join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return textFiles(path);
    return entry.isFile() && /\.(md|ya?ml)$/.test(path) ? [path] : [];
  });
}

const FALLBACK_HOMES = [".agents/skills/eng-github/SKILL.md", "skills/eng-github/SKILL.md"];

describe("agent-facing eng-github instructions", () => {
  it("tell agents to run `eng-github`; only the skill's one fallback note names the bun script", () => {
    const hits = [...SHIPPED_TEXT.flatMap(textFiles), "README.md"].flatMap((path) =>
      readFileSync(join(repoRoot, path), "utf8").split("\n").flatMap((line) => (LONG_PATH.test(line) ? [path] : [])));
    expect(hits.sort()).toEqual(FALLBACK_HOMES);
  });

  it("never use the retired `eg` alias", () => {
    const offenders = [...SHIPPED_TEXT.flatMap(textFiles), "README.md"].flatMap((path) =>
      readFileSync(join(repoRoot, path), "utf8").split("\n").flatMap((line, index) =>
        /(^|[\s`(\[])eg (?=[a-z-]+\b)|`eg`/.test(line) ? [`${path}:${index + 1}`] : []));
    expect(offenders).toEqual([]);
  });
});
