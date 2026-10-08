import { bool, flag, flags, oneOf, required, type ParsedArgs } from "../lib/args.ts";
import type { CommandContext, CommandTable } from "../lib/command.ts";
import { ApiError, EngGithubError, UsageError } from "../lib/errors.ts";
import { fetchSnapshots } from "../lib/pr-query.ts";
import { mergeAsync } from "../lib/merge-async.ts";
import { currentRepo, parsePrRef, parseRepo, repoSlug, type PrRef } from "../lib/ref.ts";

function positional(args: ParsedArgs, index: number, name: string): string {
  const value = args.positionals[index];
  if (!value) throw new UsageError(`${name} is required`);
  return value;
}

function bodyFile(args: ParsedArgs): Promise<string> {
  if (flag(args, "body") !== undefined) throw new UsageError("use --body-file, not --body");
  return Bun.file(required(args, "body-file")).text();
}

function path(ref: PrRef, resource = "pulls"): string {
  return `repos/${repoSlug(ref)}/${resource}/${ref.number}`;
}

async function reference(ctx: CommandContext): Promise<PrRef> {
  return parsePrRef(positional(ctx.args, 0, "REF"), ctx.cwd);
}

async function snapshot(ctx: CommandContext, ref: PrRef) {
  const result = (await fetchSnapshots(ctx.client, [ref]))[0];
  if (!result) throw new EngGithubError("failure", "GitHub returned no pull request snapshot");
  return result;
}

async function graphql(ctx: CommandContext, query: string, variables: Record<string, unknown>): Promise<unknown> {
  const response = await ctx.client.graphql<unknown>({ query, variables });
  if (response.errors.length) throw new EngGithubError("failure", response.errors.map((error) => error.message ?? "GraphQL error").join("; "), { errors: response.errors });
  return response.data;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new EngGithubError("failure", "Invalid GitHub response", { response: value });
  return Object.fromEntries(Object.entries(value));
}

async function ownedThread(ctx: CommandContext, ref: PrRef): Promise<string> {
  const id = positional(ctx.args, 1, "THREAD_ID");
  const response = await ctx.client.graphql<{ node: { pullRequest?: { number: number; repository: { nameWithOwner: string } } } | null }>({
    query: "query($id: ID!) { node(id: $id) { ... on PullRequestReviewThread { pullRequest { number repository { nameWithOwner } } } } }",
    variables: { id },
  });
  const pr = response.data?.node?.pullRequest;
  if (!pr || pr.number !== ref.number || pr.repository.nameWithOwner.toLowerCase() !== repoSlug(ref).toLowerCase()) throw new UsageError(`thread ${id} does not belong to ${repoSlug(ref)}#${ref.number}`);
  if (response.errors.length) throw new EngGithubError("failure", "Cannot verify thread ownership", { errors: response.errors });
  return id;
}

async function resolve(ctx: CommandContext, resolved: boolean): Promise<unknown> {
  const ref = await reference(ctx);
  const thread = await ownedThread(ctx, ref);
  const operation = resolved ? "resolveReviewThread" : "unresolveReviewThread";
  const data = object(await graphql(ctx, `mutation($id: ID!) { ${operation}(input: {threadId: $id}) { thread { id isResolved } } }`, { id: thread }));
  const result = object(object(data[operation]).thread);
  if (typeof result.isResolved !== "boolean") throw new EngGithubError("failure", "GitHub returned no thread resolution state");
  return { thread, isResolved: result.isResolved };
}


async function merge(ctx: CommandContext): Promise<unknown> {
  const head = required(ctx.args, "head");
  const action = oneOf(flag(ctx.args, "action"), ["default", "direct", "queue"], "action", "default");
  if (action === "queue" && flag(ctx.args, "method") !== undefined) throw new UsageError("--action queue uses the merge queue's configured method; drop --method");
  const method = action === "queue" ? undefined : oneOf(flag(ctx.args, "method"), ["squash", "merge", "rebase"], "method", "squash");
  const ref = await reference(ctx);
  if ((await snapshot(ctx, ref)).headSha !== head) throw new EngGithubError("changed", "Pull request head differs from --head");
  let result;
  try {
    result = await mergeAsync(ctx.client, ref, { head, action, admin: bool(ctx.args, "admin"), ...(method === undefined ? {} : { method }) });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    if (action === "queue") throw new EngGithubError("failure", "GitHub has no async merge endpoint here, and --action queue cannot fall back to a direct merge", { status: error.status, response: error.body });
    return (await ctx.client.rest({ method: "PUT", path: `${path(ref)}/merge`, body: { sha: head, merge_method: method } })).data;
  }
  if (result.status === "failed") throw new EngGithubError("conflict", typeof result.details.message === "string" ? result.details.message : "GitHub merge failed", { status: result.status, details: result.details });
  return result;
}

