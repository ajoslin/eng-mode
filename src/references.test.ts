import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const externalSkills = [
  { name: "project-standards", reason: "Each repository supplies its engineering contract." },
  { name: "verify-project", reason: "Each repository supplies its product verification contract." },
];
const notSkillLoads = [
  { name: "goal", reason: "OMP operator goal command" },
  { name: "guided-goal", reason: "OMP guided goal command" },
  { name: "handoff", reason: "OMP session handoff command" },
  { name: "loop", reason: "OMP operator loop command" },
  { name: "tools", reason: "OMP tool inventory command" },
  { name: "compact-adviser", reason: "Companion plugin command, not a skill" },
  { name: "deslop", reason: "Cursor command eng-help names as replaced" },
  { name: "orchestrate", reason: "eng-help states no such skill exists" },
  { name: "easy", reason: "verify-project asserts Eng Mode never registers it" },
  { name: "settings", reason: "Example app URL route in prototype/UI.md" },
  { name: "principle-", reason: "Prefix the operator types to list principle skills" },
];

function markdownFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.isFile() && path.endsWith(".md") ? [path] : [];
  });
}

function references(text: string): { name: string; index: number }[] {
  const found: { name: string; index: number }[] = [];
  for (const pattern of [
    /skill:\/\/([a-z][a-z0-9-]*)/g,
    /(?<![a-z0-9-(]|, )`\/([a-z][a-z0-9-]*-?)(?=[\s`])/g,
    /\*\*([a-z][a-z0-9-]*)\*\*(?:\s+and\s+\*\*([a-z][a-z0-9-]*)\*\*)?\s+(?:principle\s+)?skills?\b/g,
    /(?:Read|read|Use|use|Apply|apply|Run|run)\s+`([a-z][a-z0-9-]*skill(?:-[a-z0-9-]+)?)`(?=\s+(?:for|skill|before|and|first))/g,
  ]) {
    for (const match of text.matchAll(pattern)) {
      for (const name of match.slice(1)) if (name) found.push({ name, index: match.index });
    }
  }
  return found;
}

function missingReferences(path: string, text: string): string[] {
  return references(text).flatMap(({ name, index }) => {
    if (existsSync(join(root, "skills", name, "SKILL.md")) ||
      (path.startsWith(".agents/skills/") && existsSync(join(root, ".agents/skills", name, "SKILL.md"))) ||
      externalSkills.some((skill) => skill.name === name) ||
      notSkillLoads.some((entry) => entry.name === name)) return [];
    const line = text.slice(0, index).split("\n").length;
    const fix = existsSync(join(root, "skills", `principle-${name}`, "SKILL.md"))
      ? `did you mean principle-${name}?` : "ship this skill or remove the required load";
    return [`${path}:${line} ${name} → ${fix}`];
  });
}

describe("runtime skill references", () => {
  test("names the canonical skill when a bold short name will not resolve", () => {
    expect(missingReferences("skills/example/SKILL.md", "Apply the **type-system-discipline** principle skill first.")).toEqual([
      "skills/example/SKILL.md:1 type-system-discipline → did you mean principle-type-system-discipline?",
    ]);
    expect(missingReferences("skills/example/SKILL.md", "Use `missing-example-skill` for GitHub operations.")).toEqual([
      "skills/example/SKILL.md:1 missing-example-skill → ship this skill or remove the required load",
    ]);
  });

  test("every skill load in shipped markdown resolves", () => {
    const failures = ["skills", "agents", ".agents/skills"].flatMap(markdownFiles)
      .flatMap((path) => missingReferences(path, readFileSync(join(root, path), "utf8")));
    expect(failures).toEqual([]);
  });
});
