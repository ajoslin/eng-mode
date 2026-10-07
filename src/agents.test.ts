import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAgentFields, type ParsedAgentFields } from "@oh-my-pi/pi-coding-agent/discovery/helpers";
import { resolveSpawnPolicy } from "@oh-my-pi/pi-coding-agent/task/spawn-policy";
import { parse } from "yaml";
import { agentNames } from "./manifest.ts";

const root = join(import.meta.dir, "..");

interface ShippedAgent {
  readonly fields: ParsedAgentFields;
  readonly body: string;
}

async function loadAgent(name: string): Promise<ShippedAgent> {
  const text = await readFile(join(root, "agents", `${name}.md`), "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`agents/${name}.md has no frontmatter`);
  const fields = parseAgentFields(parse(match[1] ?? ""));
  if (!fields) throw new Error(`agents/${name}.md is missing name or description`);
  return { fields, body: match[2] ?? "" };
}

function canSpawn(fields: ParsedAgentFields, target: string): boolean {
  const spawns = fields.spawns === undefined ? "" : fields.spawns === "*" ? "*" : fields.spawns.join(",");
  const policy = resolveSpawnPolicy(spawns);
  return policy.enabled && (policy.allowedAgents === null || policy.allowedAgents.includes(target));
}

async function noCommentsTarget(): Promise<string> {
  const skill = await readFile(join(root, "skills/no-comments/SKILL.md"), "utf8");
  const target = /agent: "([^"]+)"/.exec(skill)?.[1];
  if (!target) throw new Error("skills/no-comments names no spawn target");
  return target;
}

async function toldToRunNoComments(agent: ShippedAgent): Promise<boolean> {
  if (agent.body.includes("no-comments")) return true;
  for (const skill of agent.fields.autoloadSkills ?? []) {
    const text = await readFile(join(root, "skills", skill, "SKILL.md"), "utf8");
    if (text.includes("run `no-comments`")) return true;
  }
  return false;
}

describe("no-comments spawn reachability", () => {
  it("spawns a shipped agent that can delete comments", async () => {
    const target = await noCommentsTarget();
    expect(agentNames).toContain(target as (typeof agentNames)[number]);
    const sicko = await loadAgent(target);
    expect(sicko.fields.name).toBe(target);
    expect(sicko.fields.tools).toContain("edit");
  });

  it("lets every writer told to run /no-comments spawn its target under OMP's spawn policy", async () => {
    const target = await noCommentsTarget();
    const blocked: string[] = [];
    let writers = 0;
    for (const name of agentNames) {
      if (name === target) continue;
      const agent = await loadAgent(name);
      const { tools } = agent.fields;
      const writes = tools === undefined || tools.includes("edit") || tools.includes("write");
      if (!writes || !(await toldToRunNoComments(agent))) continue;
      writers += 1;
      if (!canSpawn(agent.fields, target)) blocked.push(name);
    }
    expect(writers).toBe(3);
    expect(blocked).toEqual([]);
  });

  it("never gives a shipped agent wildcard spawns", async () => {
    for (const name of agentNames) {
      const { fields } = await loadAgent(name);
      expect({ name, spawns: fields.spawns }).not.toEqual({ name, spawns: "*" });
    }
  });
});
