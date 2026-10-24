import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiRoot, GitHubClient } from "../skills/eng-github/scripts/lib/client.ts";
import type { Credential } from "../skills/eng-github/scripts/lib/credentials.ts";
import { blockingOf, fetchFingerprints } from "../skills/eng-github/scripts/lib/pr-query.ts";
import { StateStore } from "../skills/eng-github/scripts/lib/state.ts";
import type {
  Check,
  Snapshot,
} from "../skills/eng-github/scripts/lib/pr-query.ts";
import { evaluateWake } from "../skills/eng-github/scripts/lib/watch-eval.ts";
const since = "2026-10-07T00:00:00Z";
const baseline: Snapshot = {
  ref: "o/r#1",
  url: "https://github.com/o/r/pull/1",
  number: 1,
  title: "PR",
  state: "OPEN",
  isDraft: false,
  headRef: "feature",
  headSha: "a",
  baseRef: "main",
  baseSha: "b",
  behindBy: 0,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  blocking: [],
  reviewDecision: null,
  mergeQueue: null,
  autoMerge: null,
  nodeId: "id",
  checks: [],
  threads: [],
  reviews: [],
  stack: null,
  labels: [],
  activity: [],
};
function check(name: string, conclusion: string, required = false): Check {
  return {
    name,
    conclusion,
    required,
    status: "COMPLETED",
    detailsUrl: null,
    databaseId: null,
    workflowRunId: null,
  };
}
describe("watch wakes", () => {
  test("queued to absent while OPEN wakes dequeued", () => {
    const queued: Snapshot = { ...baseline, mergeQueue: { state: "QUEUED", position: 1 } };
    expect(evaluateWake(queued, baseline, "me", since)?.event).toBe("dequeued");
  });
  test("queued to absent with MERGED wakes merged", () => {
    const queued: Snapshot = { ...baseline, mergeQueue: { state: "QUEUED", position: 1 } };
    expect(evaluateWake(queued, { ...baseline, state: "MERGED" }, "me", since)?.event).toBe("merged");
  });
  test("no queue entry on either side does not wake dequeued", () => {
    expect(evaluateWake(baseline, baseline, "me", since)).toBeNull();
  });
  test("retained queue entry becoming UNMERGEABLE wakes once", () => {
    const queued: Snapshot = { ...baseline, mergeQueue: { state: "AWAITING_CHECKS", position: 1 } };
    const blocked: Snapshot = { ...baseline, mergeQueue: { state: "UNMERGEABLE", position: 1 } };
    expect(evaluateWake(queued, blocked, "me", since)?.event).toBe("dequeued");
    expect(evaluateWake(blocked, blocked, "me", since)).toBeNull();
  });
  test.each([
    ["MERGEABLE", "BEHIND", "behind"],
    ["UNKNOWN", "DIRTY", "conflict"],
  ])("CLEAN to %s/%s wakes conflict naming %s", (mergeable, mergeStateStatus, entry) => {
    const current = {
      ...baseline,
      mergeable,
      mergeStateStatus,
      blocking: blockingOf(mergeable, mergeStateStatus),
    };
    expect(evaluateWake(baseline, current, "me", since)).toEqual({
      event: "conflict",
      ref: "o/r#1",
      head: "a",
      base: "b",
      reason: `PR became blocked: ${entry}`,
    });
  });
  test("BEHIND to BEHIND does not wake", () => {
    const behind = {
      ...baseline,
      mergeStateStatus: "BEHIND",
      blocking: blockingOf("MERGEABLE", "BEHIND"),
    };
    expect(evaluateWake(behind, behind, "me", since)).toBeNull();
    expect(evaluateWake(baseline, behind, "me", since)?.reason).toBe("PR became blocked: behind");
  });
  test("only new failing names wake and seen failures are deduped per head", () => {
    const old = { ...baseline, checks: [check("old", "FAILURE")] };
    const current = {
      ...old,
      checks: [...old.checks, check("new", "CANCELLED")],
    };
    expect(evaluateWake(old, current, "me", since)?.event).toBe(
      "checks-failed",
    );
    expect(evaluateWake(old, old, "me", since)).toBeNull();
    expect(
      evaluateWake(old, current, "me", since, "any", new Set(["a:new"])),
    ).toBeNull();
    expect(
      evaluateWake(old, current, "me", since, "any", new Set(["other:new"]))
        ?.event,
    ).toBe("checks-failed");
  });
  test("required checks determine passage when present", () => {
    const old = {
      ...baseline,
      checks: [
        check("required", "PENDING", true),
        check("optional", "FAILURE"),
      ],
    };
    const current = {
      ...old,
      checks: [
        check("required", "SUCCESS", true),
        check("optional", "FAILURE"),
      ],
    };
    expect(evaluateWake(old, current, "me", since)?.event).toBe(
      "checks-passed",
    );
  });
  test("without required checks every check must pass", () => {
    const old = {
      ...baseline,
      checks: [check("one", "PENDING"), check("two", "PENDING")],
    };
    expect(
      evaluateWake(
        old,
        { ...old, checks: [check("one", "SUCCESS"), check("two", "PENDING")] },
        "me",
        since,
      ),
    ).toBeNull();
    expect(
      evaluateWake(
        old,
        { ...old, checks: [check("one", "NEUTRAL"), check("two", "SKIPPED")] },
        "me",
        since,
      )?.event,
    ).toBe("checks-passed");
  });
  test("activity ignores viewer and pre-watch activity", () => {
    const comment = {
      author: "me",
      body: "hello",
      createdAt: "2026-10-07T01:00:00Z",
    };
    expect(
      evaluateWake(baseline, { ...baseline, activity: [comment] }, "me", since),
    ).toBeNull();
    expect(
      evaluateWake(
        baseline,
        {
          ...baseline,
          activity: [{ ...comment, author: "other", createdAt: since }],
        },
        "me",
        since,
      ),
    ).toBeNull();
    expect(
      evaluateWake(
        baseline,
        { ...baseline, activity: [{ ...comment, author: "other" }] },
        "me",
        since,
      )?.event,
    ).toBe("activity");
  });
  test("head changes precede conflicts and failures", () => {
    expect(
      evaluateWake(
        baseline,
        {
          ...baseline,
          headSha: "new",
          mergeable: "CONFLICTING",
          checks: [check("ci", "FAILURE")],
        },
        "me",
        since,
      )?.event,
    ).toBe("head-changed");
  });
  test("until filters only activity or checks", () => {
    const activity = {
      ...baseline,
      activity: [
        { author: "other", body: "hello", createdAt: "2026-10-07T01:00:00Z" },
      ],
    };
    expect(evaluateWake(baseline, activity, "me", since, "ci")).toBeNull();
    expect(
      evaluateWake(baseline, activity, "me", since, "comments")?.event,
    ).toBe("activity");
    expect(
      evaluateWake(
        baseline,
        { ...baseline, checks: [check("ci", "FAILURE")] },
        "me",
        since,
        "comments",
      ),
    ).toBeNull();
    expect(
      evaluateWake(
        baseline,
        { ...baseline, headSha: "new" },
        "me",
        since,
        "comments",
      )?.event,
    ).toBe("head-changed");
  });
});

