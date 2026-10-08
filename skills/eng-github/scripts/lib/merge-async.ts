import type { GitHubClient } from "./client.ts";
import { ApiError, EngGithubError } from "./errors.ts";
import { repoSlug, type PrRef } from "./ref.ts";

export type MergeMethod = "squash" | "merge" | "rebase";
export type MergeAction = "default" | "direct" | "queue";
export type MergeStatus = "pending" | "merged" | "enqueued" | "failed";
export interface MergeAsyncResult {
  readonly status: MergeStatus;
  readonly details: Record<string, unknown>;
}
export interface MergeAsyncOptions {
  readonly head: string;
  readonly method?: MergeMethod;
  readonly action: MergeAction;
  readonly admin?: boolean;
  readonly deadlineMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new EngGithubError("failure", "Invalid async merge response", { response: value });
  return Object.fromEntries(Object.entries(value));
}

function decode(value: unknown): MergeAsyncResult {
  const result = object(value);
  const status = result.status;
  if (status !== "pending" && status !== "merged" && status !== "enqueued" && status !== "failed") throw new EngGithubError("failure", "Invalid async merge status", { response: value });
  return { status, details: object(result.details) };
}

export async function mergeAsync(client: GitHubClient, ref: PrRef, options: MergeAsyncOptions): Promise<MergeAsyncResult> {
  const base = `repos/${repoSlug(ref)}/pulls/${ref.number}/merge-async`;
  const mergeAction = options.action === "direct" ? "direct_merge" : options.action === "queue" ? "merge_queue" : "default";
  const body = { sha: options.head, ...(options.method === undefined ? {} : { merge_method: options.method }), merge_action: mergeAction, ...(options.admin === true ? { bypass_rules: true } : {}) };
  let raw: unknown;
  try {
    raw = (await client.rest({ method: "PUT", path: base, body })).data;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    const existing = object(error.body);
    const details = object(existing.details);
    const prior = object(details.options ?? existing.options ?? details);
    const methodDiffers = body.merge_method !== undefined && prior.merge_method !== body.merge_method;
    if ((prior.sha ?? prior.expected_head_sha) !== options.head || methodDiffers || prior.merge_action !== body.merge_action || (prior.bypass_rules ?? false) !== (body.bypass_rules ?? false)) throw new EngGithubError("conflict", "A pending merge has different options", { response: error.body });
    raw = error.body;
  }
  let result = decode(raw);
  const deadline = Date.now() + (options.deadlineMs ?? 300_000);
  let delay = 1_000;
  while (result.status === "pending" && Date.now() < deadline) {
    const uuid = result.details.uuid;
    if (typeof uuid !== "string" || !uuid) throw new EngGithubError("failure", "Pending merge has no UUID", result.details);
    const duration = Math.min(delay, Math.max(0, deadline - Date.now()));
    if (options.sleep) await options.sleep(duration);
    else await Bun.sleep(duration);
    if (Date.now() >= deadline) break;
    try {
      result = decode((await client.rest({ path: `${base}/${encodeURIComponent(uuid)}` })).data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw new EngGithubError("failure", "Async merge operation no longer exists", { uuid, response: error.body });
      throw error;
    }
    delay = Math.min(delay * 2, 10_000);
  }
  return result;
}
