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

describe("commit and native GitHub stacks", () => {
  it("opening-a-pr commits with omp commit and forbids git commit -m", async () => {
    const opening = await read("skills/eng-mode/playbooks/opening-a-pr.md");
    expect(opening).toContain("Use `omp commit`, never `git commit` / `git commit -m`");
    expect(opening).toContain("**github-stack**");
    expect(opening).toContain("`gh pr create --base` does not");
    expect(opening).toContain("Use one PR for ordinary coherent work");
    expect(opening).toContain("never split by arbitrary size thresholds or stack small work by default");
  });

  it("shipping and autopilot-stack use github-stack submit", async () => {
    const shipping = await read("skills/eng-mode/playbooks/shipping.md");
    expect(shipping).toContain("**github-stack**");
    expect(shipping).toContain("`gh stack merge <target> --yes`");
    expect(shipping).toContain("Never `gh pr merge` a stacked PR");

    const stack = await read("skills/eng-mode/playbooks/autopilot-stack.md");
    expect(stack).toContain("`gh stack submit --auto`");
  });

  it("github-stack skill creates native stacks and commits with omp commit", async () => {
    const skill = await read("skills/github-stack/SKILL.md");
    expect(skill).toContain("`gh pr create --base <branch>` is not one");
    expect(skill).toContain("`gh stack submit --auto`");
    expect(skill).toContain("omp commit");
    expect(skill).toContain("exit 9");
    expect(skill).toContain("Stacking is a review aid, not the default branch strategy");
    expect(skill).toContain("Split by independently understandable concerns, not arbitrary file or line counts");
  });

  it("router names github-stack for landing", async () => {
    const skill = await read("skills/eng-mode/SKILL.md");
    expect(skill).toContain("Landing: `playbooks/shipping.md` and `github-stack`.");
    expect(skill).toContain("then `omp commit`");
  });
});
