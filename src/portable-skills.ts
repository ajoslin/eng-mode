import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { skillNames, type SkillName } from "./manifest.ts";

/**
 * Skills copied verbatim into a host repository's `.agents/skills/` so agents
 * without the OMP plugin (Codex, Claude Code) read the same text OMP users do.
 * OMP resolves the plugin copy first (omp-plugins priority 90 beats .agents 70),
 * so the copy only ever serves non-OMP agents. Everything else in `skillNames`
 * is OMP-routed (playbooks, eng_orch, panel seats) and is deleted from the
 * repository when it shadows a manifest name.
 */
export const portableSkillNames = [
  "unslop",
  "typescript-best-practices",
  "tdd",
  "diagnosing-bugs",
  "domain-modeling",
  "codebase-design",
  "technical-writing",
  "meaningful-contribution",
  "create-verification-skill",
  "maintain-verification-skill",
  "blast-radius",
] as const satisfies readonly SkillName[];

export const syncManifestFile = ".eng-mode-sync.json";

export interface SyncManifest {
  readonly sourceCommit: string;
  readonly skills: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface SyncReport {
  readonly copied: readonly string[];
  readonly removed: readonly string[];
  readonly drift: readonly string[];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

function fileHashes(dir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const file of walk(dir)) hashes[relative(dir, file)] = createHash("sha256").update(readFileSync(file)).digest("hex");
  return hashes;
}

function shadowedNonPortable(repoSkillsDir: string): string[] {
  if (!existsSync(repoSkillsDir)) return [];
  return readdirSync(repoSkillsDir)
    .filter((name) => (skillNames as readonly string[]).includes(name) && !(portableSkillNames as readonly string[]).includes(name))
    .filter((name) => statSync(join(repoSkillsDir, name)).isDirectory())
    .sort();
}

export function syncPortableSkills(engRoot: string, repoRoot: string, sourceCommit: string): SyncReport {
  const repoSkillsDir = resolve(repoRoot, ".agents", "skills");
  mkdirSync(repoSkillsDir, { recursive: true });
  const removed = shadowedNonPortable(repoSkillsDir);
  for (const name of removed) rmSync(join(repoSkillsDir, name), { recursive: true });
  const skills: Record<string, Record<string, string>> = {};
  for (const name of portableSkillNames) {
    const src = resolve(engRoot, "skills", name);
    const dst = join(repoSkillsDir, name);
    rmSync(dst, { recursive: true, force: true });
    for (const file of walk(src)) {
      const rel = relative(src, file);
      mkdirSync(join(dst, rel, ".."), { recursive: true });
      writeFileSync(join(dst, rel), readFileSync(file));
    }
    skills[name] = fileHashes(dst);
  }
  const manifest: SyncManifest = { sourceCommit, skills };
  writeFileSync(join(repoSkillsDir, syncManifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
  return { copied: [...portableSkillNames], removed, drift: [] };
}

export function checkPortableSkills(engRoot: string, repoRoot: string): SyncReport {
  const repoSkillsDir = resolve(repoRoot, ".agents", "skills");
  const drift: string[] = [];
  for (const name of shadowedNonPortable(repoSkillsDir)) drift.push(`${name}: shadows an eng-mode skill that is not portable; delete it`);
  for (const name of portableSkillNames) {
    const src = resolve(engRoot, "skills", name);
    const dst = join(repoSkillsDir, name);
    if (!existsSync(dst)) {
      drift.push(`${name}: missing from repository`);
      continue;
    }
    const want = fileHashes(src);
    const have = fileHashes(dst);
    for (const rel of new Set([...Object.keys(want), ...Object.keys(have)])) {
      if (want[rel] !== have[rel]) drift.push(`${name}/${rel}: differs from eng-mode`);
    }
  }
  return { copied: [], removed: [], drift };
}
