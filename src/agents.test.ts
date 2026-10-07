import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAgentFields, type ParsedAgentFields } from "@oh-my-pi/pi-coding-agent/discovery/helpers";
import { resolveSpawnPolicy } from "@oh-my-pi/pi-coding-agent/task/spawn-policy";
import { canSpawnAtDepth } from "@oh-my-pi/pi-coding-agent/task/types";
import { parse } from "yaml";
import { agentNames, agentSkillsAllowlist, skillNames, type AgentName } from "./manifest.ts";

const root = join(import.meta.dir, "..");
const maxRecursionDepth = 2;
const leadDepth = 0;
const routerSkill = "eng-mode";
const builtinAgents = ["task", "scout", "sonic", "reviewer", "security-reviewer"] as const;
const dispatchable = new Set<string>([...builtinAgents, ...agentNames]);

interface ShippedAgent {
  readonly name: AgentName;
  readonly fields: ParsedAgentFields;
  readonly body: string;
}

async function loadAgent(name: AgentName): Promise<ShippedAgent> {
  const text = await readFile(join(root, "agents", `${name}.md`), "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`agents/${name}.md has no frontmatter`);
  const fields = parseAgentFields(parse(match[1] ?? ""));
  if (!fields) throw new Error(`agents/${name}.md is missing name or description`);
  return { name, fields, body: match[2] ?? "" };
}

const agents = await Promise.all(agentNames.map(loadAgent));

function declaredSpawns(fields: ParsedAgentFields): readonly string[] | null {
  const spawns = fields.spawns === undefined ? "" : fields.spawns === "*" ? "*" : fields.spawns.join(",");
  const policy = resolveSpawnPolicy(spawns);
  return policy.enabled ? policy.allowedAgents : [];
}

function canSpawn(fields: ParsedAgentFields, target: string): boolean {
  const allowed = declaredSpawns(fields);
  return allowed === null || allowed.includes(target);
}

function dispatchTargets(text: string): Set<string> {
  const targets = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
    const explicit = [...sentence.matchAll(/agent: "([^"]+)"/g)].map((match) => match[1] ?? "");
    if (explicit.length > 0) {
      for (const name of explicit) targets.add(name);
      continue;
    }
    if (!/\b(spawn|dispatch|launch)/i.test(sentence)) continue;
    for (const match of sentence.matchAll(/`([a-z][a-z-]*)`/g)) {
      const name = match[1] ?? "";
      if (name !== "task" && dispatchable.has(name)) targets.add(name);
    }
  }
  return targets;
}

const skillDispatchCache = new Map<string, Promise<Set<string>>>();

function skillDispatches(skill: string): Promise<Set<string>> {
  let cached = skillDispatchCache.get(skill);
  if (!cached) {
    cached = (async () => {
      const targets = new Set<string>();
      for await (const file of new Bun.Glob("**/*.md").scan(join(root, "skills", skill))) {
        const text = await readFile(join(root, "skills", skill, file), "utf8");
        for (const target of dispatchTargets(text)) targets.add(target);
      }
      return targets;
    })();
    skillDispatchCache.set(skill, cached);
  }
  return cached;
}

function skillsRunBy(agent: ShippedAgent): Set<string> {
  const skills = new Set<string>();
  for (const skill of agent.fields.autoloadSkills ?? []) {
    if (skill === routerSkill) for (const reachable of agentSkillsAllowlist) skills.add(reachable);
    else skills.add(skill);
  }
  for (const match of agent.body.matchAll(/(?:`\/?|\*\*)([a-z][a-z-]*)(?:`|\*\*)/g)) {
    const name = match[1] ?? "";
    if ((skillNames as readonly string[]).includes(name)) skills.add(name);
  }
  return skills;
}

function deepestDepths(): Map<string, number> {
  const depths = new Map<string, number>();
  const visit = (name: string, depth: number): void => {
    if ((depths.get(name) ?? -1) >= depth) return;
    depths.set(name, depth);
    const shipped = agents.find((agent) => agent.name === name);
    if (!shipped || !canSpawnAtDepth(maxRecursionDepth, depth)) return;
    const allowed = declaredSpawns(shipped.fields);
    for (const target of allowed ?? dispatchable) visit(target, depth + 1);
  };
  for (const name of dispatchable) visit(name, leadDepth + 1);
  return depths;
}

describe("shipped agent spawn graph", () => {
  it("lets every agent spawn each agent its skills dispatch under OMP's spawn policy", async () => {
    const depths = deepestDepths();
    const blocked: string[] = [];
    for (const agent of agents) {
      if (!canSpawnAtDepth(maxRecursionDepth, depths.get(agent.name) ?? leadDepth + 1)) continue;
      for (const skill of skillsRunBy(agent)) {
        for (const target of await skillDispatches(skill)) {
          if (!canSpawn(agent.fields, target)) {
            blocked.push(`agents/${agent.name}.md runs skills/${skill} which dispatches '${target}'; add ${target} to its spawns`);
          }
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  it("finds the dispatches the writers depend on", async () => {
    expect([...(await skillDispatches("no-comments"))]).toEqual(["comment-sicko"]);
    expect(await skillDispatches("how")).toContain("scout");
    expect(await skillDispatches("show-me-your-work")).toContain("reviewer");
  });

  it("declares spawns only on agents that run above OMP's maximum task depth", () => {
    const depths = deepestDepths();
    const violations: string[] = [];
    for (const agent of agents) {
      const allowed = declaredSpawns(agent.fields);
      if (allowed !== null && allowed.length === 0) continue;
      const depth = depths.get(agent.name) ?? leadDepth + 1;
      if (!canSpawnAtDepth(maxRecursionDepth, depth)) {
        violations.push(`agents/${agent.name}.md declares spawns but is reachable at task depth ${depth}; remove its spawns`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("never lets a writer spawn another writer", () => {
    const writers = agents.filter(({ fields }) => fields.tools === undefined).map(({ name }) => name);
    expect(writers).toEqual(["implementation-agent", "judgment-agent", "design-agent"]);
    for (const agent of agents) {
      const allowed = declaredSpawns(agent.fields) ?? [...dispatchable];
      expect({ agent: agent.name, writers: allowed.filter((target) => writers.includes(target as AgentName)) }).toEqual({ agent: agent.name, writers: [] });
    }
  });

  it("never gives a shipped agent wildcard spawns", () => {
    for (const { name, fields } of agents) {
      expect({ name, spawns: fields.spawns }).not.toEqual({ name, spawns: "*" });
    }
  });
});
