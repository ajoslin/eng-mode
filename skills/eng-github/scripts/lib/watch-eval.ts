import type { Check, Snapshot } from "./pr-query.ts";
export type Until = "any" | "ci" | "comments";
export interface Wake {
  event:
    | "merged"
    | "closed"
    | "dequeued"
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
export function checkKey(check: Check): string {
  return JSON.stringify([check.workflowName ?? "", check.name]);
}
export function pending(check: Check): boolean {
  return check.conclusion === null || ["PENDING", "EXPECTED"].includes(check.conclusion) || (check.status !== "COMPLETED" && check.status !== check.conclusion);
}
export function owedChecks(snapshot: Snapshot): ReadonlySet<string> {
  return new Set(snapshot.checks.some((check) => check.required) && passed(snapshot.checks)
    ? snapshot.checks.filter((check) => !check.required && pending(check)).map(checkKey)
    : []);
}
export function evaluateWake(
  baseline: Snapshot,
  current: Snapshot,
  viewer: string,
  since: string,
  until: Until = "any",
  seenFailures: ReadonlySet<string> = new Set(),
  owed: ReadonlySet<string> = new Set(),
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
  if (
    current.state === "OPEN" &&
    baseline.mergeQueue !== null &&
    (current.mergeQueue === null ||
      (current.mergeQueue.state === "UNMERGEABLE" && baseline.mergeQueue.state !== "UNMERGEABLE"))
  )
    return wake("dequeued", current.mergeQueue === null ? "PR left the merge queue" : "Merge queue entry became unmergeable");
  if (current.headSha !== baseline.headSha)
    return wake("head-changed", "Head changed");
  const newBlocking = current.blocking.filter(
    (entry) => !baseline.blocking.includes(entry),
  );
  if (newBlocking.length)
    return wake("conflict", `PR became blocked: ${newBlocking.join(", ")}`);
  if (until !== "comments") {
    const previous = new Set(
      baseline.checks.filter(failing).map(checkKey),
    );
    const fresh = current.checks.filter(
      (c) =>
        failing(c) &&
        !previous.has(checkKey(c)) &&
        !seenFailures.has(`${current.headSha}:${checkKey(c)}`),
    );
    if (fresh.length)
      return wake("checks-failed", fresh.map((c) => c.name).join(", "));
    if (passed(current.checks) && !passed(baseline.checks))
      return wake("checks-passed", "All selected checks passed");
    if (owed.size > 0 && current.checks.some((check) => owed.has(checkKey(check))) && !current.checks.some(failing) && !current.checks.some(pending))
      return wake("checks-passed", "Remaining checks finished");
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
        (a) => a.author !== null && a.author !== viewer && Date.parse(a.createdAt) > Date.parse(since),
      )
    )
      return wake("activity", "New activity from another author");
  }
  return null;
}