test("fingerprint status changes when only mergeStateStatus changes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eng-github-watch-"));
  const originalFetch = globalThis.fetch;
  let mergeStateStatus = "CLEAN";
  let mergeQueueEntry: { state: string; position: number } | null = null;
  globalThis.fetch = Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
    expect(String(init?.body)).toContain("mergeStateStatus");
    return new Response(JSON.stringify({ data: { p0: { pullRequest: {
      state: "OPEN", mergeable: "MERGEABLE", mergeStateStatus, headRefOid: "a",
      mergeQueueEntry,
      comments: { totalCount: 0, nodes: [] }, reviews: { totalCount: 0, nodes: [] },
      reviewThreads: { totalCount: 0 }, commits: { nodes: [] },
    } } } }));
  }, { preconnect: originalFetch.preconnect });
  try {
    const credential: Credential = { host: "github.com", token: "test-token", source: "ENG_GITHUB_TOKEN", fingerprint: "github.com:watch-test" };
    const client = new GitHubClient(credential, new StateStore(credential.fingerprint, dir), apiRoot("github.com"));
    const refs = [{ owner: "o", name: "r", number: 1 }];
    const clean = await fetchFingerprints(client, refs);
    mergeStateStatus = "BEHIND";
    const behind = await fetchFingerprints(client, refs);
    expect(clean.map((value) => value.status)).toEqual(['["OPEN","a","MERGEABLE","CLEAN",null,[]]']);
    expect(behind.map((value) => value.status)).toEqual(['["OPEN","a","MERGEABLE","BEHIND",null,[]]']);
    expect(behind.map((value) => value.mergeStateStatus)).toEqual(["BEHIND"]);
    mergeQueueEntry = { state: "QUEUED", position: 1 };
    const queued = await fetchFingerprints(client, refs);
    expect(queued.map((value) => value.mergeQueue)).toEqual([{ state: "QUEUED", position: 1 }]);
    expect(queued.map((value) => value.status)).toEqual(['["OPEN","a","MERGEABLE","BEHIND",{"state":"QUEUED","position":1},[]]']);
    mergeQueueEntry = null;
    const dequeued = await fetchFingerprints(client, refs);
    expect(dequeued.map((value) => value.status)).toEqual(behind.map((value) => value.status));
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});
