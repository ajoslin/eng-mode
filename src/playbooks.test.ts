import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

async function read(relative: string): Promise<string> {
  return readFile(join(root, relative), "utf8");
}

describe("babysit playbook merge default", () => {
  it("never auto-merges and stops at merge-ready", async () => {
    const babysit = await read("skills/eng-mode/playbooks/babysit.md");
    expect(babysit).toContain(
      "`drive` (the undeclared default) stops at merge-ready (CI green **and** review-agent loop quiet) and reports.",
    );
    expect(babysit).toContain("Never merge");
    expect(babysit).toContain("until it is green or blocked");
    expect(babysit).toContain("**Review-agent loop before merge-ready.**");
    expect(babysit).toContain("Do not merge.");
    expect(babysit).toContain("and user gate.");
    expect(babysit).toContain("Continue under a native `/goal`.");
    expect(babysit).toContain("Add sleep only if the operator asked for an interval.");
    expect(babysit).not.toContain("squash-merges once CI is green");
    expect(babysit).not.toContain("Skip merge only if the operator explicitly says not to merge.");
    expect(babysit).not.toContain("Do not merge while parked.");
    expect(babysit).not.toContain("until it is merged or blocked");
    expect(babysit).not.toContain("merge result");
  });

  it("router names PR health without squash-merge", async () => {
    const skill = await read("skills/eng-mode/SKILL.md");
    expect(skill).toContain("PR health: `playbooks/babysit.md`");
    expect(skill).not.toContain("PR health through squash-merge when green and approved");
  });

  it("opening-a-pr still refuses to merge from that playbook", async () => {
    const opening = await read("skills/eng-mode/playbooks/opening-a-pr.md");
    expect(opening).toContain("Do not merge from this playbook");
  });

  it("autopilot-stack still forbids merge", async () => {
    const stack = await read("skills/eng-mode/playbooks/autopilot-stack.md");
    expect(stack).toContain("Never merge or arm auto-merge");
  });
});
