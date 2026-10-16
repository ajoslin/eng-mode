import type { GitHubClient } from "./client.ts";
import { EngGithubError } from "./errors.ts";
import { fetchSnapshots } from "./pr-query.ts";
import { repoSlug, type PrRef } from "./ref.ts";

export type GateMarker = { v: 1; kind: "evidence"; sha: string; verdict: "pass" | "fail"; producer: string; surface: "ui" | "non-ui" } | { v: 1; kind: "signoff"; sha: string; evidence: number; verdict: "approve" | "block"; reviewer: string };
export type GateRecord = GateMarker & { id: number; url: string; createdAt: string };
export type GateResult = { state: "passed"; head: string; evidence: { id: number; url: string; producer: string }; signoff: { id: number; url: string; reviewer: string } } | { state: "blocked"; head: string; reasons: string[] };
export const validSha = (value: string): boolean => /^[a-f0-9]{40}$/i.test(value);
export const identity = (value: string): string => value.trim().toLowerCase();
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}
export function parseGateRecord(value: unknown): GateRecord | null {
  const comment = object(value);
  if (!comment || !["OWNER", "MEMBER", "COLLABORATOR"].includes(String(comment.author_association)) || typeof comment.body !== "string" || typeof comment.id !== "number" || !Number.isSafeInteger(comment.id) || typeof comment.html_url !== "string" || typeof comment.created_at !== "string" || !Number.isFinite(Date.parse(comment.created_at))) return null;
  const match = /^<!-- eng-gate (.+) -->\r?$/.exec(comment.body.split("\n")[0] ?? "");
  if (!match?.[1]) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(match[1]); } catch { return null; }
  const marker = object(parsed);
  if (!marker || marker.v !== 1 || typeof marker.sha !== "string" || !validSha(marker.sha)) return null;
  const metadata = { id: comment.id, url: comment.html_url, createdAt: comment.created_at };
  if (marker.kind === "evidence" && (marker.verdict === "pass" || marker.verdict === "fail") && typeof marker.producer === "string" && marker.producer.trim() && (marker.surface === "ui" || marker.surface === "non-ui")) return { ...metadata, v: 1, kind: "evidence", sha: marker.sha, verdict: marker.verdict, producer: marker.producer, surface: marker.surface };
  if (marker.kind === "signoff" && (marker.verdict === "approve" || marker.verdict === "block") && typeof marker.reviewer === "string" && marker.reviewer.trim() && typeof marker.evidence === "number" && Number.isSafeInteger(marker.evidence) && marker.evidence > 0) return { ...metadata, v: 1, kind: "signoff", sha: marker.sha, verdict: marker.verdict, reviewer: marker.reviewer, evidence: marker.evidence };
  return null;
}
export function latestEvidence(records: GateRecord[], head: string) {
  return records.filter((record) => record.kind === "evidence" && record.sha === head).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)[0];
}
export function evaluateGate({ head, records, unresolvedThreads, failingChecks }: { head: string; records: GateRecord[]; unresolvedThreads: number; failingChecks: string[] }): GateResult {
  const reasons: string[] = [];
  const evidence = latestEvidence(records, head);
  let approval: Extract<GateRecord, { kind: "signoff" }> | undefined;
  if (!evidence || evidence.kind !== "evidence") {
    reasons.push(`no evidence for HEAD ${head}`);
    const stale = [...new Set(records.filter((record) => record.kind === "evidence" && record.sha !== head).map((record) => record.sha))];
    if (stale.length) reasons.push(`stale evidence for ${stale.join(", ")}`);
  } else {
    if (evidence.verdict === "fail") reasons.push(`evidence ${evidence.id} failed for HEAD ${head}`);
    const signoffs = records.filter((record): record is Extract<GateRecord, { kind: "signoff" }> => record.kind === "signoff" && record.sha === head && record.evidence === evidence.id);
    if (signoffs.some((record) => record.verdict === "block")) reasons.push(`reviewer blocked evidence ${evidence.id}`);
    if (signoffs.some((record) => record.verdict === "approve" && identity(record.reviewer) === identity(evidence.producer))) reasons.push("self-signoff does not count: reviewer equals evidence producer");
    approval = signoffs.find((record) => record.verdict === "approve" && identity(record.reviewer) !== identity(evidence.producer));
    if (!approval) reasons.push("no independent sign-off");
  }
  if (unresolvedThreads) reasons.push(`${unresolvedThreads} unresolved review thread(s)`);
  if (failingChecks.length) reasons.push(`failing checks: ${failingChecks.join(", ")}`);
  if (reasons.length || !evidence || evidence.kind !== "evidence" || !approval) return { state: "blocked", head, reasons };
  return { state: "passed", head, evidence: { id: evidence.id, url: evidence.url, producer: evidence.producer }, signoff: { id: approval.id, url: approval.url, reviewer: approval.reviewer } };
}
export async function gateRecords(client: GitHubClient, ref: PrRef): Promise<GateRecord[]> {
  const comments = await client.restPaginate<unknown>(`repos/${repoSlug(ref)}/issues/${ref.number}/comments`);
  return comments.flatMap((comment) => { const record = parseGateRecord(comment); return record ? [record] : []; });
}
export async function requireGate(client: GitHubClient, ref: PrRef, head: string): Promise<Extract<GateResult, { state: "passed" }>> {
  const snapshot = (await fetchSnapshots(client, [ref]))[0];
  if (!snapshot) throw new EngGithubError("failure", "GitHub returned no pull request snapshot");
  if (snapshot.headSha !== head) throw new EngGithubError("changed", "Pull request head differs from --head");
  const result = evaluateGate({ head, records: await gateRecords(client, ref), unresolvedThreads: snapshot.threads.filter((thread) => !thread.resolved).length, failingChecks: snapshot.checks.filter((check) => ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"].includes(check.conclusion ?? "")).map((check) => check.name) });
  if (result.state === "blocked") throw new EngGithubError("gate", "pre-merge gate blocked", result);
  return result;
}
