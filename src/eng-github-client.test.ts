import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mutationCommands } from "../skills/eng-github/scripts/commands/mutate.ts";
import { apiRoot, GitHubClient, type Clock } from "../skills/eng-github/scripts/lib/client.ts";
import type { Credential } from "../skills/eng-github/scripts/lib/credentials.ts";
import { EngGithubError, RateLimitedError, UsageError } from "../skills/eng-github/scripts/lib/errors.ts";
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
    const response = await c.rest<string>({ path: "/repos/o/r/actions/jobs/1/logs", accept: "text/plain" });
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
    await expect(c.rest({ path: "/repos/o/r/actions/jobs/1/logs", accept: "text/plain" })).rejects.toHaveProperty("status", 429);
    expect(store.read().pauseUntil).toBeUndefined();
  });

  test("pagination refuses an off-origin next link", async () => {
    const { client: c } = client();
    stubFetch(() => new Response("[1]", { headers: { link: '<https://evil.example/page2>; rel="next"' } }));
    await expect(c.restPaginate("repos/o/r/pulls")).rejects.toBeInstanceOf(EngGithubError);
    expect(calls.map((call) => call.url)).toEqual(["https://api.github.com/repos/o/r/pulls?per_page=100"]);
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

  test("queue does not fall back to the synchronous merge endpoint", async () => {
    await expect(run("queue")).rejects.toBeInstanceOf(EngGithubError);
    expect(calls.some((call) => call.url.endsWith("/pulls/1/merge"))).toBe(false);
  });

  test("direct still falls back to the synchronous merge endpoint", async () => {
    expect(await run("direct")).toEqual({ merged: true });
    expect(calls.some((call) => call.url.endsWith("/pulls/1/merge"))).toBe(true);
  });
});
