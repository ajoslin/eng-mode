import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

async function read(relative: string): Promise<string> {
  return readFile(join(root, relative), "utf8");
}

describe("delivery authority", () => {
  it("Babysit stops at merge-ready and never lands", async () => {
    const babysit = await read("skills/eng-mode/playbooks/babysit.md");
    expect(babysit).toContain("Babysit never mutates stack topology.");
    expect(babysit).toContain("Every mode stops and reports at merge-ready or at a blocker");
    expect(babysit).toContain("none merges, auto-merges, force-pushes, restacks, or changes stack topology");
    expect(babysit).toContain("Shipping, which alone may land with explicit authority");
    expect(babysit).not.toContain("squash-merges once");
  });

  it("routes PR health to Babysit and landing to Shipping", async () => {
    const skill = await read("skills/eng-mode/SKILL.md");
    expect(skill).toContain("Babysit ends at merge-ready and never merges; landing belongs to Shipping.");
  });

  it("Opening a PR hands off without merging", async () => {
    const opening = await read("skills/eng-mode/playbooks/opening-a-pr.md");
    expect(opening).toContain("A one-shot opener never babysits, watches, merges, or changes stack topology.");
    expect(opening).not.toContain("meaningful-contribution");
  });

  it("Autopilot-stack leaves landing to the operator through Shipping", async () => {
    const stack = await read("skills/eng-mode/playbooks/autopilot-stack.md");
    expect(stack).toContain("The operator lands through **Shipping**.");
    expect(stack).toContain("Nothing in this playbook merges, closes, or arms auto-merge.");
  });
});

describe("lead context budget", () => {
  it("loads guard-the-context-window before every Eng Mode session", async () => {
    const skill = await read("skills/eng-mode/SKILL.md");
    const rule = skill.indexOf("Read `principle-guard-the-context-window` in every session.");
    expect(rule).toBeGreaterThan(-1);
    expect(skill.slice(rule)).toContain("open `checkpoint` before the first read");
    expect(skill.slice(rule)).toContain("`rewind` with the findings before editing or yielding");
    expect(rule).toBeLessThan(skill.indexOf("Match exactly one primary playbook"));
    expect(rule).toBeLessThan(skill.indexOf("## Repository contracts"));
  });
});

describe("thermo-nuclear stays explicit-only", () => {
  it("Pre-PR gates run one fresh-eyes seat with one question and no browser", async () => {
    const gates = await read("skills/eng-mode/playbooks/pre-pr-gates.md");
    expect(gates).toContain("`fresh-eyes`");
    expect(gates).toContain("Name the question.");
    expect(gates).toContain("No browser on this seat.");
    expect(gates).toContain('"fresh-eyes": "ran"');
    expect(gates).not.toContain("pre-pr-swarm");
    expect(gates).not.toContain("two seats");
    expect(gates).not.toContain("three seats");
    expect(gates).not.toContain("meaningful-contribution");

    const seat = await read("skills/fresh-eyes/SKILL.md");
    expect(seat).toContain("disable-model-invocation: true");
    expect(seat).toContain("**One question.**");
    expect(seat).toContain("browser: not-run");
    expect(seat).not.toContain("swarm");
  });

  it("Opening a PR no longer auto-runs thermo-nuclear; the explicit skill remains", async () => {
    const rubric = await read("skills/thermo-nuclear-code-quality-review/SKILL.md");
    expect(rubric).toContain("disable-model-invocation: true");

    const contribution = await read("skills/meaningful-contribution/SKILL.md");
    expect(contribution).toContain("disable-model-invocation: true");

    const skill = await read("skills/eng-mode/SKILL.md");
    expect(skill).toContain(
      "Harsh maintainability review, explicit only: the `thermo-nuclear-code-quality-review` skill directly",
    );
    expect(skill).toContain(
      "Proven-working-code bar, explicit only: the `meaningful-contribution` skill directly",
    );

    const opening = await read("skills/eng-mode/playbooks/opening-a-pr.md");
    const autopilotFull = await read("skills/eng-mode/playbooks/autopilot-full.md");
    const autopilotStack = await read("skills/eng-mode/playbooks/autopilot-stack.md");
    expect(opening).not.toContain("meaningful-contribution");
    expect(autopilotFull).not.toContain("meaningful-contribution");
    expect(autopilotStack).not.toContain("meaningful-contribution");

    const { skillNames } = await import("./manifest.ts");
    expect(skillNames).toContain("thermo-nuclear-code-quality-review");
    expect(skillNames).toContain("meaningful-contribution");
    expect(skillNames.filter((name) => name.startsWith("thermo-nuclear-"))).toEqual([
      "thermo-nuclear-code-quality-review",
    ]);
  });
});

