import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mutationCommands } from "../skills/eng-github/scripts/commands/mutate.ts";
import { readCommands } from "../skills/eng-github/scripts/commands/read.ts";
import { apiRoot, GitHubClient, type Clock } from "../skills/eng-github/scripts/lib/client.ts";
import type { Credential } from "../skills/eng-github/scripts/lib/credentials.ts";
import { EngGithubError, RateLimitedError, UsageError } from "../skills/eng-github/scripts/lib/errors.ts";
import { mergeAsync } from "../skills/eng-github/scripts/lib/merge-async.ts";
import { fetchSnapshots } from "../skills/eng-github/scripts/lib/pr-query.ts";
import { digest, StateStore } from "../skills/eng-github/scripts/lib/state.ts";

const credential: Credential = { host: "github.com", token: "secret-token", source: "ENG_GITHUB_TOKEN", fingerprint: "github.com:test" };
const realFetch = globalThis.fetch;
let dir = "";
let calls: { url: string; auth: string | null; method: string }[] = [];

function stubFetch(handler: (url: string, init: RequestInit) => Response): void {
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, auth: new Headers(init.headers).get("authorization"), method: init.method ?? "GET" });
      return handler(url, init);
    },
    { preconnect: realFetch.preconnect },
  );
}

function client(clock?: Clock): { client: GitHubClient; store: StateStore } {
  const store = new StateStore(credential.fingerprint, dir);
  return { client: new GitHubClient(credential, store, apiRoot("github.com"), clock), store };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "eng-github-"));
  process.env.ENG_GITHUB_STATE_DIR = dir;
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ENG_GITHUB_STATE_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("state store", () => {
  test("off-origin validators are not cached", async () => {
    const { client: c, store } = client();
    stubFetch((url) => url.includes("api.github.com") ? new Response(null, { status: 302, headers: { location: "https://blob.example/log" } }) : new Response("zip", { headers: { etag: "0x8D" } }));
    await c.rest({ path: "repos/o/r/actions/logs" });
    expect(store.readEtag("https://api.github.com/repos/o/r/actions/logs")).toBeUndefined();
  });
  test("validator cache evicts least recently used entries at 512", () => {
    const store = new StateStore("bounded", dir);
    store.writeEtag("hot", "v", "{}", null);
    store.touchEtag("hot", new Date("2100-01-01"));
    for (let i = 0; i < 512; i++) store.writeEtag(String(i), "v", "{}", null);
    expect(store.readEtag("hot")).toEqual({ etag: "v", body: "{}" });
    expect(readdirSync(join(dir, "etag", digest("bounded").slice(0, 32))).length).toBe(512);
  });
  test("update reads under the lock, so a stale snapshot cannot drop another writer's field", () => {
    const a = new StateStore("fp", dir);
    const b = new StateStore("fp", dir);
    a.update((current) => ({ ...current, lastMutationAt: 5 }));
    b.update((current) => ({ ...current, pauseUntil: 9, pauseReason: "x" }));
    expect(a.read()).toEqual({ lastMutationAt: 5, pauseUntil: 9, pauseReason: "x" });
  });

  test("a stale lock left by a dead process is broken", () => {
    const store = new StateStore("fp", dir);
    writeFileSync(join(dir, `${digest("fp").slice(0, 32)}.json.lock`), "999999");
    store.update(() => ({ lastMutationAt: 1 }));
    expect(store.read()).toEqual({ lastMutationAt: 1 });
  });
});

function gatedFetch(response: () => Response): { entered: Promise<void>; release: () => void } {
  let entered: () => void = () => {};
  let release: () => void = () => {};
  const enteredPromise = new Promise<void>((resolve) => (entered = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));
  globalThis.fetch = Object.assign(
    async () => {
      entered();
      await gate;
      return response();
    },
    { preconnect: realFetch.preconnect },
  );
  return { entered: enteredPromise, release };
}

