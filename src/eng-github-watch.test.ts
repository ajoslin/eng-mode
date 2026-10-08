import { describe, expect, test } from "bun:test";
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
  reviewDecision: null,
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