export const mutationCommands: CommandTable = {
  "pr create": {
    booleans: ["draft"],
    async run(ctx) {
      const base = required(ctx.args, "base");
      const head = required(ctx.args, "head");
      const title = required(ctx.args, "title");
      const body = await bodyFile(ctx.args);
      const repo = await currentRepo(ctx.cwd);
      const response = await ctx.client.rest<{ number: number }>({ method: "POST", path: `repos/${repoSlug(repo)}/pulls`, body: { base, head, title, body, draft: bool(ctx.args, "draft") } });
      return snapshot(ctx, { ...repo, number: response.data.number });
    },
  },
  "pr edit": {
    booleans: ["ready", "draft"],
    async run(ctx) {
      if (bool(ctx.args, "ready") && bool(ctx.args, "draft")) throw new UsageError("--ready and --draft are mutually exclusive");
      const title = flag(ctx.args, "title");
      const body = flag(ctx.args, "body-file") === undefined ? undefined : await bodyFile(ctx.args);
      if (flag(ctx.args, "body") !== undefined) throw new UsageError("use --body-file, not --body");
      const ref = await reference(ctx);
      if (title !== undefined || body !== undefined) await ctx.client.rest({ method: "PATCH", path: path(ref), body: { ...(title === undefined ? {} : { title }), ...(body === undefined ? {} : { body }) } });
      const labels = flags(ctx.args, "add-label");
      if (labels.length) await ctx.client.rest({ method: "POST", path: `${path(ref, "issues")}/labels`, body: { labels } });
      for (const label of flags(ctx.args, "remove-label")) await ctx.client.rest({ method: "DELETE", path: `${path(ref, "issues")}/labels/${encodeURIComponent(label)}` });
      if (bool(ctx.args, "ready") || bool(ctx.args, "draft")) {
        const operation = bool(ctx.args, "ready") ? "markPullRequestReadyForReview" : "convertPullRequestToDraft";
        await graphql(ctx, `mutation($id: ID!) { ${operation}(input: {pullRequestId: $id}) { pullRequest { id } } }`, { id: (await snapshot(ctx, ref)).nodeId });
      }
      return snapshot(ctx, ref);
    },
  },
  comment: { async run(ctx) {
    const body = await bodyFile(ctx.args);
    return (await ctx.client.rest({ method: "POST", path: `${path(await reference(ctx), "issues")}/comments`, body: { body } })).data;
  } },
  reply: { async run(ctx) {
    const body = await bodyFile(ctx.args);
    const id = await ownedThread(ctx, await reference(ctx));
    return graphql(ctx, "mutation($id: ID!, $body: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $id, body: $body}) { comment { id body url } } }", { id, body });
  } },
  resolve: { run: (ctx) => resolve(ctx, true) },
  unresolve: { run: (ctx) => resolve(ctx, false) },
  review: { async run(ctx) {
    const kind = positional(ctx.args, 1, "review event");
    if (kind !== "approve" && kind !== "request-changes" && kind !== "comment") throw new UsageError("review event must be approve, request-changes, or comment");
    const body = flag(ctx.args, "body-file") !== undefined || kind !== "approve" ? await bodyFile(ctx.args) : undefined;
    if (flag(ctx.args, "body") !== undefined) throw new UsageError("use --body-file, not --body");
    if (kind !== "approve" && !body?.trim()) throw new UsageError(`${kind} requires a non-empty --body-file`);
    return (await ctx.client.rest({ method: "POST", path: `${path(await reference(ctx))}/reviews`, body: { event: kind === "approve" ? "APPROVE" : kind === "request-changes" ? "REQUEST_CHANGES" : "COMMENT", ...(body === undefined ? {} : { body }) } })).data;
  } },
  close: { async run(ctx) {
    return (await ctx.client.rest({ method: "PATCH", path: path(await reference(ctx)), body: { state: "closed" } })).data;
  } },
  "update-branch": { async run(ctx) {
    const head = required(ctx.args, "head");
    const ref = await reference(ctx);
    try {
      return (await ctx.client.rest({ method: "PUT", path: `${path(ref)}/update-branch`, body: { expected_head_sha: head } })).data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && /head|sha/i.test(JSON.stringify(error.body)) && /mismatch|match|changed/i.test(JSON.stringify(error.body))) throw new EngGithubError("changed", "Pull request head differs from --head", { response: error.body });
      throw error;
    }
  } },
  rerun: {
    booleans: ["failed"],
    async run(ctx) {
      const id = positional(ctx.args, 0, "RUN_ID");
      if (!/^[1-9]\d*$/.test(id)) throw new UsageError("RUN_ID must be a positive integer");
      const repoFlag = flag(ctx.args, "repo");
      const repo = repoFlag === undefined ? await currentRepo(ctx.cwd) : parseRepo(repoFlag);
      return (await ctx.client.rest({ method: "POST", path: `repos/${repoSlug(repo)}/actions/runs/${id}/${bool(ctx.args, "failed") ? "rerun-failed-jobs" : "rerun"}` })).data;
    },
  },
  merge: { booleans: ["admin"], run: merge },
  "auto-merge": { async run(ctx) {
    const action = positional(ctx.args, 1, "enable|disable");
    if (action !== "enable" && action !== "disable") throw new UsageError("auto-merge action must be enable or disable");
    const head = action === "enable" ? required(ctx.args, "head") : undefined;
    const method = oneOf(flag(ctx.args, "method"), ["squash", "merge", "rebase"], "method", "squash");
    const ref = await reference(ctx);
    const current = await snapshot(ctx, ref);
    if (head !== undefined && current.headSha !== head) throw new EngGithubError("changed", "Pull request head differs from --head");
    if (action === "enable") await graphql(ctx, "mutation($id: ID!, $head: GitObjectID!, $method: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: {pullRequestId: $id, expectedHeadOid: $head, mergeMethod: $method}) { pullRequest { id } } }", { id: current.nodeId, head, method: method.toUpperCase() });
    else await graphql(ctx, "mutation($id: ID!) { disablePullRequestAutoMerge(input: {pullRequestId: $id}) { pullRequest { id } } }", { id: current.nodeId });
    return snapshot(ctx, ref);
  } },
};
