import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { EngGithubError, UsageError } from "./errors.ts";
import { git, gitOut } from "./process.ts";

export interface CascadeLayer {
  readonly number: number;
  readonly branch: string;
  readonly recordedHead: string;
  readonly parentHead?: string;
}

export interface CascadeInput {
  readonly cwd: string;
  readonly base: string;
  readonly layers: readonly CascadeLayer[];
  readonly remote?: string;
}

export type LocalUpdate = "updated" | "absent" | "diverged" | "checked-out-elsewhere";

export interface CascadeResult {
  readonly layers: readonly { number: number; branch: string; oldHead: string; newHead: string; local?: LocalUpdate }[];
}

async function must(args: readonly string[], cwd: string, what: string): Promise<string> {
  const result = await git(args, cwd);
  if (result.code !== 0) throw new EngGithubError("failure", `${what} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

async function rebaseLayer(cwd: string, layer: CascadeLayer, newBase: string, oldParent: string): Promise<string> {
  const result = await git(["-c", "rebase.updateRefs=false", "rebase", "--onto", newBase, oldParent, layer.recordedHead], cwd);
  if (result.code === 0) return must(["rev-parse", "HEAD"], cwd, "git rev-parse HEAD");
  const files = ((await gitOut(["diff", "--name-only", "--diff-filter=U"], cwd)) ?? "").split("\n").filter(Boolean);
  await git(["rebase", "--abort"], cwd);
  if (files.length === 0) throw new EngGithubError("failure", `rebase of #${layer.number} (${layer.branch}) failed: ${result.stderr.trim()}`);
  throw new EngGithubError("conflict", `rebase of #${layer.number} (${layer.branch}) conflicts in ${files.join(", ")}`, {
    number: layer.number,
    branch: layer.branch,
    files,
  });
}

async function pushWithLease(cwd: string, remote: string, rebased: CascadeResult["layers"]): Promise<void> {
  const leases = rebased.map((layer) => `--force-with-lease=refs/heads/${layer.branch}:${layer.oldHead}`);
  const refspecs = rebased.map((layer) => `${layer.newHead}:refs/heads/${layer.branch}`);
  const result = await git(["push", "--atomic", ...leases, remote, ...refspecs], cwd);
  if (result.code === 0) return;
  const rejected = /stale info|rejected|fetch first|non-fast-forward/i.test(result.stderr);
  throw new EngGithubError(rejected ? "changed" : "failure", `push of rebased stack refused: ${result.stderr.trim()}`, {
    branches: rebased.map((layer) => layer.branch),
  });
}

const IN_PROGRESS = ["rebase-merge", "rebase-apply", "sequencer", "MERGE_HEAD", "CHERRY_PICK_HEAD"];

async function refuseInProgress(cwd: string): Promise<void> {
  for (const name of IN_PROGRESS) {
    const path = await must(["rev-parse", "--git-path", name], cwd, "git rev-parse --git-path");
    if (existsSync(isAbsolute(path) ? path : join(cwd, path))) throw new UsageError(`stack rebase refuses to run while a git operation is in progress (${name})`);
  }
}

async function ensureCommit(cwd: string, remote: string, sha: string): Promise<boolean> {
  if ((await git(["cat-file", "-e", `${sha}^{commit}`], cwd)).code === 0) return true;
  await git(["fetch", remote, sha], cwd);
  return (await git(["cat-file", "-e", `${sha}^{commit}`], cwd)).code === 0;
}

async function cutoffFor(cwd: string, remote: string, layer: CascadeLayer, parentHead: string | undefined, priorBase: string): Promise<string> {
  const cutoff = parentHead ?? (await gitOut(["merge-base", priorBase, layer.recordedHead], cwd));
  const valid =
    cutoff !== undefined &&
    (await ensureCommit(cwd, remote, cutoff)) &&
    (await git(["merge-base", "--is-ancestor", cutoff, layer.recordedHead], cwd)).code === 0;
  if (!valid) {
    throw new EngGithubError("changed", `ambiguous topology: no recorded cutoff below #${layer.number} (${layer.branch}) at ${layer.recordedHead}`, {
      number: layer.number,
      cutoff: cutoff ?? null,
    });
  }
  return cutoff;
}

async function otherWorktreeBranches(cwd: string): Promise<Set<string>> {
  const top = realpathSync(await must(["rev-parse", "--show-toplevel"], cwd, "git rev-parse --show-toplevel"));
  const branches = new Set<string>();
  let path: string | undefined;
  for (const line of ((await gitOut(["worktree", "list", "--porcelain"], cwd)) ?? "").split("\n")) {
    if (line.startsWith("worktree ")) {
      const listed = line.slice("worktree ".length);
      path = existsSync(listed) ? realpathSync(listed) : listed;
    } else if (line.startsWith("branch refs/heads/") && path !== top) branches.add(line.slice("branch refs/heads/".length));
  }
  return branches;
}

async function updateLocal(cwd: string, head: string, layer: CascadeResult["layers"][number], elsewhere: Set<string>): Promise<LocalUpdate> {
  const local = await gitOut(["rev-parse", "-q", "--verify", `refs/heads/${layer.branch}`], cwd);
  if (local === undefined || local === "") return "absent";
  if (local !== layer.oldHead) return "diverged";
  if (head === layer.branch) {
    await must(["reset", "-q", "--keep", layer.newHead], cwd, `git reset --keep ${layer.branch}`);
    return "updated";
  }
  if (elsewhere.has(layer.branch)) return "checked-out-elsewhere";
  await must(["update-ref", `refs/heads/${layer.branch}`, layer.newHead, layer.oldHead], cwd, `git update-ref ${layer.branch}`);
  return "updated";
}

export async function cascadeRebase(input: CascadeInput): Promise<CascadeResult> {
  const { cwd, base } = input;
  const remote = input.remote ?? "origin";
  if (((await gitOut(["status", "--porcelain"], cwd)) ?? "x") !== "") throw new UsageError("stack rebase needs a clean worktree");
  await refuseInProgress(cwd);
  const baseRef = `refs/remotes/${remote}/${base}`;
  const priorBase = await gitOut(["rev-parse", "-q", "--verify", `${baseRef}^{commit}`], cwd);
  await must(["fetch", remote, base, ...input.layers.map((layer) => layer.branch)], cwd, `git fetch ${remote}`);
  const head = (await gitOut(["symbolic-ref", "-q", "--short", "HEAD"], cwd)) ?? (await must(["rev-parse", "HEAD"], cwd, "git rev-parse HEAD"));
  const rebased: { number: number; branch: string; oldHead: string; newHead: string }[] = [];
  try {
    let newBase = await must(["rev-parse", baseRef], cwd, `resolve ${remote}/${base}`);
    let previous: string | undefined;
    for (const layer of input.layers) {
      const parent = await cutoffFor(cwd, remote, layer, layer.parentHead ?? previous, priorBase || newBase);
      newBase = await rebaseLayer(cwd, layer, newBase, parent);
      rebased.push({ number: layer.number, branch: layer.branch, oldHead: layer.recordedHead, newHead: newBase });
      previous = layer.recordedHead;
    }
  } finally {
    await git(["checkout", "-q", head], cwd);
  }
  if (rebased.length === 0) return { layers: rebased };
  await pushWithLease(cwd, remote, rebased);
  const elsewhere = await otherWorktreeBranches(cwd);
  const layers = [];
  for (const layer of rebased) layers.push({ ...layer, local: await updateLocal(cwd, head, layer, elsewhere) });
  return { layers };
}
