import type { GitHubClient, Priority } from "./client.ts";
import { ApiError } from "./errors.ts";
import { refString, type PrRef } from "./ref.ts";

export interface Check {
  name: string;
  status: string;
  conclusion: string | null;
  required: boolean;
  detailsUrl: string | null;
  databaseId: number | null;
  workflowRunId: number | null;
}
export interface Activity {
  author: string | null;
  body: string;
  createdAt: string;
}
export interface Thread {
  id: string;
  resolved: boolean;
  outdated: boolean;
  path: string;
  line: number | null;
  author: string | null;
  body: string;
  commentCount: number;
  comments: Activity[];
}
export interface Snapshot {
  ref: string;
  url: string;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  behindBy: number | null;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  autoMerge: null | {
    method: string;
    enabledBy: string | null;
    expectedHeadOid?: string;
  };
  nodeId: string;
  checks: Check[];
  threads: Thread[];
  reviews: {
    author: string | null;
    state: string;
    submittedAt: string | null;
    body?: string;
  }[];
  stack: null | { number: number; position: number; size: number };
  labels: string[];
  activity: Activity[];
}
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(200, "Malformed GitHub object", value);
  return Object.fromEntries(Object.entries(value));
}
export function nodes(value: unknown): unknown[] {
  const list = object(value).nodes;
  return Array.isArray(list) ? list.filter((x) => x !== null) : [];
}
export function text(value: unknown): string {
  if (typeof value !== "string")
    throw new ApiError(200, "Malformed GitHub string", value);
  return value;
}
export function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
export function number(value: unknown): number {
  if (typeof value !== "number")
    throw new ApiError(200, "Malformed GitHub number", value);
  return value;
}
function login(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : nullableText(object(value).login);
}
export function activity(value: unknown): Activity {
  const v = object(value);
  return {
    author: login(v.author),
    body: text(v.body),
    createdAt: text(v.createdAt),
  };
}
export function thread(value: unknown): Thread {
  const v = object(value);
  const comments = nodes(v.comments).map(activity);
  return {
    id: text(v.id),
    resolved: v.isResolved === true,
    outdated: v.isOutdated === true,
    path: text(v.path),
    line: typeof v.line === "number" ? v.line : null,
    author: comments[0]?.author ?? null,
    body: comments[0]?.body ?? "",
    commentCount: number(object(v.comments).totalCount),
    comments,
  };
}
export async function query(
  client: GitHubClient,
  document: string,
  variables: Record<string, unknown> = {},
  priority: Priority = "interactive",
): Promise<Record<string, unknown>> {
  const result = await client.graphql<unknown>({
    query: document,
    variables,
    priority,
  });
  if (result.errors.length)
    throw new ApiError(
      200,
      result.errors.map((e) => e.message).join("; "),
      result.errors,
    );
  return object(result.data);
}
export async function aliased(
  client: GitHubClient,
  refs: readonly PrRef[],
  selection: (ref: PrRef) => string,
  priority: Priority = "interactive",
  groupByRepository = true,
): Promise<unknown[]> {
  const results = new Map<string, unknown>();
  const groups = new Map<string, PrRef[]>();
  for (const ref of refs) {
    const key = `${ref.owner}/${ref.name}`;
    const group = groups.get(key) ?? [];
    group.push(ref);
    groups.set(key, group);
  }
  for (const group of groupByRepository ? groups.values() : [refs])
    for (let start = 0; start < group.length; start += 25) {
      const chunk = group.slice(start, start + 25);
      const document = `query { ${chunk.map((ref, i) => `p${i}:repository(owner:${JSON.stringify(ref.owner)},name:${JSON.stringify(ref.name)}){pullRequest(number:${ref.number}){${selection(ref)}}}`).join(" ")} }`;
      const data = await query(client, document, {}, priority);
      chunk.forEach((ref, i) => {
        const pr = object(data[`p${i}`]).pullRequest;
        if (pr === null)
          throw new ApiError(404, `PR not found: ${refString(ref)}`, null);
        results.set(refString(ref), pr);
      });
    }
  return refs.map((ref) => results.get(refString(ref)));
}
const commentsSelection = "totalCount nodes{author{login} body createdAt}";
export const threadSelection = `id isResolved isOutdated path line comments(first:100){${commentsSelection} pageInfo{hasNextPage endCursor}}`;
function snapshotSelection(ref: PrRef): string {
  return `stack{number size} stackEntry{position} id url number title state isDraft headRefName headRefOid baseRefName baseRefOid mergeable mergeStateStatus reviewDecision labels(first:50){nodes{name}} autoMergeRequest{mergeMethod enabledBy{login}} baseRef{target{oid} compare(headRef:${JSON.stringify(`refs/pull/${ref.number}/head`)}){behindBy}} commits(last:1){nodes{commit{oid statusCheckRollup{state contexts(first:100){nodes{__typename ... on CheckRun{name status conclusion isRequired(pullRequestNumber:${ref.number}) detailsUrl databaseId checkSuite{workflowRun{databaseId}}} ... on StatusContext{context state isRequired(pullRequestNumber:${ref.number}) targetUrl}}}}}}} reviewThreads(first:100){nodes{${threadSelection}}} latestReviews(first:20){nodes{author{login} state submittedAt body}} comments(last:100){nodes{author{login} body createdAt}}`;
}
function parseSnapshot(value: unknown, ref: PrRef): Snapshot {
  const v = object(value);
  const state = v.state;
  if (state !== "OPEN" && state !== "CLOSED" && state !== "MERGED")
    throw new ApiError(200, "Unknown PR state", state);
  const commit = nodes(v.commits)[0];
  const rollup =
    commit === undefined
      ? null
      : object(object(commit).commit).statusCheckRollup;
  const checks: Check[] =
    rollup === null
      ? []
      : nodes(object(rollup).contexts).map((raw) => {
          const c = object(raw);
          const run =
            c.checkSuite === null || c.checkSuite === undefined
              ? null
              : object(c.checkSuite).workflowRun;
          return {
            name: text(c.name ?? c.context),
            status: text(c.status ?? c.state),
            conclusion: nullableText(c.conclusion ?? c.state),
            required: c.isRequired === true,
            detailsUrl: nullableText(c.detailsUrl ?? c.targetUrl),
            databaseId: typeof c.databaseId === "number" ? c.databaseId : null,
            workflowRunId: run === null ? null : number(object(run).databaseId),
          };
        });
  const auto = v.autoMergeRequest === null ? null : object(v.autoMergeRequest);
  const base = v.baseRef === null ? null : object(v.baseRef);
  const comparison =
    base?.compare === null || base?.compare === undefined
      ? null
      : object(base.compare);
  return {
    ref: refString(ref),
    url: text(v.url),
    number: number(v.number),
    title: text(v.title),
    state,
    isDraft: v.isDraft === true,
    headRef: text(v.headRefName),
    headSha: text(v.headRefOid),
    baseRef: text(v.baseRefName),
    baseSha: text(v.baseRefOid),
    behindBy:
      typeof comparison?.behindBy === "number" ? comparison.behindBy : null,
    mergeable: text(v.mergeable),
    mergeStateStatus: text(v.mergeStateStatus),
    reviewDecision: nullableText(v.reviewDecision),
    autoMerge:
      auto === null
        ? null
        : { method: text(auto.mergeMethod), enabledBy: login(auto.enabledBy) },
    nodeId: text(v.id),
    checks,
    threads: nodes(v.reviewThreads).map(thread),
    reviews: nodes(v.latestReviews).map((raw) => {
      const r = object(raw);
      return {
        author: login(r.author),
        state: text(r.state),
        submittedAt: nullableText(r.submittedAt),
        body: text(r.body),
      };
    }),
    stack:
      v.stack === null
        ? null
        : {
            number: number(object(v.stack).number),
            size: number(object(v.stack).size),
            position: number(object(v.stackEntry).position),
          },
    labels: nodes(v.labels).map((raw) => text(object(raw).name)),
    activity: nodes(v.comments).map(activity),
  };
}
export async function fetchSnapshots(
  client: GitHubClient,
  refs: PrRef[],
  priority: Priority = "interactive",
): Promise<Snapshot[]> {
  const values = await aliased(client, refs, snapshotSelection, priority);
  return values.map((value, i) => {
    const ref = refs[i];
    if (!ref) throw new ApiError(200, "Missing reference", null);
    return parseSnapshot(value, ref);
  });
}
export interface Fingerprint {
  ref: string;
  state: string;
  headSha: string;
  mergeable: string;
  checks: Record<string, number>;
  comments: { count: number; latest: string | null };
  reviews: { count: number; latest: string | null };
  threads: number;
  status: string;
  remarks: string;
}
export async function fetchFingerprints(
  client: GitHubClient,
  refs: PrRef[],
  priority: Priority = "interactive",
): Promise<Fingerprint[]> {
  const selection =
    "state mergeable headRefOid comments(first:100,orderBy:{field:UPDATED_AT,direction:DESC}){totalCount nodes{lastEditedAt updatedAt}} reviews(last:100){totalCount nodes{lastEditedAt submittedAt}} reviewThreads{totalCount} commits(last:1){nodes{commit{statusCheckRollup{contexts{checkRunCountsByState{state count} statusContextCountsByState{state count}}}}}}";
  const values = await aliased(client, refs, () => selection, priority, false);
  return values.map((raw, i) => {
    const v = object(raw);
    const edits = (raw: unknown) => {
      const e = object(raw);
      const dates = nodes(e)
        .flatMap((raw) => {
          const n = object(raw);
          return [n.lastEditedAt, n.updatedAt, n.submittedAt].filter(
            (x): x is string => typeof x === "string",
          );
        })
        .sort();
      return { count: number(e.totalCount), latest: dates.at(-1) ?? null };
    };
    const checks: Record<string, number> = {};
    const commit = nodes(v.commits)[0];
    const rollup =
      commit === undefined
        ? null
        : object(object(commit).commit).statusCheckRollup;
    if (rollup !== null) {
      const contexts = object(object(rollup).contexts);
      for (const list of [
        contexts.checkRunCountsByState,
        contexts.statusContextCountsByState,
      ])
        if (Array.isArray(list))
          for (const raw of list) {
            const c = object(raw);
            const state = text(c.state);
            checks[state] = (checks[state] ?? 0) + number(c.count);
          }
    }
    const ref = refs[i];
    if (!ref) throw new ApiError(200, "Missing reference", null);
    const state = text(v.state),
      headSha = text(v.headRefOid),
      mergeable = text(v.mergeable);
    const comments = edits(v.comments),
      reviews = edits(v.reviews),
      threads = number(object(v.reviewThreads).totalCount);
    return {
      ref: refString(ref),
      state,
      headSha,
      mergeable,
      checks,
      comments,
      reviews,
      threads,
      status: JSON.stringify([
        state,
        headSha,
        mergeable,
        Object.entries(checks).sort(),
      ]),
      remarks: JSON.stringify([comments, reviews, threads]),
    };
  });
}
