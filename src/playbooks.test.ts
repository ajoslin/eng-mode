import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

async function read(relative: string): Promise<string> {
  return readFile(join(root, relative), "utf8");
}

describe("babysit playbook merge default", () => {
  it("squash-merges once green and approved, and does not stop at merge-ready", async () => {
    const babysit = await read("skills/eng-mode/playbooks/babysit.md");
    expect(babysit).toContain(
      "`drive` (the undeclared default) squash-merges once CI is green, required approvals are in, the review-agent loop is quiet, and there is no blocking change-request.",
    );
    expect(babysit).toContain("Skip merge only if the operator explicitly says not to merge.");
    expect(babysit).toContain("Do not merge while parked.");
    expect(babysit).not.toContain("Never merge");
    expect(babysit).not.toContain("The lead stops at merge-ready");
  });

  it("router names the default squash-merge", async () => {
    const skill = await read("skills/eng-mode/SKILL.md");
    expect(skill).toContain("PR health through squash-merge when green and approved");
  });

  it("opening-a-pr still refuses to merge from that playbook", async () => {
    const opening = await read("skills/eng-mode/playbooks/opening-a-pr.md");
    expect(opening).toContain("Do not merge from this playbook");
    expect(opening).not.toContain("meaningful-contribution");
  });

  it("autopilot-stack still forbids merge", async () => {
    const stack = await read("skills/eng-mode/playbooks/autopilot-stack.md");
    expect(stack).toContain("Never merge or arm auto-merge");
    expect(stack).toContain("Babysit in `check` mode");
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
    expect(autonomous).toContain("invoke `loop` with a prompt and limit");
    expect(autonomous).toContain("stop `loop`, then complete `goal`");
  });
});
