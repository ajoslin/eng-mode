import { flag, headPairs, oneOf, positiveInt, required, type ParsedArgs } from "../lib/args.ts";
import type { GitHubClient } from "../lib/client.ts";
import type { CommandTable } from "../lib/command.ts";
import { ApiError, EngGithubError, UsageError } from "../lib/errors.ts";
import { mergeAsync, type MergeMethod } from "../lib/merge-async.ts";
import { git, gitOut } from "../lib/process.ts";
import { cascadeRebase } from "../lib/rebase.ts";
import { currentRepo, parsePrRef, type Repo } from "../lib/ref.ts";

interface StackPull {
  readonly number: number;
  readonly state: string;
  readonly draft?: boolean;
  readonly merged_at?: string | null;
  readonly head: { readonly ref: string; readonly sha: string };
}

interface Stack {
  readonly number: number;
  readonly base: { readonly ref: string };
  readonly open: boolean;
  readonly pull_requests: readonly StackPull[];
}

interface Layer {
  readonly number: number;
  readonly branch: string;
  readonly headSha: string;
  readonly state: "open" | "closed" | "merged";
  readonly draft: boolean;
}

interface StackView {
  readonly number: number;
  readonly base: string;
  readonly open: boolean;
  readonly layers: readonly Layer[];
}

interface PullSummary {
  readonly number: number;
  readonly base: { readonly ref: string };
}

const stacksPath = (repo: Repo) => `repos/${repo.owner}/${repo.name}/stacks`;

function view(stack: Stack): StackView {
  return {
    number: stack.number,
    base: stack.base.ref,
    open: stack.open,
    layers: stack.pull_requests.map((pull) => ({
      number: pull.number,
      branch: pull.head.ref,
      headSha: pull.head.sha,
      state: pull.merged_at ? "merged" : pull.state === "open" ? "open" : "closed",
      draft: pull.draft === true,
    })),
  };
}

