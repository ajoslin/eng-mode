import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngGithubError } from "../skills/eng-github/scripts/lib/errors.ts";
import { cascadeRebase } from "../skills/eng-github/scripts/lib/rebase.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
setDefaultTimeout(30_000);

function sh(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function commit(cwd: string, file: string, content: string): string {
  writeFileSync(join(cwd, file), content);
  sh(cwd, "add", file);
  sh(cwd, "commit", "-q", "-m", `edit ${file}`);
  return sh(cwd, "rev-parse", "HEAD");
}

function setup(): { work: string; heads: Record<string, string> } {
  const root = mkdtempSync(join(tmpdir(), "eg-stack-"));
  dirs.push(root);
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  sh(root, "init", "-q", "--bare", "-b", "main", origin);
  sh(root, "clone", "-q", origin, work);
  sh(work, "checkout", "-q", "-b", "main");
  commit(work, "base.txt", "base\n");
  const heads: Record<string, string> = {};
  let parent = "main";
  for (const name of ["l1", "l2", "l3"]) {
    sh(work, "checkout", "-q", "-b", name, parent);
    heads[name] = commit(work, `${name}.txt`, `${name}\n`);
    parent = name;
  }
  sh(work, "push", "-q", "origin", "main", "l1", "l2", "l3");
  sh(work, "checkout", "-q", "main");
  commit(work, "main.txt", "main moved\n");
  sh(work, "push", "-q", "origin", "main");
  sh(work, "checkout", "-q", "l2");
  return { work, heads };
}

const layers = (heads: Record<string, string>) =>
  ["l1", "l2", "l3"].map((branch, index) => ({ number: index + 1, branch, recordedHead: heads[branch]! }));

describe("cascadeRebase", () => {
  test("each layer carries only its own commit on the new base", async () => {
    const { work, heads } = setup();
    const result = await cascadeRebase({ cwd: work, base: "main", layers: layers(heads) });
    expect(result.layers.map((layer) => layer.oldHead)).toEqual([heads.l1!, heads.l2!, heads.l3!]);
    sh(work, "fetch", "-q", "origin");
    expect(sh(work, "log", "--format=%s", "origin/main..origin/l1")).toBe("edit l1.txt");
    expect(sh(work, "log", "--format=%s", "origin/l1..origin/l2")).toBe("edit l2.txt");
    expect(sh(work, "log", "--format=%s", "origin/l2..origin/l3")).toBe("edit l3.txt");
    expect(sh(work, "rev-parse", "origin/l3")).toBe(result.layers[2]!.newHead);
    expect(sh(work, "symbolic-ref", "--short", "HEAD")).toBe("l2");
    expect(result.layers.map((layer) => layer.local)).toEqual(["updated", "updated", "updated"]);
    for (const layer of result.layers) expect(sh(work, "rev-parse", layer.branch)).toBe(layer.newHead);
    expect(sh(work, "status", "--porcelain")).toBe("");
    expect(existsSync(join(work, "main.txt"))).toBe(true);
  });

  test("a local branch that moved past its recorded head is left alone", async () => {
    const { work, heads } = setup();
    sh(work, "checkout", "-q", "l1");
    const local = commit(work, "local.txt", "unpushed\n");
    sh(work, "checkout", "-q", "l2");
    const result = await cascadeRebase({ cwd: work, base: "main", layers: layers(heads) });
    expect(result.layers.map((layer) => layer.local)).toEqual(["diverged", "updated", "updated"]);
    expect(sh(work, "rev-parse", "l1")).toBe(local);
  });

  test("a symlinked cwd still moves the checked-out branch and skips another worktree's branch", async () => {
    const { work, heads } = setup();
    const other = `${work}-other`;
    dirs.push(other);
    sh(work, "worktree", "add", "-q", other, "l3");
    const link = `${work}-link`;
    dirs.push(link);
    symlinkSync(work, link);
    const result = await cascadeRebase({ cwd: link, base: "main", layers: layers(heads) });
    expect(result.layers.map((layer) => layer.local)).toEqual(["updated", "updated", "checked-out-elsewhere"]);
    expect(sh(work, "rev-parse", "HEAD")).toBe(result.layers[1]!.newHead);
    expect(sh(work, "rev-parse", "l3")).toBe(heads.l3!);
  });

  test("conflict stops at the right layer and restores the worktree", async () => {
    const { work, heads } = setup();
    sh(work, "checkout", "-q", "main");
    commit(work, "l2.txt", "conflicting\n");
    sh(work, "push", "-q", "origin", "main");
    sh(work, "checkout", "-q", "l2");
    const error = await cascadeRebase({ cwd: work, base: "main", layers: layers(heads) }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EngGithubError);
    expect((error as EngGithubError).exit).toBe("conflict");
    expect((error as EngGithubError).details).toEqual({ number: 2, branch: "l2", files: ["l2.txt"] });
    expect(sh(work, "symbolic-ref", "--short", "HEAD")).toBe("l2");
    expect(sh(work, "status", "--porcelain")).toBe("");
    expect(sh(work, "ls-remote", "origin", "refs/heads/l1").split("\t")[0]).toBe(heads.l1!);
  });

  test("force-with-lease refuses when a branch moved since the recorded sha", async () => {
    const { work, heads } = setup();
    sh(work, "checkout", "-q", "l3");
    const moved = commit(work, "extra.txt", "pushed by someone else\n");
    sh(work, "push", "-q", "origin", "l3");
    sh(work, "checkout", "-q", "l2");
    const error = await cascadeRebase({ cwd: work, base: "main", layers: layers(heads) }).catch((caught: unknown) => caught);
    expect((error as EngGithubError).exit).toBe("changed");
    expect(sh(work, "ls-remote", "origin", "refs/heads/l3").split("\t")[0]).toBe(moved);
    expect(sh(work, "ls-remote", "origin", "refs/heads/l1").split("\t")[0]).toBe(heads.l1!);
  });

  test("a force-rewritten base does not replay commits removed from it", async () => {
    const { work } = setup();
    sh(work, "checkout", "-q", "main");
    const rewritten = sh(work, "rev-parse", "HEAD");
    const dropped = commit(work, "dropped.txt", "dropped\n");
    sh(work, "push", "-q", "origin", "main");
    sh(work, "checkout", "-q", "-b", "x2");
    const l4 = commit(work, "l4.txt", "l4\n");
    sh(work, "push", "-q", "origin", "x2");
    sh(work, "push", "-q", "--force", "origin", `${rewritten}:refs/heads/main`);
    sh(work, "update-ref", "refs/remotes/origin/main", dropped);
    await cascadeRebase({ cwd: work, base: "main", layers: [{ number: 4, branch: "x2", recordedHead: l4 }] });
    sh(work, "fetch", "-q", "origin");
    expect(sh(work, "log", "--format=%s", "origin/main..origin/x2")).toBe("edit l4.txt");
  });

  test("a squash-merged lower layer stays out of the next layer's range", async () => {
    const { work, heads } = setup();
    sh(work, "checkout", "-q", "main");
    sh(work, "merge", "-q", "--squash", "l1");
    writeFileSync(join(work, "review.txt"), "review fix\n");
    sh(work, "add", "review.txt");
    sh(work, "commit", "-q", "-m", "squash l1");
    sh(work, "push", "-q", "origin", "main");
    sh(work, "checkout", "-q", "l2");
    await cascadeRebase({
      cwd: work,
      base: "main",
      layers: [
        { number: 2, branch: "l2", recordedHead: heads.l2!, parentHead: heads.l1! },
        { number: 3, branch: "l3", recordedHead: heads.l3!, parentHead: heads.l2! },
      ],
    });
    sh(work, "fetch", "-q", "origin");
    expect(sh(work, "log", "--format=%s", "origin/main..origin/l2")).toBe("edit l2.txt");
    expect(sh(work, "log", "--format=%s", "origin/l2..origin/l3")).toBe("edit l3.txt");
  });

  test("a recorded parent that is not an ancestor is refused as ambiguous", async () => {
    const { work, heads } = setup();
    const error = await cascadeRebase({
      cwd: work,
      base: "main",
      layers: [{ number: 2, branch: "l2", recordedHead: heads.l2!, parentHead: heads.l3! }],
    }).catch((caught: unknown) => caught);
    expect((error as EngGithubError).exit).toBe("changed");
    expect(sh(work, "ls-remote", "origin", "refs/heads/l2").split("\t")[0]).toBe(heads.l2!);
  });

  test("an in-progress rebase is refused and left intact", async () => {
    const { work, heads } = setup();
    const stopped = Bun.spawnSync(["git", "rebase", "-q", "-x", "false", "main"], {
      cwd: work,
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
    });
    expect(stopped.exitCode).not.toBe(0);
    const marker = join(work, sh(work, "rev-parse", "--git-path", "rebase-merge"));
    expect(existsSync(marker)).toBe(true);
    expect(sh(work, "status", "--porcelain")).toBe("");
    const error = await cascadeRebase({ cwd: work, base: "main", layers: layers(heads) }).catch((caught: unknown) => caught);
    expect((error as EngGithubError).exit).toBe("usage");
    expect(existsSync(marker)).toBe(true);
    expect(sh(work, "ls-remote", "origin", "refs/heads/l1").split("\t")[0]).toBe(heads.l1!);
  });
});
