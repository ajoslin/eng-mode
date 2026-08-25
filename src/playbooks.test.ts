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
  });

  it("autopilot-stack still forbids merge", async () => {
    const stack = await read("skills/eng-mode/playbooks/autopilot-stack.md");
    expect(stack).toContain("Never merge or arm auto-merge");
  });
});