async function stackForPr(client: GitHubClient, repo: Repo, number: number): Promise<Stack | null> {
  try {
    const { data } = await client.rest<Stack[]>({ path: `${stacksPath(repo)}?pull_request=${number}` });
    return data.find((stack) => stack.pull_requests.some((pull) => pull.number === number)) ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

async function stackByNumber(client: GitHubClient, repo: Repo, number: number): Promise<Stack> {
  return (await client.rest<Stack>({ path: `${stacksPath(repo)}/${number}` })).data;
}

async function namedStack(args: ParsedArgs, client: GitHubClient, cwd: string): Promise<{ repo: Repo; stack: Stack }> {
  const repo = await currentRepo(cwd);
  return { repo, stack: await stackByNumber(client, repo, positiveInt(required(args, "stack"), "stack", 1)) };
}

function checkHeads(layers: readonly Layer[], heads: ReadonlyMap<number, string>): void {
  for (const layer of layers.filter((candidate) => candidate.state === "open")) {
    const pinned = heads.get(layer.number);
    if (pinned === undefined || !layer.headSha.toLowerCase().startsWith(pinned)) {
      throw new EngGithubError("changed", `stack layer #${layer.number} (${layer.branch}) is at ${layer.headSha}, not --heads ${pinned ?? "(missing)"}`, {
        number: layer.number,
        headSha: layer.headSha,
      });
    }
  }
}

async function pushBranch(branch: string, cwd: string): Promise<void> {
  const result = await git(["push", "origin", `refs/heads/${branch}:refs/heads/${branch}`], cwd);
  if (result.code !== 0) throw new EngGithubError("failure", `git push origin ${branch} was rejected: ${result.stderr.trim()}`);
}

async function ensurePull(client: GitHubClient, repo: Repo, branch: string, base: string, cwd: string): Promise<number> {
  const pulls = `repos/${repo.owner}/${repo.name}/pulls`;
  const existing = (await client.rest<PullSummary[]>({ path: `${pulls}?head=${encodeURIComponent(`${repo.owner}:${branch}`)}&state=open` })).data[0];
  if (existing !== undefined) {
    if (existing.base.ref !== base) await client.rest({ method: "PATCH", path: `${pulls}/${existing.number}`, body: { base } });
    return existing.number;
  }
  await git(["fetch", "origin", base], cwd);
  const subjects = (await gitOut(["log", "--reverse", "--format=%s", `refs/remotes/origin/${base}..refs/heads/${branch}`], cwd)) ?? "";
  const title = subjects.split("\n")[0] || branch;
  return (await client.rest<PullSummary>({ method: "POST", path: pulls, body: { title, head: branch, base, body: "" } })).data.number;
}

async function pushAndOpen(client: GitHubClient, repo: Repo, base: string, branches: readonly string[], cwd: string): Promise<number[]> {
  const numbers: number[] = [];
  let parent = base;
  for (const branch of branches) {
    await pushBranch(branch, cwd);
    numbers.push(await ensurePull(client, repo, branch, parent, cwd));
    parent = branch;
  }
  return numbers;
}

function branchesOf(args: ParsedArgs): readonly string[] {
  if (args.positionals.length === 0) throw new UsageError("name at least one BRANCH");
  return args.positionals;
}

export const stackCommands: CommandTable = {
  "stack view": {
    async run({ client, args, cwd }) {
      if (flag(args, "stack") !== undefined) return view((await namedStack(args, client, cwd)).stack);
      const value = args.positionals[0];
      if (value === undefined) throw new UsageError("stack view needs REF or --stack N");
      const ref = await parsePrRef(value, cwd);
      const stack = await stackForPr(client, ref, ref.number);
      return stack === null ? null : view(stack);
    },
  },
  "stack submit": {
    async run({ client, args, cwd }) {
      const repo = await currentRepo(cwd);
      const numbers = await pushAndOpen(client, repo, required(args, "base"), branchesOf(args), cwd);
      const { data } = await client.rest<Stack>({ method: "POST", path: stacksPath(repo), body: { pull_requests: numbers } });
      return view(data);
    },
  },
  "stack add": {
    async run({ client, args, cwd }) {
      const { repo, stack } = await namedStack(args, client, cwd);
      const top = stack.pull_requests.at(-1);
      const numbers = await pushAndOpen(client, repo, top?.head.ref ?? stack.base.ref, branchesOf(args), cwd);
      try {
        await client.rest({ method: "POST", path: `${stacksPath(repo)}/${stack.number}/add`, body: { pull_requests: numbers } });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) throw new EngGithubError("changed", `stack ${stack.number} changed while adding; run stack view`);
        throw error;
      }
      return view(await stackByNumber(client, repo, stack.number));
    },
  },
  "stack rebase": {
    async run({ client, args, cwd }) {
      const { stack } = await namedStack(args, client, cwd);
      const current = view(stack);
      checkHeads(current.layers, headPairs(required(args, "heads")));
      const layers = current.layers.flatMap((layer, index) => {
        if (layer.state !== "open") return [];
        const parentHead = current.layers[index - 1]?.headSha;
        return [{ number: layer.number, branch: layer.branch, recordedHead: layer.headSha, ...(parentHead === undefined ? {} : { parentHead }) }];
      });
      return cascadeRebase({ cwd, base: current.base, layers });
    },
  },
  "stack merge": {
    async run({ client, args, cwd }) {
      const { repo, stack } = await namedStack(args, client, cwd);
      const target = positiveInt(required(args, "target"), "target", 1);
      const layers = view(stack).layers;
      const index = layers.findIndex((layer) => layer.number === target);
      const targetLayer = layers[index];
      if (targetLayer === undefined) throw new UsageError(`#${target} is not in stack ${stack.number}`);
      const upTo = layers.slice(0, index + 1);
      checkHeads(upTo, headPairs(required(args, "heads")));
      const drafts = upTo.filter((layer) => layer.state === "open" && layer.draft).map((layer) => `#${layer.number}`);
      if (drafts.length > 0) throw new UsageError(`draft layers cannot merge: ${drafts.join(", ")}`);
      const method = oneOf<MergeMethod>(flag(args, "method"), ["squash", "merge", "rebase"], "method", "squash");
      const result = await mergeAsync(client, { ...repo, number: target }, { head: targetLayer.headSha, method, action: "default" });
      if (result.status === "failed") throw new EngGithubError("conflict", `merge of #${target} failed`, result.details);
      return result;
    },
  },
  "stack unstack": {
    async run({ client, args, cwd }) {
      const { repo, stack } = await namedStack(args, client, cwd);
      await client.rest({ method: "POST", path: `${stacksPath(repo)}/${stack.number}/unstack` });
      return { number: stack.number, unstacked: true };
    },
  },
};
