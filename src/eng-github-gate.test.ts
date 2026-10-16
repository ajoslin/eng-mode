import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mutationCommands } from "../skills/eng-github/scripts/commands/mutate.ts";
import { gateCommands } from "../skills/eng-github/scripts/commands/gate.ts";
import { stackCommands } from "../skills/eng-github/scripts/commands/stack.ts";
import { readCommands } from "../skills/eng-github/scripts/commands/read.ts";
import { parseArgs } from "../skills/eng-github/scripts/lib/args.ts";
import { GitHubClient, apiRoot } from "../skills/eng-github/scripts/lib/client.ts";
import { StateStore } from "../skills/eng-github/scripts/lib/state.ts";
import { EngGithubError, EXIT } from "../skills/eng-github/scripts/lib/errors.ts";
import type { CommandTable } from "../skills/eng-github/scripts/lib/command.ts";

const head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const stale = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const realFetch = globalThis.fetch;
const dirs: string[] = [];
afterEach(() => { globalThis.fetch = realFetch; for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function evidence(sha = head, verdict = "pass", association = "OWNER", id = 1) {
  return { id, html_url: `https://github.com/o/r/pull/7#issuecomment-${id}`, created_at: `2026-10-16T00:00:0${id}Z`, author_association: association, body: `<!-- eng-gate ${JSON.stringify({ v: 1, kind: "evidence", sha, verdict, producer: "author", surface: "non-ui" })} -->\nProof` };
}
function signoff(verdict = "approve", reviewer = "reviewer") {
  return { id: 3, html_url: "https://github.com/o/r/pull/7#issuecomment-3", created_at: "2026-10-16T00:00:03Z", author_association: "MEMBER", body: `<!-- eng-gate ${JSON.stringify({ v: 1, kind: "signoff", sha: head, evidence: 1, verdict, reviewer })} -->\nReviewed` };
}
function fake(comments: unknown[] = [], options: { unresolved?: boolean; failing?: boolean; staleCheck?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "eng-gate-")); dirs.push(dir);
  const requests: { path: string; method: string; body: unknown }[] = [];
  const pr = { stack: null, id: "n", url: "https://github.com/o/r/pull/7", number: 7, title: "Title", state: "OPEN", isDraft: false, headRefName: "feature", headRefOid: head, baseRefName: "main", baseRefOid: stale, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", labels: { nodes: [] }, autoMergeRequest: null, baseRef: null, commits: { nodes: options.failing || options.staleCheck ? [{ commit: { statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", name: "unit", status: "COMPLETED", conclusion: options.staleCheck ? "STALE" : "FAILURE", isRequired: false, detailsUrl: null, databaseId: 1, checkSuite: null }] } } } }] : [] }, reviewThreads: { nodes: options.unresolved ? [{ id: "thread", isResolved: false, isOutdated: false, path: "x", line: 1, comments: { totalCount: 0, nodes: [] } }] : [] }, latestReviews: { nodes: [] }, comments: { nodes: [] } };
  globalThis.fetch = Object.assign(async (input: string | URL | Request, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname;
    const method = init.method ?? "GET";
    const body: unknown = init.body ? JSON.parse(String(init.body)) : null;
    requests.push({ path, method, body });
    if (path === "/graphql") return Response.json({ data: { p0: { pullRequest: pr } } });
    if (path.endsWith("/comments")) return Response.json(method === "GET" ? comments : { id: 9, html_url: "https://github.com/o/r/pull/7#issuecomment-9" });
    if (path.endsWith("/merge-async")) return Response.json({ status: "merged", details: {} });
    if (/\/stacks\/1$/.test(path)) return Response.json({ number: 1, base: { ref: "main" }, open: true, pull_requests: [{ number: 7, state: "open", head: { ref: "lower", sha: head } }, { number: 8, state: "open", head: { ref: "upper", sha: head } }] });
    return Response.json({});
  }, { preconnect: realFetch.preconnect });
  const client = new GitHubClient({ host: "github.com", token: "test", source: "ENG_GITHUB_TOKEN", fingerprint: "gate" }, new StateStore("gate", dir), apiRoot("github.com"), { now: () => Date.now(), sleep: async () => {} });
  return { requests, dir, async run(name: string, argv: string[], table: CommandTable = mutationCommands) {
    const command = table[name]; if (!command) throw new Error(`missing ${name}`);
    return command.run({ client, args: parseArgs(argv, command.booleans), cwd: import.meta.dir + "/.." });
  } };
}
async function blocked(promise: Promise<unknown>, reason: string) {
  try { await promise; throw new Error("expected rejection"); } catch (error) {
    expect(error).toBeInstanceOf(EngGithubError);
    if (!(error instanceof EngGithubError)) throw error;
    expect(error.exit).toBe("gate"); expect(EXIT[error.exit]).toBe(5);
    expect(JSON.stringify(error.details)).toContain(reason);
  }
}
test("merge is refused when the pre-merge gate has no evidence for HEAD", async () => {
  const github = fake();
  await blocked(github.run("merge", ["o/r#7", "--head", head]), `no evidence for HEAD ${head}`);
  expect(github.requests.filter((request) => request.path.includes("/merge"))).toEqual([]);
});
test("stale evidence blocks auto-merge enable and names the stale SHA", async () => {
  const github = fake([evidence(stale)]);
  await blocked(github.run("auto-merge", ["o/r#7", "enable", "--head", head]), stale);
  expect(github.requests.filter((request) => JSON.stringify(request.body).includes("enablePullRequestAutoMerge"))).toEqual([]);
});
for (const [name, records, reason] of [
  ["fail evidence blocks merge", [evidence(head, "fail"), signoff()], "evidence 1 failed"],
  ["block signoff blocks merge", [evidence(), signoff("block")], "reviewer blocked"],
  ["self-signoff does not count", [evidence(), signoff("approve", " AUTHOR ")], "no independent sign-off"],
  ["untrusted NONE evidence is ignored", [evidence(head, "pass", "NONE"), signoff()], "no evidence"],
  ["untrusted CONTRIBUTOR evidence is ignored", [evidence(head, "pass", "CONTRIBUTOR"), signoff()], "no evidence"],
] satisfies [string, unknown[], string][]) test(name, async () => {
  const github = fake(records); await blocked(github.run("merge", ["o/r#7", "--head", head]), reason);
  expect(github.requests.filter((request) => request.path.includes("/merge"))).toEqual([]);
});
test("unresolved review thread blocks merge", async () => { const github = fake([evidence(), signoff()], { unresolved: true }); await blocked(github.run("merge", ["o/r#7", "--head", head]), "1 unresolved review thread(s)"); });
test("failing check blocks merge", async () => { const github = fake([evidence(), signoff()], { failing: true }); await blocked(github.run("merge", ["o/r#7", "--head", head]), "failing checks: unit"); });
test("STALE check blocks merge", async () => {
  const github = fake([evidence(), signoff()], { staleCheck: true });
  await expect(github.run("merge", ["o/r#7", "--head", head])).rejects.toMatchObject({ exit: "gate", details: { state: "blocked", head, reasons: ["failing checks: unit"] } });
  expect(github.requests.filter((request) => request.path.includes("/merge"))).toEqual([]);
});
test("independent signoff at HEAD permits a SHA-pinned merge request", async () => {
  const github = fake([evidence(), signoff()]); await github.run("merge", ["o/r#7", "--head", head]);
  expect(github.requests.filter((request) => request.path.includes("/merge"))).toEqual([{ path: "/repos/o/r/pulls/7/merge-async", method: "PUT", body: { sha: head, merge_method: "squash", merge_action: "default" } }]);
});
test("self-approval does not veto an independent approval", async () => {
  const github = fake([evidence(), signoff("approve", " AUTHOR "), signoff()]);
  await github.run("merge", ["o/r#7", "--head", head]);
  expect(github.requests.filter((request) => request.path.includes("/merge"))).toEqual([{ path: "/repos/o/r/pulls/7/merge-async", method: "PUT", body: { sha: head, merge_method: "squash", merge_action: "default" } }]);
});
test("self-approval alone reports one independent sign-off reason", async () => {
  const github = fake([evidence(), signoff("approve", " AUTHOR ")]);
  await expect(github.run("merge", ["o/r#7", "--head", head])).rejects.toMatchObject({ exit: "gate", details: { state: "blocked", head, reasons: ["no independent sign-off (self-signoff by AUTHOR does not count)"] } });
  expect(github.requests.filter((request) => request.path.includes("/merge"))).toEqual([]);
});
test("babysit complete label is refused before any mutation without gate", async () => {
  const github = fake(); await blocked(github.run("pr edit", ["o/r#7", "--add-label", " BABYSIT COMPLETE ", "--title", "changed"]), "no evidence");
  expect(github.requests.filter((request) => request.method !== "GET" && request.path !== "/graphql")).toEqual([]);
});
test("babysit complete label passes with gate and ordinary labels remain ungated", async () => {
  const github = fake([evidence(), signoff()]); await github.run("pr edit", ["o/r#7", "--add-label", "babysit complete"]);
  expect(github.requests.filter((request) => request.path.endsWith("/labels"))).toEqual([{ path: "/repos/o/r/issues/7/labels", method: "POST", body: { labels: ["babysit complete"] } }]);
  const ordinary = fake(); await ordinary.run("pr edit", ["o/r#7", "--add-label", "ready"]);
  expect(ordinary.requests.find((request) => request.path.endsWith("/labels"))?.body).toEqual({ labels: ["ready"] });
});
test("gate signoff refuses self-review and non-latest or stale evidence", async () => {
  for (const [records, reviewer, id] of [[[evidence()], "AUTHOR", "1"], [[evidence(), evidence(head, "pass", "OWNER", 2)], "reviewer", "1"], [[evidence(stale)], "reviewer", "1"]] satisfies [unknown[], string, string][]) {
    const github = fake(records); const body = join(github.dir, "body"); writeFileSync(body, "Reviewed");
    await expect(github.run("gate signoff", ["o/r#7", "--head", head, "--evidence", id, "--reviewer", reviewer, "--verdict", "approve", "--body-file", body], gateCommands)).rejects.toMatchObject({ exit: "usage" });
    expect(github.requests.filter((request) => request.path.endsWith("/comments") && request.method === "POST")).toEqual([]);
  }
});
test("UI evidence requires media and posts a fresh record when media is present", async () => {
  const github = fake(); const body = join(github.dir, "body"); writeFileSync(body, "Verified");
  const argv = ["o/r#7", "--head", head, "--producer", "author", "--surface", "ui", "--verdict", "pass", "--body-file", body];
  await expect(github.run("gate evidence", argv, gateCommands)).rejects.toMatchObject({ exit: "usage" });
  writeFileSync(body, "![proof](https://example.com/proof.png)");
  expect(await github.run("gate evidence", argv, gateCommands)).toEqual({ id: 9, url: "https://github.com/o/r/pull/7#issuecomment-9", sha: head, kind: "evidence" });
  expect(github.requests.filter((request) => request.path.endsWith("/comments") && request.method === "POST")).toHaveLength(1);
});
test("raw api merge and graphql mergePullRequest cannot bypass gate", async () => {
  const github = fake(); await expect(github.run("api", ["repos/o/r/pulls/7/merge", "--method", "PUT"], readCommands)).rejects.toMatchObject({ exit: "usage" });
  const query = join(github.dir, "query"); writeFileSync(query, "mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }");
  await expect(github.run("graphql", ["--query-file", query], readCommands)).rejects.toMatchObject({ exit: "usage" }); expect(github.requests).toEqual([]);
});
for (const path of ["graphql", "/graphql", "https://api.github.com/%47RAPHQL?x=1"]) test(`raw api refuses non-GET GraphQL at ${path}`, async () => {
  const github = fake();
  await expect(github.run("api", [path, "--method", "POST", "--field", "query=mutation { mergeBranch }"], readCommands)).rejects.toMatchObject({ exit: "usage", message: "use eng-github graphql for gated GraphQL requests" });
  expect(github.requests).toEqual([]);
});
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) test(`raw api refuses ${method} branch merge`, async () => {
  const github = fake();
  await expect(github.run("api", ["https://api.github.com//REPOS/o/r/%6Derges?x=1", "--method", method], readCommands)).rejects.toMatchObject({ exit: "usage", message: "use the gated merge command" });
  expect(github.requests).toEqual([]);
});
for (const resource of ["issues", "pulls"]) for (const source of ["input", "field"]) test(`raw api refuses ${resource} PATCH labels from ${source}`, async () => {
  const github = fake(); const input = join(github.dir, "input.json"); writeFileSync(input, '{"labels":["babysit complete"]}');
  const body = source === "input" ? ["--input", input] : ["--field", "labels=babysit complete"];
  await expect(github.run("api", [`/REPOS/o/r/${resource}/7?x=1`, "--method", "PATCH", ...body], readCommands)).rejects.toMatchObject({ exit: "usage", message: "use pr edit --add-label for gated label mutations" });
  expect(github.requests).toEqual([]);
});
for (const mutation of ["updatePullRequest", "updateIssue", "createIssue", "createPullRequest"]) test(`raw graphql refuses ${mutation} with labelIds`, async () => {
  const github = fake(); const query = join(github.dir, "query");
  writeFileSync(query, `mutation { ${mutation}(input: {labelIds: ["label"]}) { clientMutationId } }`);
  await expect(github.run("graphql", ["--query-file", query], readCommands)).rejects.toMatchObject({ exit: "usage", message: "use gated merge, auto-merge enable, stack merge, or pr edit --add-label instead of raw GraphQL mutations" });
  expect(github.requests).toEqual([]);
});
test("raw graphql leaves updatePullRequestBranch ungated", async () => {
  const github = fake(); const query = join(github.dir, "query"); const document = 'mutation { updatePullRequestBranch(input: {pullRequestId: "x"}) { clientMutationId } }';
  writeFileSync(query, document);
  await github.run("graphql", ["--query-file", query], readCommands);
  expect(github.requests).toEqual([{ path: "/graphql", method: "POST", body: { query: document, variables: {} } }]);
});

test("stack merge is blocked when a lower layer lacks the gate", async () => {
  const previous = process.env.ENG_GITHUB_REPO;
  process.env.ENG_GITHUB_REPO = "o/r";
  try {
    const github = fake();
    await blocked(github.run("stack merge", ["--stack", "1", "--target", "8", "--heads", `7=${head},8=${head}`], stackCommands), `no evidence for HEAD ${head}`);
    expect(github.requests.filter((request) => request.path.includes("/merge"))).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.ENG_GITHUB_REPO;
    else process.env.ENG_GITHUB_REPO = previous;
  }
});
