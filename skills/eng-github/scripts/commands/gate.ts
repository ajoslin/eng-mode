import { flag, oneOf, required } from "../lib/args.ts";
import type { CommandContext, CommandTable } from "../lib/command.ts";
import { EngGithubError, UsageError } from "../lib/errors.ts";
import { gateRecords, identity, latestEvidence, requireGate, validSha, type GateMarker } from "../lib/gate.ts";
import { fetchSnapshots } from "../lib/pr-query.ts";
import { parsePrRef, repoSlug } from "../lib/ref.ts";

async function post(ctx: CommandContext, kind: "evidence" | "signoff") {
  const input = ctx.args.positionals[0];
  if (!input) throw new UsageError("REF is required");
  const ref = await parsePrRef(input, ctx.cwd);
  const head = required(ctx.args, "head");
  if (!validSha(head)) throw new UsageError("--head must be a 40-hex SHA");
  const snapshot = (await fetchSnapshots(ctx.client, [ref]))[0];
  if (!snapshot) throw new EngGithubError("failure", "GitHub returned no pull request snapshot");
  if (snapshot.headSha !== head) throw new EngGithubError("changed", "Pull request head differs from --head");
  const body = await Bun.file(required(ctx.args, "body-file")).text();
  if (!body.trim()) throw new UsageError("--body-file must be non-empty");
  let marker: GateMarker;
  if (kind === "evidence") {
    const producer = required(ctx.args, "producer").trim();
    if (!producer) throw new UsageError("--producer must be non-empty");
    const surface = oneOf(required(ctx.args, "surface"), ["ui", "non-ui"], "surface", "non-ui");
    if (surface === "ui" && !/!\[[^\]]*\]\([^)]+\)|https?:\/\/[^\s<>]*github\.com\/user-attachments\/[^\s<>]+|https?:\/\/[^\s<>]+\.(?:png|jpe?g|gif|webp|mp4|mov|webm)(?:[?#][^\s<>]*)?(?=[\s<>)]|$)/i.test(body)) throw new UsageError("UI evidence requires an image or video link");
    marker = { v: 1, kind, sha: head, producer, surface, verdict: oneOf(required(ctx.args, "verdict"), ["pass", "fail"], "verdict", "fail") };
  } else {
    const reviewer = required(ctx.args, "reviewer").trim();
    if (!reviewer) throw new UsageError("--reviewer must be non-empty");
    const evidence = Number(required(ctx.args, "evidence"));
    if (!Number.isSafeInteger(evidence) || evidence <= 0) throw new UsageError("--evidence must be a positive comment id");
    const latest = latestEvidence(await gateRecords(ctx.client, ref), head);
    if (!latest || latest.kind !== "evidence" || latest.id !== evidence) throw new UsageError("--evidence must reference the latest trusted evidence for HEAD");
    if (identity(reviewer) === identity(latest.producer)) throw new UsageError("reviewer must differ from evidence producer");
    marker = { v: 1, kind, sha: head, evidence, reviewer, verdict: oneOf(required(ctx.args, "verdict"), ["approve", "block"], "verdict", "block") };
  }
  const response = await ctx.client.rest<unknown>({ method: "POST", path: `repos/${repoSlug(ref)}/issues/${ref.number}/comments`, body: { body: `<!-- eng-gate ${JSON.stringify(marker)} -->\n${body}` } });
  if (!response.data || typeof response.data !== "object" || !("id" in response.data) || typeof response.data.id !== "number" || !("html_url" in response.data) || typeof response.data.html_url !== "string") throw new EngGithubError("failure", "GitHub returned an invalid comment");
  return { id: response.data.id, url: response.data.html_url, sha: head, kind };
}
export const gateCommands: CommandTable = {
  "gate evidence": { run: (ctx) => post(ctx, "evidence") },
  "gate signoff": { run: (ctx) => post(ctx, "signoff") },
  "gate check": { async run(ctx) {
    const input = ctx.args.positionals[0];
    if (!input) throw new UsageError("REF is required");
    const ref = await parsePrRef(input, ctx.cwd);
    const snapshot = (await fetchSnapshots(ctx.client, [ref]))[0];
    if (!snapshot) throw new EngGithubError("failure", "GitHub returned no pull request snapshot");
    return requireGate(ctx.client, ref, flag(ctx.args, "head") ?? snapshot.headSha);
  } },
};
