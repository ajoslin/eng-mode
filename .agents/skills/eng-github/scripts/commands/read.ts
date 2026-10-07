import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bool,
  flag,
  flags,
  oneOf,
  positiveInt,
  required,
} from "../lib/args.ts";
import type { CommandContext, CommandTable } from "../lib/command.ts";
import { ApiError, RateLimitedError, UsageError } from "../lib/errors.ts";
import {
  activity,
  fetchFingerprints,
  fetchSnapshots,
  nodes,
  number,
  object,
  query,
  text,
  thread,
  threadSelection,
  type Snapshot,
  type Fingerprint,
} from "../lib/pr-query.ts";
import { currentRepo, parsePrRef, repoSlug, type PrRef } from "../lib/ref.ts";
import { evaluateWake, failing } from "../lib/watch-eval.ts";

async function refs(ctx: CommandContext): Promise<PrRef[]> {
  if (!ctx.args.positionals.length)
    throw new UsageError("At least one REF is required");
  return Promise.all(
    ctx.args.positionals.map((value) => parsePrRef(value, ctx.cwd)),
  );
}
async function single(ctx: CommandContext): Promise<PrRef> {
  const value = ctx.args.positionals[0];
  if (!value) throw new UsageError("REF is required");
  return parsePrRef(value, ctx.cwd);
}
async function snapshot(ctx: CommandContext): Promise<Snapshot> {
  const result = (await fetchSnapshots(ctx.client, [await single(ctx)]))[0];
  if (!result) throw new ApiError(404, "PR not found", null);
  return result;
}
async function allThreads(ctx: CommandContext) {
  const ref = await single(ctx);
  const result = [];
  let cursor: string | null = null;
  do {
    const data = await query(
      ctx.client,
      `query($cursor:String){repository(owner:${JSON.stringify(ref.owner)},name:${JSON.stringify(ref.name)}){pullRequest(number:${ref.number}){reviewThreads(first:100,after:$cursor){nodes{${threadSelection}} pageInfo{hasNextPage endCursor}}}}}`,
      { cursor },
    );
    const connection = object(
      object(object(data.repository).pullRequest).reviewThreads,
    );
    for (const raw of nodes(connection)) {
      const value = thread(raw);
      let page = object(object(raw).comments);
      while (object(page.pageInfo).hasNextPage === true) {
        const next = await query(
          ctx.client,
          `query($id:ID!,$cursor:String){node(id:$id){... on PullRequestReviewThread{comments(first:100,after:$cursor){totalCount nodes{author{login} body createdAt} pageInfo{hasNextPage endCursor}}}}}`,
          { id: value.id, cursor: object(page.pageInfo).endCursor },
        );
        page = object(object(next.node).comments);
        value.comments.push(...nodes(page).map(activity));
      }
      result.push(value);
    }
    const info = object(connection.pageInfo);
    cursor = info.hasNextPage === true ? text(info.endCursor) : null;
  } while (cursor !== null);
  return bool(ctx.args, "unresolved")
    ? result.filter((t) => !t.resolved)
    : result;
}
function fields(entries: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    const index = entry.indexOf("=");
    if (index < 1) throw new UsageError(`Expected key=value: ${entry}`);
    const raw = entry.slice(index + 1);
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {}
    result[entry.slice(0, index)] = value;
  }
  return result;
}
function nextCursor(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (key === "pageInfo" && child !== null && typeof child === "object") {
      const info = object(child);
      if (info.hasNextPage === true) return text(info.endCursor);
    }
    const nested = nextCursor(child);
    if (nested !== null) return nested;
  }
  return null;
}
async function watch(ctx: CommandContext) {
  const references = await refs(ctx);
  const until = oneOf(
    flag(ctx.args, "until"),
    ["any", "ci", "comments"],
    "until",
    "any",
  );
  const interval =
    positiveInt(flag(ctx.args, "interval"), "interval", 120, 30) * 1000;
  const deadline =
    Date.now() + positiveInt(flag(ctx.args, "timeout"), "timeout", 1800) * 1000;
  const since = new Date().toISOString();
  let fingerprints: Fingerprint[] | undefined;
  let baseline = new Map<string, Snapshot>();
  let viewer = "";
  let failures = 0;
  const seen = new Set<string>();
  let lastPollStart = 0;
  while (Date.now() < deadline) {
    const wait = lastPollStart + interval - Date.now();
    if (lastPollStart > 0 && wait > 0) await Bun.sleep(Math.min(wait, Math.max(0, deadline - Date.now())));
    if (Date.now() >= deadline) break;
    lastPollStart = Date.now();
    try {
      const current = await fetchFingerprints(
        ctx.client,
        references,
        "background",
      );
      if (!fingerprints) {
        viewer = text(
          object(
            (await query(ctx.client, "query{viewer{login}}", {}, "background"))
              .viewer,
          ).login,
        );
        baseline = new Map(
          (await fetchSnapshots(ctx.client, references, "background")).map(
            (s) => [s.ref, s],
          ),
        );
        for (const value of baseline.values()) {
          for (const check of value.checks.filter(failing)) seen.add(`${value.headSha}:${check.name}`);
        }
      } else {
        const changed = references.filter(
          (_, i) =>
            current[i]?.status !== fingerprints?.[i]?.status ||
            current[i]?.remarks !== fingerprints?.[i]?.remarks,
        );
        if (changed.length)
          for (const value of await fetchSnapshots(ctx.client, changed, "background")) {
            const previous = baseline.get(value.ref);
            if (!previous) continue;
            const event = evaluateWake(
              previous,
              value,
              viewer,
              since,
              until,
              seen,
            );
            for (const c of value.checks.filter(failing))
              seen.add(`${value.headSha}:${c.name}`);
            baseline.set(value.ref, value);
            if (event) return event;
          }
      }
      fingerprints = current;
      failures = 0;
    } catch (error) {
      if (error instanceof RateLimitedError) {
        const resume = Math.max(error.retryAt, lastPollStart + interval);
        await Bun.sleep(Math.min(Math.max(0, resume - Date.now()), Math.max(0, deadline - Date.now())));
        continue;
      }
      failures++;
      if (failures >= 8) throw error;
    }
  }
  return { event: "timeout" };
}
export const readCommands: CommandTable = {
  snapshot: {
    run: async (ctx) => {
      const result = await fetchSnapshots(ctx.client, await refs(ctx));
      return result.length === 1 ? result[0] : result;
    },
  },
  fingerprint: {
    run: async (ctx) => {
      const result = await fetchFingerprints(ctx.client, await refs(ctx));
      return result.length === 1 ? result[0] : result;
    },
  },
  threads: { booleans: ["unresolved"], run: allThreads },
  comments: {
    run: async (ctx) => {
      const ref = await single(ctx);
      const root = `/repos/${repoSlug(ref)}/issues/${ref.number}`;
      const comments = await ctx.client.restPaginate<unknown>(
        `${root}/comments`,
      );
      const reviews = await ctx.client.restPaginate<unknown>(
        `/repos/${repoSlug(ref)}/pulls/${ref.number}/reviews`,
      );
      return [
        ...comments.map((raw) => ({ ...object(raw), kind: "comment" })),
        ...reviews.map((raw) => ({ ...object(raw), kind: "review" })),
      ].sort((a, b) =>
        String(object(a).created_at ?? object(a).submitted_at).localeCompare(
          String(object(b).created_at ?? object(b).submitted_at),
        ),
      );
    },
  },
  diff: {
    booleans: ["name-only"],
    run: async (ctx) => {
      const ref = await single(ctx);
      const path = `/repos/${repoSlug(ref)}/pulls/${ref.number}`;
      if (bool(ctx.args, "name-only"))
        return (await ctx.client.restPaginate<unknown>(`${path}/files`)).map(
          (raw) => {
            const v = object(raw);
            return {
              path: v.filename,
              additions: v.additions,
              deletions: v.deletions,
            };
          },
        );
      return (
        await ctx.client.rest<string>({
          path,
          accept: "application/vnd.github.diff",
        })
      ).text;
    },
  },
  file: {
    run: async (ctx) => {
      const ref = await single(ctx);
      const path = ctx.args.positionals[1];
      if (!path) throw new UsageError("PATH is required");
      const sha = flag(ctx.args, "ref") ?? (await snapshot(ctx)).headSha;
      return (
        await ctx.client.rest<string>({
          path: `/repos/${repoSlug(ref)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(sha)}`,
          accept: "application/vnd.github.raw",
        })
      ).text;
    },
  },
  ci: {
    run: async (ctx) => {
      const ref = await single(ctx);
      const value = await snapshot(ctx);
      const checks = value.checks.filter(failing);
      const results = [];
      for (const run of new Set(
        checks.flatMap((c) =>
          c.workflowRunId === null ? [] : [c.workflowRunId],
        ),
      )) {
        const jobs = await ctx.client.restPaginate<unknown>(
          `/repos/${repoSlug(ref)}/actions/runs/${run}/jobs`,
        );
        for (const raw of jobs) {
          const job = object(raw);
          if (
            !["failure", "cancelled", "timed_out", "action_required"].includes(
              String(job.conclusion),
            )
          )
            continue;
          const id = number(job.id);
          const logs = (
            await ctx.client.rest<string>({
              path: `/repos/${repoSlug(ref)}/actions/jobs/${id}/logs`,
              accept: "text/plain",
            })
          ).text;
          const directory = join(tmpdir(), `eng-github-ci-${run}`);
          await mkdir(directory, { recursive: true });
          const path = join(directory, `${id}.log`);
          await writeFile(path, logs);
          results.push({
            run,
            job: id,
            name: job.name,
            steps: Array.isArray(job.steps)
              ? job.steps.filter((s) => object(s).conclusion === "failure")
              : [],
            log: logs.split(/\r?\n/).slice(-80).join("\n"),
            path,
          });
        }
      }
      return { checks, jobs: results };
    },
  },
  runs: {
    run: async (ctx) => {
      const repo = await currentRepo(ctx.cwd);
      const limit = positiveInt(flag(ctx.args, "limit"), "limit", 20);
      const params = new URLSearchParams({ per_page: String(Math.min(limit, 100)) });
      const branch = flag(ctx.args, "branch");
      if (branch) params.set("branch", branch);
      const workflow = flag(ctx.args, "workflow");
      const path = `/repos/${repoSlug(repo)}/actions/${workflow ? `workflows/${encodeURIComponent(workflow)}/runs` : "runs"}`;
      const result: unknown[] = [];
      let page = 1;
      while (result.length < limit) {
        params.set("page", String(page++));
        const data = object((await ctx.client.rest<unknown>({ path: `${path}?${params}` })).data);
        if (!Array.isArray(data.workflow_runs)) throw new ApiError(200, "Missing workflow runs", data);
        result.push(...data.workflow_runs);
        if (data.workflow_runs.length < Math.min(limit, 100)) break;
      }
      return result.slice(0, limit);
    },
  },
  "pr list": {
    run: async (ctx) => {
      const repo = await currentRepo(ctx.cwd);
      const limit = positiveInt(flag(ctx.args, "limit"), "limit", 20);
      const state = oneOf(
        flag(ctx.args, "state"),
        ["open", "closed", "merged", "all"],
        "state",
        "open",
      );
      const head = flag(ctx.args, "head");
      const stateQuery =
        state === "all" ? "" : `states:[${state.toUpperCase()}],`;
      const headQuery = head ? `headRefName:${JSON.stringify(head)},` : "";
      const results: unknown[] = [];
      let cursor: string | null = null;
      do {
        const data = await query(ctx.client, `query($cursor:String){repository(owner:${JSON.stringify(repo.owner)},name:${JSON.stringify(repo.name)}){pullRequests(first:${Math.min(limit - results.length, 100)},after:$cursor,${stateQuery}${headQuery}orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number url title state isDraft headRefName headRefOid baseRefName} pageInfo{hasNextPage endCursor}}}}`, { cursor });
        const connection = object(object(data.repository).pullRequests);
        results.push(...nodes(connection));
        const info = object(connection.pageInfo);
        cursor = info.hasNextPage === true ? text(info.endCursor) : null;
      } while (cursor !== null && results.length < limit);
      return results;
    },
  },
  whoami: {
    run: async (ctx) => {
      const data = await query(
        ctx.client,
        "query{viewer{login} rateLimit { cost limit remaining resetAt }}",
      );
      return {
        login: object(data.viewer).login,
        source: ctx.client.credential.source,
        account: ctx.client.credential.account ?? null,
        graphql: data.rateLimit,
        ...ctx.client.state(),
        pausedUntil: ctx.client.pausedUntil() ?? null,
      };
    },
  },
  watch: { run: watch },
  api: {
    booleans: ["paginate"],
    run: async (ctx) => {
      const path = ctx.args.positionals[0];
      if (!path) throw new UsageError("PATH is required");
      const method = oneOf(
        flag(ctx.args, "method"),
        ["GET", "POST", "PUT", "PATCH", "DELETE"],
        "method",
        "GET",
      );
      const input = flag(ctx.args, "input");
      const body: unknown = input
        ? await Bun.file(input).json()
        : fields(flags(ctx.args, "field"));
      const requestPath =
        method === "GET" && !input && flags(ctx.args, "field").length
          ? `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(Object.entries(object(body)).map(([key, value]): [string, string] => [key, String(value)]))}`
          : path;
      if (bool(ctx.args, "paginate"))
        return ctx.client.restPaginate<unknown>(requestPath);
      return (
        await ctx.client.rest<unknown>({
          path: requestPath,
          method,
          ...(input || (method !== "GET" && flags(ctx.args, "field").length)
            ? { body }
            : {}),
        })
      ).data;
    },
  },
  graphql: {
    booleans: ["paginate"],
    run: async (ctx) => {
      const document = await Bun.file(required(ctx.args, "query-file")).text();
      const variables = fields(flags(ctx.args, "var"));
      const pages = [];
      do {
        const data = await query(ctx.client, document, variables);
        if (!bool(ctx.args, "paginate")) return data;
        pages.push(data);
        const cursor = nextCursor(data);
        if (cursor === null) break;
        if (cursor === variables.endCursor)
          throw new ApiError(200, "GraphQL cursor did not advance", cursor);
        variables.endCursor = cursor;
      } while (true);
      return pages;
    },
  },
};
