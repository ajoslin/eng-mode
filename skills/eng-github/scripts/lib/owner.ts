import { hostname } from "node:os";
import { basename } from "node:path";
import { run } from "./process.ts";

export type PrOwner = { host: string; session: string; parent: string | null; pane: string | null; project: string | null };
type OwnerProcess = { pid: number; command: string; env: Record<string, string | undefined> };
export type OwnerDeps = {
  env: Record<string, string | undefined>;
  hostname(): string;
  processTree(): Promise<OwnerProcess[]>;
  herdrPane(paneId: string): Promise<unknown>;
  gitToplevel(cwd: string): Promise<string | undefined>;
  repo: string;
  cwd?: string;
  timeoutMs?: number;
};

const markers = () => /<!--\s*omp-owner:([^\n<>]*?)-->/g;
const clean = (value: string | null | undefined) => (value ?? "").replace(/[\s<>]/g, "").replace(/--+/g, "");

export function formatOwnerMarker(owner: PrOwner): string {
  return `<!-- omp-owner: host=${clean(owner.host)} session=${clean(owner.session)} parent=${clean(owner.parent)} pane=${clean(owner.pane)} project=${clean(owner.project)} -->`;
}

export function applyOwnerMarker(body: string, owner: PrOwner): string {
  return `${body.replace(/(?:\r?\n[ \t]*){0,2}<!--\s*omp-owner:[^\n<>]*?-->/g, "").trimEnd()}\n\n${formatOwnerMarker(owner)}\n`;
}

export function parseOwnerMarker(body: string): PrOwner | null {
  let result: PrOwner | null = null;
  for (const match of body.matchAll(markers())) {
    const values = new Map((match[1] ?? "").trim().split(/\s+/).map((part): [string, string] => {
      const index = part.indexOf("=");
      return [part.slice(0, index), part.slice(index + 1)];
    }));
    result = values.get("host") && values.get("session") ? {
      host: values.get("host") ?? "", session: values.get("session") ?? "",
      parent: values.get("parent") || null, pane: values.get("pane") || null, project: values.get("project") || null,
    } : null;
  }
  return result;
}

function sessionPath(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("result" in value)) return null;
  const result = value.result;
  if (typeof result !== "object" || result === null || !("pane" in result)) return null;
  const pane = result.pane;
  if (typeof pane !== "object" || pane === null || !("agent_session" in pane)) return null;
  const session = pane.agent_session;
  return typeof session === "object" && session !== null && "value" in session && typeof session.value === "string" ? session.value : null;
}

export async function resolveOwner(deps: OwnerDeps): Promise<PrOwner | null> {
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => deadline.reject(new Error("owner resolution timed out")), deps.timeoutMs ?? 5_000);
  try {
    return await Promise.race([resolveOwnerDetails(deps), deadline.promise]);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveOwnerDetails(deps: OwnerDeps): Promise<PrOwner | null> {
  let session = clean(deps.env.OMP_SESSION_ID);
  let pane = clean(deps.env.HERDR_PANE_ID);
  if (!session) {
    if (!pane) {
      const processes = await deps.processTree();
      const omp = processes.filter((entry) => basename(entry.command) === "omp").at(-1);
      pane = clean(omp?.env.HERDR_PANE_ID);
    }
    if (pane) {
      const path = sessionPath(await deps.herdrPane(pane));
      session = path ? basename(path).match(/^[^_]+_(.+)\.jsonl$/)?.[1] ?? "" : "";
    }
  }
  if (!session) return null;
  const top = await deps.gitToplevel(deps.cwd ?? process.cwd());
  return {
    host: clean(deps.env.FLEET_WATCH_HOST) || deps.hostname().split(".")[0] || "",
    session, parent: clean(deps.env.OMP_SESSION_ID) ? clean(deps.env.OMP_PARENT_SESSION_ID) || null : null,
    pane: pane || null, project: top?.match(/\/\.rifts\/([^/]+)(?:\/|$)/)?.[1] ?? deps.repo.split("/").at(-1) ?? null,
  };
}

async function processTree(): Promise<OwnerProcess[]> {
  const tree: OwnerProcess[] = [];
  let pid = process.ppid;
  const seen = new Set<number>();
  while (pid > 1 && !seen.has(pid)) {
    seen.add(pid);
    const info = await run(["ps", "-o", "ppid=,comm=", "-p", String(pid)], { timeoutMs: 1_000 });
    const match = info.stdout.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) break;
    let env: Record<string, string | undefined> = {};
    if (basename(match[2] ?? "") === "omp") {
      if (process.platform === "linux") {
        const text = await Bun.file(`/proc/${pid}/environ`).text();
        env = Object.fromEntries(text.split("\0").filter((part) => part.includes("=")).map((part) => [part.slice(0, part.indexOf("=")), part.slice(part.indexOf("=") + 1)]));
      } else {
        const command = await run(["ps", "eww", "-o", "command=", "-p", String(pid)], { timeoutMs: 1_000 });
        env.HERDR_PANE_ID = command.stdout.match(/(?:^|\s)HERDR_PANE_ID=([^\s]+)/)?.[1];
      }
    }
    tree.push({ pid, command: match[2] ?? "", env });
    pid = Number(match[1]);
  }
  return tree;
}

export function ownerDeps(repo: string, cwd: string): OwnerDeps {
  return { env: process.env, hostname, processTree, repo, cwd,
    async gitToplevel(directory) {
      const result = await run(["git", "rev-parse", "--show-toplevel"], { cwd: directory, timeoutMs: 1_000 });
      return result.code === 0 ? result.stdout.trim() : undefined;
    },
    async herdrPane(pane) {
      const result = await run(["herdr", "pane", "get", pane], { timeoutMs: 10_000 });
      if (result.code !== 0) throw new Error(result.stderr.trim() || `herdr exited ${result.code}`);
      const value: unknown = JSON.parse(result.stdout);
      return value;
    },
  };
}

export function ownerWarning(error: unknown): void {
  process.stderr.write(`eng-github: warning: fleet-watch owner registration failed: ${String(error instanceof Error ? error.message : error).replace(/\s+/g, " ")}\n`);
}

export async function registerOwner(input: { owner: PrOwner; repo: string; number: number; headRef: string; headSha: string }, deps = { env: process.env, run, warn: ownerWarning }, timeoutMs = 10_000): Promise<void> {
  const { owner } = input;
  const argv = [deps.env.FLEET_WATCH_BIN || "fleet-watch", "pr", "register-owner", "--repo", input.repo, "--number", String(input.number), "--head-ref", input.headRef, "--head-sha", input.headSha, "--session", owner.session];
  if (owner.parent) argv.push("--parent", owner.parent);
  if (owner.pane) argv.push("--pane", owner.pane);
  argv.push("--host", owner.host);
  if (owner.project) argv.push("--project", owner.project);
  try {
    const result = await deps.run(argv, { timeoutMs });
    if (result.code !== 0) deps.warn(result.stderr.trim() || `process exited ${result.code}`);
  } catch (error) {
    deps.warn(error);
  }
}
