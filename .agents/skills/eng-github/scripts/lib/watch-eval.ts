import type { Check, Snapshot } from "./pr-query.ts";
export type Until = "any" | "ci" | "comments";
export interface Wake {
  event:
    | "merged"
    | "closed"
    | "head-changed"
    | "conflict"
    | "checks-failed"
    | "checks-passed"
    | "activity";
  ref: string;
  head: string;
  base: string;
  reason: string;
}
export function failing(check: Check): boolean {
  return [
    "FAILURE",
    "ERROR",
    "CANCELLED",
    "TIMED_OUT",
    "ACTION_REQUIRED",
    "STARTUP_FAILURE",
    "STALE",
  ].includes(check.conclusion ?? check.status);
}
export function passed(checks: readonly Check[]): boolean {
  const required = checks.filter((c) => c.required);
  const selected = required.length ? required : checks;
  return (
    selected.length > 0 &&
    selected.every((c) =>
      ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(c.conclusion ?? c.status),
    )
  );
}
export function evaluateWake(
  baseline: Snapshot,
  current: Snapshot,
  viewer: string,
  since: string,
  until: Until = "any",
  seenFailures: ReadonlySet<string> = new Set(),
): Wake | null {
  const wake = (event: Wake["event"], reason: string): Wake => ({
    event,
    ref: current.ref,
    head: current.headSha,
    base: current.baseSha,
    reason,
  });
  if (current.state !== baseline.state && current.state === "MERGED")
    return wake("merged", "PR merged");
  if (current.state !== baseline.state && current.state === "CLOSED")
    return wake("closed", "PR closed");
  if (current.headSha !== baseline.headSha)
    return wake("head-changed", "Head changed");
  if (
    current.mergeable === "CONFLICTING" &&
    baseline.mergeable !== "CONFLICTING"
  )
    return wake("conflict", "PR became unmergeable");
  if (until !== "comments") {
    const previous = new Set(
      baseline.checks.filter(failing).map((c) => c.name),
    );
    const fresh = current.checks.filter(
      (c) =>
        failing(c) &&
        !previous.has(c.name) &&
        !seenFailures.has(`${current.headSha}:${c.name}`),
    );
    if (fresh.length)
      return wake("checks-failed", fresh.map((c) => c.name).join(", "));
    if (passed(current.checks) && !passed(baseline.checks))
      return wake("checks-passed", "All selected checks passed");
  }
  if (until !== "ci") {
    const activity = [
      ...current.activity,
      ...current.threads.flatMap((t) => t.comments),
      ...current.reviews.map((r) => ({
        author: r.author,
        createdAt: r.submittedAt ?? "",
      })),
    ];
    if (
      activity.some(
        (a) => a.author !== null && a.author !== viewer && a.createdAt > since,
      )
    )
      return wake("activity", "New activity from another author");
  }
  return null;
}