describe("rate-limit pause", () => {
  test("a success admitted before another request's pause does not clear that pause", async () => {
    const { client: c, store } = client();
    const fetchGate = gatedFetch(() => new Response("{}"));
    const pending = c.rest({ path: "repos/o/r" });
    await fetchGate.entered;
    const until = Date.now() + 60_000;
    store.update((current) => ({ ...current, pauseUntil: until, pauseReason: "other", pauseSeq: (current.pauseSeq ?? 0) + 1 }));
    fetchGate.release();
    await pending;
    expect(store.read().pauseUntil).toBe(until);
  });

  test("an expired pause from before admission is cleared on success", async () => {
    const { client: c, store } = client();
    store.update(() => ({ pauseUntil: Date.now() - 1, pauseReason: "old", backoffMs: 30_000, pauseSeq: 3 }));
    stubFetch(() => new Response("{}", { status: 200 }));
    await c.rest({ path: "repos/o/r" });
    expect(store.read()).toEqual({ pauseSeq: 3 });
  });

  test("a shorter rate limit recorded later keeps the longer active pause", async () => {
    const { client: c, store } = client();
    const gate = gatedFetch(() => new Response("{}", { status: 429, headers: { "retry-after": "5" } }));
    const pending = c.rest({ path: "repos/o/r" });
    await gate.entered;
    const long = Date.now() + 600_000;
    store.update((current) => ({ ...current, pauseUntil: long, pauseReason: "long", pauseSeq: 1 }));
    gate.release();
    await expect(pending).rejects.toBeInstanceOf(RateLimitedError);
    expect(store.read().pauseUntil).toBe(long);
  });

  test("a longer rate limit extends a shorter active pause", async () => {
    const { client: c, store } = client();
    const gate = gatedFetch(() => new Response("{}", { status: 429, headers: { "retry-after": "600" } }));
    const pending = c.rest({ path: "repos/o/r" });
    await gate.entered;
    const start = Date.now();
    store.update((current) => ({ ...current, pauseUntil: start + 5_000, pauseSeq: 1 }));
    gate.release();
    await expect(pending).rejects.toBeInstanceOf(RateLimitedError);
    expect(store.read().pauseUntil ?? 0).toBeGreaterThanOrEqual(start + 600_000);
  });
});

describe("credential scoping", () => {
  test("an off-origin absolute URL is rejected before any request", async () => {
    const { client: c } = client();
    stubFetch(() => new Response("{}"));
    await expect(c.rest({ path: "https://example.org/x" })).rejects.toBeInstanceOf(UsageError);
    await expect(c.rest({ path: "http://api.github.com/x" })).rejects.toBeInstanceOf(UsageError);
    expect(calls).toEqual([]);
  });

  test("a cross-origin redirect is followed without the token", async () => {
    const { client: c } = client();
    stubFetch((url) =>
      url.startsWith("https://api.github.com/")
        ? new Response(null, { status: 302, headers: { location: "https://blob.example.net/log?sig=1" } })
        : new Response("log line", { status: 200 }),
    );
    const response = await c.rest<string>({ path: "/repos/o/r/actions/jobs/1/logs" });
    expect(response.text).toBe("log line");
    expect(calls).toEqual([
      { url: "https://api.github.com/repos/o/r/actions/jobs/1/logs", auth: "Bearer secret-token", method: "GET" },
      { url: "https://blob.example.net/log?sig=1", auth: null, method: "GET" },
    ]);
  });

  test("a 429 from a redirect target does not pause the GitHub credential", async () => {
    const { client: c, store } = client();
    stubFetch((url) =>
      url.startsWith("https://api.github.com/")
        ? new Response(null, { status: 302, headers: { location: "https://blob.example.net/log?sig=1" } })
        : new Response("slow down", { status: 429, headers: { "retry-after": "600" } }),
    );
    await expect(c.rest({ path: "/repos/o/r/actions/jobs/1/logs" })).rejects.toHaveProperty("status", 429);
    expect(store.read().pauseUntil).toBeUndefined();
  });

  test("pagination refuses an off-origin next link", async () => {
    const { client: c } = client();
    stubFetch(() => new Response("[1]", { headers: { link: '<https://evil.example/page2>; rel="next"' } }));
    await expect(c.restPaginate("repos/o/r/pulls")).rejects.toBeInstanceOf(EngGithubError);
    expect(calls.map((call) => call.url)).toEqual(["https://api.github.com/repos/o/r/pulls?per_page=100"]);
  });
});

