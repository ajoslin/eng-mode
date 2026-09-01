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

describe("thermo-nuclear stays explicit-only", () => {
  it("Opening a PR no longer auto-runs thermo-nuclear; the explicit skill remains", async () => {
    const gates = await read("skills/eng-mode/playbooks/pre-pr-gates.md");
    expect(gates).toContain("`pre-pr-swarm`");
    expect(gates).not.toContain("two seats");
    expect(gates).not.toContain("three seats");
    expect(gates).toContain('"pre-pr-swarm": "ran"');
    expect(gates).not.toContain("meaningful-contribution");

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