describe("pstack 0.15.0 port contracts", () => {
  it("registers the two new principle leaves", async () => {
    const { skillNames } = await import("./manifest.ts");
    expect(skillNames).toContain("principle-attack-the-premise");
    expect(skillNames).toContain("principle-test-behavior-not-implementation");
    expect(skillNames.filter((name) => name.startsWith("principle-"))).toHaveLength(23);

    const skill = await read("skills/eng-mode/SKILL.md");
    expect(skill).toContain("`principle-attack-the-premise`");
    expect(skill).toContain("`principle-test-behavior-not-implementation`");
    expect(skill).toContain("Cite only principles whose leaf you read this session.");
    expect(skill).toContain("Operators may also invoke `/principle-<name>` directly.");
    expect(skill).toContain("When an applicability line matches, read that sibling `principle-*` skill now.");
    expect(skill).not.toContain("The first item is to read every applicable");
    expect(skill).not.toContain("copied in verbatim");
    expect(skill).toContain("never appear as todos");

    const { readdirSync, readFileSync } = await import("node:fs");
    const principleDirs = readdirSync(join(root, "skills")).filter((name) => name.startsWith("principle-"));
    expect(principleDirs).toHaveLength(23);
    for (const name of principleDirs) {
      const text = readFileSync(join(root, "skills", name, "SKILL.md"), "utf8");
      expect(text).toContain(`Use for /${name}.`);
      expect(text).toContain("disable-model-invocation: true");
    }
  });

  it("makes /how explain-only and drops critique references", async () => {
    const how = await read("skills/how/SKILL.md");
    expect(how).toContain("## Step 1. Assess Complexity");
    expect(how).toContain("`scout`");
    expect(how).not.toContain("Critique");
    expect(how).not.toContain("critic-prompt");
    expect(how).not.toContain("critique-rubric");

    const investigation = await read("skills/eng-mode/playbooks/investigation.md");
    expect(investigation).toContain("Route through the **how** skill.");
    expect(investigation).not.toContain("Critique mode");

    const { existsSync } = await import("node:fs");
    expect(existsSync(join(root, "skills/how/references/critic-prompt.md"))).toBe(false);
    expect(existsSync(join(root, "skills/how/references/critique-rubric.md"))).toBe(false);
  });

  it("treats the PR body as a briefing with a squash length cap", async () => {
    const opening = await read("skills/eng-mode/playbooks/opening-a-pr.md");
    expect(opening).toContain("The PR body is a briefing, not the lab notebook.");
    expect(opening).toContain("longer than about 40 lines, cut the body");
    expect(opening).toContain("`## Why`");
    expect(opening).toContain("`## Scope`");
    expect(opening).toContain("`## Tradeoffs`");
    expect(opening).toContain("`## Blast Radius`");
    expect(opening).toContain("`## Verification`");
    expect(opening).toContain("Never reset, discard, or overwrite user work.");
  });
});

describe("goal and loop ownership", () => {
  it("assigns durable objectives to goal and bounded repetition to loop", async () => {
    const [skill, autonomous] = await Promise.all([
      read("skills/eng-mode/SKILL.md"),
      read("skills/eng-mode/playbooks/autonomous-run.md"),
    ]);

    expect(skill).toContain("`goal` owns the durable objective.");
    expect(skill).toContain("`loop` owns bounded repetition.");
    expect(autonomous).toContain("invoke `loop` with a fixed heartbeat");
    expect(autonomous).toContain("stop `loop`, then complete `goal`");
  });
});