describe("conditional cache", () => {
  test("a write to a URL drops its cached body so the next read is unconditional", async () => {
    const { client: c } = client();
    let value = "old";
    const sent: (string | null)[] = [];
    globalThis.fetch = Object.assign(
      async (_input: string | URL | Request, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        if ((init.method ?? "GET") === "GET") sent.push(headers.get("if-none-match"));
        if ((init.method ?? "GET") !== "GET") value = "new";
        return new Response(JSON.stringify({ value }), { headers: { etag: `"${value}"` } });
      },
      { preconnect: realFetch.preconnect },
    );
    await c.rest({ path: "repos/o/r" });
    await c.rest({ method: "PATCH", path: "repos/o/r", body: { value: "new" } });
    const after = await c.rest<{ value: string }>({ path: "repos/o/r" });
    expect(sent).toEqual([null, null]);
    expect(after.data.value).toBe("new");
  });
});

describe("async merge reuse", () => {
  const pending = (options: Record<string, unknown>) =>
    new Response(JSON.stringify({ status: "pending", details: { uuid: "u1", options } }), { status: 409 });

  test("retrying a queue merge reuses the pending operation even though GitHub reports the queue's method", async () => {
    const { client: c } = client();
    stubFetch((url) =>
      url.endsWith("/merge-async")
        ? pending({ sha: "abc", merge_method: "squash", merge_action: "merge_queue" })
        : new Response(JSON.stringify({ status: "enqueued", details: {} })),
    );
    const result = await mergeAsync(c, { owner: "o", name: "r", number: 1 }, { head: "abc", action: "queue", sleep: async () => {} });
    expect(result.status).toBe("enqueued");
  });

  test("a pending merge with a different method is a conflict", async () => {
    const { client: c } = client();
    stubFetch(() => pending({ sha: "abc", merge_method: "merge", merge_action: "default" }));
    const error = await mergeAsync(c, { owner: "o", name: "r", number: 1 }, { head: "abc", method: "squash", action: "default" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EngGithubError);
    expect((error as EngGithubError).exit).toBe("conflict");
  });
});

describe("admission", () => {
  test("graphql reads reserve their cost so sequential admissions on one snapshot cannot both pass", async () => {
    const { client: c, store } = client();
    store.update(() => ({ graphql: { limit: 100, remaining: 11, resetAt: Date.now() + 60_000, cost: 1 } }));
    const gate = gatedFetch(() => new Response('{"data":{}}'));
    const first = c.graphql({ query: "query { a }", priority: "background" });
    await gate.entered;
    expect(store.read().graphql?.remaining).toBe(10);
    await expect(c.graphql({ query: "query { b }", priority: "background" })).rejects.toBeInstanceOf(RateLimitedError);
    gate.release();
    await first;
  });

  test("mutations reserve slots 1s apart and sleep until their slot", async () => {
    let now = 10_000;
    const sleeps: number[] = [];
    const clock: Clock = { now: () => now, sleep: async (ms) => void sleeps.push(ms) };
    const { client: c, store } = client(clock);
    stubFetch(() => new Response("{}"));
    await Promise.all([c.rest({ method: "POST", path: "a" }), c.rest({ method: "POST", path: "b" }), c.rest({ method: "POST", path: "c" })]);
    expect(store.read().lastMutationAt).toBe(12_000);
    expect(sleeps).toEqual([1_000, 2_000]);
    now = 12_500;
    await c.rest({ method: "POST", path: "d" });
    expect(store.read().lastMutationAt).toBe(13_000);
  });

  test("a pause recorded while a mutation waits for its slot stops the send", async () => {
    const { client: c, store } = client({
      now: () => 0,
      sleep: async () => {
        store.update((current) => ({ ...current, pauseUntil: 60_000, pauseSeq: 1 }));
      },
    });
    store.update(() => ({ lastMutationAt: 0 }));
    stubFetch(() => new Response("{}"));
    await expect(c.rest({ method: "POST", path: "a" })).rejects.toBeInstanceOf(RateLimitedError);
    expect(calls).toEqual([]);
  });
});

describe("merge", () => {
  const snapshot = { data: { p0: { pullRequest: { stack: null, id: "n", url: "u", number: 1, title: "t", state: "OPEN", isDraft: false, headRefName: "h", headRefOid: "abc1234", baseRefName: "main", baseRefOid: "b", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: null, labels: { nodes: [] }, autoMergeRequest: null, baseRef: null, commits: { nodes: [] }, reviewThreads: { nodes: [] }, latestReviews: { nodes: [] }, comments: { nodes: [] } } } } };
  function run(action: string) {
    const { client: c } = client({ now: () => Date.now(), sleep: async () => {} });
    stubFetch((url) => (url.endsWith("/graphql") ? new Response(JSON.stringify(snapshot)) : url.endsWith("/merge-async") ? new Response('{"message":"Not Found"}', { status: 404 }) : new Response('{"merged":true}')));
    const command = mutationCommands.merge;
    if (command === undefined) throw new Error("merge command missing");
    return command.run({ client: c, cwd: dir, args: { positionals: ["o/r#1"], flags: new Map([["head", ["abc1234"]], ["action", [action]]]) } });
  }

  test.each(["CLEAN", "HAS_HOOKS", "UNSTABLE"])("auto-merge refuses %s without mutation", async (state) => {
    const { client: c } = client();
    const value = structuredClone(snapshot);
    value.data.p0.pullRequest.mergeStateStatus = state;
    stubFetch(() => new Response(JSON.stringify(value)));
    const command = mutationCommands["auto-merge"];
    if (!command) throw new Error("missing auto-merge");
    await expect(command.run({ client: c, cwd: dir, args: { positionals: ["o/r#1", "enable"], flags: new Map([["head", ["abc1234"]]]) } })).rejects.toMatchObject({ exit: "conflict", message: `Auto-merge cannot wait in state ${state}; land with eng-github merge o/r#1 --head abc1234 [--method M]` });
    expect(calls.length).toBe(1);
  });
  test("queue does not fall back to the synchronous merge endpoint", async () => {
    await expect(run("queue")).rejects.toBeInstanceOf(EngGithubError);
    expect(calls.some((call) => call.url.endsWith("/pulls/1/merge"))).toBe(false);
  });

  test("direct still falls back to the synchronous merge endpoint", async () => {
    expect(await run("direct")).toEqual({ merged: true });
    expect(calls.some((call) => call.url.endsWith("/pulls/1/merge"))).toBe(true);
  });
});

describe("snapshot", () => {
  test.each([null, ...["QUEUED", "AWAITING_CHECKS", "MERGEABLE", "UNMERGEABLE", "LOCKED"].map((state) => ({ state, position: 2, enqueuedAt: "2026-10-24T00:00:00Z" }))])("parses merge queue membership %j", async (mergeQueueEntry) => {
    const { client: c } = client();
    stubFetch((_url, init) => {
      expect(String(init?.body)).toContain("mergeQueueEntry{state position enqueuedAt}");
      return new Response(JSON.stringify({ data: { p0: { pullRequest: { id: "n", url: "u", number: 1, title: "t", headRefName: "h", headRefOid: "a", baseRefName: "main", baseRefOid: "b", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", state: "OPEN", mergeQueueEntry, stack: null, autoMergeRequest: null, baseRef: null, commits: { nodes: [] }, reviewThreads: { nodes: [] }, latestReviews: { nodes: [] }, comments: { nodes: [] }, labels: { nodes: [] } } } } }));
    });
    const snapshots = await fetchSnapshots(c, [{ owner: "o", name: "r", number: 1 }]);
    expect(JSON.stringify(snapshots.map((snapshot) => snapshot.mergeQueue))).toBe(JSON.stringify([mergeQueueEntry === null ? null : { state: mergeQueueEntry.state, position: 2 }]));
  });
  test.each([
    { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", behindBy: 0, blocking: [] },
    { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY", behindBy: 0, blocking: ["conflict"] },
    { mergeable: "UNKNOWN", mergeStateStatus: "DIRTY", behindBy: 0, blocking: ["conflict"] },
    { mergeable: "MERGEABLE", mergeStateStatus: "BEHIND", behindBy: 1, blocking: ["behind"] },
    { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", behindBy: 5, blocking: [] },
    { mergeable: "CONFLICTING", mergeStateStatus: "CLEAN", behindBy: 0, blocking: ["conflict"] },
    { mergeable: "CONFLICTING", mergeStateStatus: "BEHIND", behindBy: 1, blocking: ["conflict", "behind"] },
  ])("derives blocking for $mergeable/$mergeStateStatus with behindBy $behindBy", async ({ mergeable, mergeStateStatus, behindBy, blocking }) => {
    const pr = { stack: null, id: "n", url: "u", number: 1, title: "t", state: "OPEN", isDraft: false, headRefName: "h", headRefOid: "abc1234", baseRefName: "main", baseRefOid: "b", mergeable, mergeStateStatus, reviewDecision: null, labels: { nodes: [] }, autoMergeRequest: null, baseRef: { compare: { behindBy } }, commits: { nodes: [] }, reviewThreads: { nodes: [] }, latestReviews: { nodes: [] }, comments: { nodes: [] } };
    const { client: c } = client();
    stubFetch(() => new Response(JSON.stringify({ data: { p0: { pullRequest: pr } } })));
    const snapshots = await fetchSnapshots(c, [{ owner: "o", name: "r", number: 1 }]);
    expect(snapshots.map((snapshot) => snapshot.blocking)).toEqual([[...blocking]]);
  });

  function threadNode(id: string, resolved: boolean) {
    return { id, isResolved: resolved, isOutdated: false, path: "a.ts", line: 1, comments: { totalCount: 1, nodes: [{ author: { login: "cursor" }, body: id, createdAt: "t" }], pageInfo: { hasNextPage: false, endCursor: null } } };
  }

  test("reads review threads past the first page so a late unresolved thread still blocks", async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => threadNode(`T${i}`, true));
    const pr = { stack: null, id: "n", url: "u", number: 1, title: "t", state: "OPEN", isDraft: false, headRefName: "h", headRefOid: "abc1234", baseRefName: "main", baseRefOid: "b", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: null, labels: { nodes: [] }, autoMergeRequest: null, baseRef: null, commits: { nodes: [] }, reviewThreads: { nodes: firstPage, pageInfo: { hasNextPage: true, endCursor: "c1" } }, latestReviews: { nodes: [] }, comments: { nodes: [] } };
    const { client: c } = client({ now: () => Date.now(), sleep: async () => {} });
    stubFetch((_url, init) => {
      const body = JSON.parse(String(init.body)) as { variables?: { cursor?: string } };
      return new Response(
        JSON.stringify(
          body.variables?.cursor === "c1"
            ? { data: { repository: { pullRequest: { reviewThreads: { nodes: [threadNode("late", false)], pageInfo: { hasNextPage: false, endCursor: null } } } } } }
            : { data: { p0: { pullRequest: pr } } },
        ),
      );
    });
    const command = readCommands.snapshot;
    if (command === undefined) throw new Error("snapshot command missing");
    const result = (await command.run({ client: c, cwd: dir, args: { positionals: ["o/r#1"], flags: new Map() } })) as { threads: { id: string; resolved: boolean }[] };
    expect(result.threads).toHaveLength(101);
    expect(result.threads.filter((t) => !t.resolved).map((t) => t.id)).toEqual(["late"]);
  });
});
