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
  });
});

describe("commit and Graphite stacks", () => {
  it("opening-a-pr commits with omp commit and forbids git commit -m", async () => {
    const opening = await read("skills/eng-mode/playbooks/opening-a-pr.md");
    expect(opening).toContain("Use `omp commit`, never `git commit` / `git commit -m`");
    expect(opening).toContain("**graphite**");
    expect(opening).toContain("`gt submit --no-interactive`");
    expect(opening).toContain("`gh pr create --base` does not");
    expect(opening).toContain("Use one PR for ordinary coherent work");
    expect(opening).toContain("never split by arbitrary size thresholds or stack small work by default");
    expect(opening).not.toContain("github-stack");
    expect(opening).not.toContain("gh stack");
  });

  it("shipping and autopilot-stack use graphite submit", async () => {
    const shipping = await read("skills/eng-mode/playbooks/shipping.md");
    expect(shipping).toContain("**graphite**");
    expect(shipping).toContain("`gt submit --merge-when-ready --always --update-only --no-interactive`");
    expect(shipping).toContain("Never `gh pr merge` a stacked PR");
    expect(shipping).toContain("Never GitHub auto-merge on a stacked PR");
    expect(shipping).toContain("`gh pr merge <n> --disable-auto`");
    expect(shipping).not.toContain("github-stack");
    expect(shipping).not.toContain("Do not use Graphite");

    const stack = await read("skills/eng-mode/playbooks/autopilot-stack.md");
    expect(stack).toContain("**graphite**");
    expect(stack).toContain("`gt submit --no-interactive`");
    expect(stack).not.toContain("github-stack");
    expect(stack).not.toContain("gh stack");
  });

  it("graphite skill owns topology and commits with omp commit", async () => {
    const skill = await read("skills/graphite/SKILL.md");
    expect(skill).toContain("`gt submit --merge-when-ready --always --update-only --no-interactive`");
    expect(skill).toContain("omp commit");
    expect(skill).toContain("Workers never run `gt`");
    expect(skill).toContain("One stacker per stack");
    expect(skill).toContain("Never GitHub auto-merge on a stacked PR");
    expect(skill).toContain("Stacking is a review aid, not the default branch strategy");
    expect(skill).toContain("Split by independently understandable concerns, not arbitrary file or line counts");
    expect(skill).toContain("`gh pr merge --disable-auto`");
    expect(skill).not.toContain("github-stack");
  });

  it("router names graphite for landing", async () => {
    const skill = await read("skills/eng-mode/SKILL.md");
    expect(skill).toContain("Landing: `playbooks/shipping.md` and `graphite`.");
    expect(skill).toContain("then `omp commit`");
    expect(skill).not.toContain("github-stack");
    expect(skill).not.toContain("No Cursor or Graphite");
  });

  it("orchestrate and babysit ban workers from gt", async () => {
    const orchestrate = await read("skills/eng-mode/playbooks/orchestrate.md");
    expect(orchestrate).toContain("Workers never rebase and never run `gt`");
    expect(orchestrate).toContain("Exactly one stacker per stack may run `gt`");
    expect(orchestrate).toContain("Recompute `frontier.json` from `gt`");
    expect(orchestrate).toContain("FORBIDDEN    no rebase, no force-push, no gt,");
    expect(orchestrate).not.toContain("github-stack");
    expect(orchestrate).not.toContain("gh stack");
    expect(orchestrate).not.toContain("Do not use Graphite");

    const babysit = await read("skills/eng-mode/playbooks/babysit.md");
    expect(babysit).toContain("**graphite**");
    expect(babysit).toContain("Never run `gt`");
    expect(babysit).not.toContain("github-stack");
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
