import { statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
  ToolResultBlock,
  ToolResultEvent,
  ToolResultEventResult,
} from "./extension-types.ts";

export const LEAD_WRITES_COMMAND = "eng-lead-writes";

export const LEAD_WRITE_BLOCK_REASON =
  "Lead writes are blocked for this session. Delegate repository edits to a worker, or /eng-lead-writes allow.";

export function readBlockReason(path: string): string {
  return `${path} is unchanged since it was read earlier in this session; its content is already in context. Read a narrower range, or append ?fresh to force.`;
}

/** Inline byte budget per tool for results that persist in the lead's context. */
export const RESULT_CAPS: Readonly<Record<string, number>> = {
  hub: 6144,
  bash: 12288,
  eval: 12288,
  task: 4096,
  web_search: 8192,
  read: 24576,
  grep: 16384,
  edit: 512,
  write: 512,
  todo: 512,
};
export const DEFAULT_RESULT_CAP = 16384;

interface ReadStamp {
  readonly resolvedPath: string;
  readonly mtimeMs: number;
  readonly size: number;
}

export interface GuardState {
  leadWrites: "blocked" | "allowed";
  readonly reads: Map<string, ReadStamp>;
}

const FRESH_SUFFIX = /[?&]fresh$/;
const EDIT_HEADERS = /^\[([^\]#]+)#[0-9A-Fa-f]{4}\]/gm;

interface ReadDetails {
  readonly resolvedPath?: unknown;
  readonly meta?: {
    readonly source?: { readonly type?: unknown; readonly value?: unknown };
    readonly truncation?: { readonly artifactId?: unknown };
  };
}

/** `details` is tool-owned; only the fields the guard consumes are checked. */
function detailsOf(details: unknown): ReadDetails {
  return typeof details === "object" && details !== null ? (details as ReadDetails) : {};
}

/** Plain file reads report `meta.source.value`; internal URIs (skill://, artifact://) report `resolvedPath`. */
function readFilePath(details: unknown): string | undefined {
  const d = detailsOf(details);
  if (typeof d.resolvedPath === "string") return d.resolvedPath;
  const source = d.meta?.source;
  return source?.type === "path" && typeof source.value === "string" ? source.value : undefined;
}

/**
 * Only the interactive lead runs with `mode: "tui"`. Subagents, revived
 * workers, print, and RPC sessions all initialize as headless modes, so a
 * positive `tui` check is the one signal that never misclassifies a worker.
 */
export function isLeadSession(context: ExtensionContext): boolean {
  return context.mode === "tui";
}

function stat(path: string): { mtimeMs: number; size: number } | undefined {
  try {
    const info = statSync(path);
    return { mtimeMs: info.mtimeMs, size: info.size };
  } catch {
    return undefined;
  }
}

function writeTargets(event: ToolCallEvent): string[] {
  const path = event.input.path;
  if (typeof path === "string" && path.length > 0) return [path];
  if (event.toolName !== "edit") return [];
  const script = event.input.input;
  if (typeof script !== "string") return [];
  return [...script.matchAll(EDIT_HEADERS)].map((match) => match[1] ?? "");
}

function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function artifactIdFromDetails(details: unknown): string | undefined {
  const id = detailsOf(details).meta?.truncation?.artifactId;
  return typeof id === "string" ? id : undefined;
}

function cutAtNewline(text: string, maxBytes: number, fromEnd: boolean): string {
  const buffer = Buffer.from(text, "utf-8");
  if (buffer.byteLength <= maxBytes) return text;
  if (fromEnd) {
    const slice = buffer.subarray(buffer.byteLength - maxBytes).toString("utf-8");
    const nl = slice.indexOf("\n");
    return nl === -1 ? slice : slice.slice(nl + 1);
  }
  const slice = buffer.subarray(0, maxBytes).toString("utf-8");
  const nl = slice.lastIndexOf("\n");
  return nl === -1 ? slice : slice.slice(0, nl);
}

export function capResultText(fullText: string, cap: number, artifactId: string | undefined): string {
  const headBudget = Math.floor(cap * 0.6);
  const head = cutAtNewline(fullText, headBudget, false);
  const tail = cutAtNewline(fullText, cap - headBudget, true);
  const totalLines = fullText.split("\n").length;
  const shownLines = head.split("\n").length + tail.split("\n").length;
  const elidedLines = Math.max(0, totalLines - shownLines);
  const elidedKb = Math.max(
    0,
    Math.round((Buffer.byteLength(fullText, "utf-8") - Buffer.byteLength(head + tail, "utf-8")) / 1024),
  );
  const source = artifactId === undefined
    ? "full output not retained"
    : `full output: artifact://${artifactId} — read it with a line range instead of re-running the tool`;
  return `${head}\n[… ${elidedLines} lines / ${elidedKb} KB elided; ${source} …]\n${tail}`;
}

export function registerContextGuard(pi: ExtensionAPI): GuardState {
  const state: GuardState = { leadWrites: "allowed", reads: new Map() };
  for (const event of ["session_start", "session_switch", "session_branch"] as const) {
    pi.on(event, () => {
      state.leadWrites = "allowed";
      state.reads.clear();
    });
  }

  pi.registerCommand?.(LEAD_WRITES_COMMAND, {
    description: "Allow (default) or block lead repository writes: allow | block.",
    async handler(args, context): Promise<void> {
      const mode = args.trim();
      if (mode === "allow" || mode === "block") {
        state.leadWrites = mode === "allow" ? "allowed" : "blocked";
      }
      context.ui.notify(`Lead repository writes: ${state.leadWrites}.`, "info");
    },
  });

  pi.on("tool_call", (event, context): ToolCallEventResult | undefined => {
    if (!isLeadSession(context)) return undefined;

    if (event.toolName === "write" || event.toolName === "edit") {
      if (state.leadWrites === "allowed") return undefined;
      const artifactsDir = context.sessionManager?.getArtifactsDir();
      const repositoryTarget = writeTargets(event).some(
        (target) => !target.includes("://") && !(artifactsDir && isInside(artifactsDir, target)),
      );
      return repositoryTarget ? { block: true, reason: LEAD_WRITE_BLOCK_REASON } : undefined;
    }

    if (event.toolName === "read") {
      const key = event.input.path;
      if (typeof key !== "string") return undefined;
      if (FRESH_SUFFIX.test(key)) {
        state.reads.delete(key.replace(FRESH_SUFFIX, ""));
        return { input: { ...event.input, path: key.replace(FRESH_SUFFIX, "") } };
      }
      const stamp = state.reads.get(key);
      if (!stamp) return undefined;
      const current = stat(stamp.resolvedPath);
      if (!current || current.mtimeMs !== stamp.mtimeMs || current.size !== stamp.size) {
        state.reads.delete(key);
        return undefined;
      }
      return { block: true, reason: readBlockReason(key) };
    }
    return undefined;
  });

  pi.on("tool_result", async (event, context): Promise<ToolResultEventResult | undefined> => {
    if (!isLeadSession(context) || event.isError) return undefined;

    if (event.toolName === "read") {
      const key = event.input.path;
      const resolvedPath = readFilePath(event.details);
      if (typeof key === "string" && typeof resolvedPath === "string") {
        const current = stat(resolvedPath);
        if (current) state.reads.set(key.replace(FRESH_SUFFIX, ""), { resolvedPath: resolve(resolvedPath), ...current });
      }
    } else if (event.toolName === "write" || event.toolName === "edit") {
      const written = new Set(writeTargets({ ...event, type: "tool_call" }).map((target) => resolve(target)));
      for (const [key, stamp] of state.reads) {
        if (written.has(stamp.resolvedPath)) state.reads.delete(key);
      }
    }

    const cap = RESULT_CAPS[event.toolName] ?? DEFAULT_RESULT_CAP;
    const textBlocks = event.content.filter((block) => block.type === "text" && typeof block.text === "string");
    if (textBlocks.length === 0) return undefined;
    const fullText = textBlocks.map((block) => block.text ?? "").join("\n");
    if (Buffer.byteLength(fullText, "utf-8") <= cap) return undefined;

    const artifactId = artifactIdFromDetails(event.details)
      ?? (await context.sessionManager?.saveArtifact(fullText, event.toolName));
    const content: ToolResultBlock[] = [
      ...event.content.filter((block) => block.type !== "text"),
      { type: "text", text: capResultText(fullText, cap, artifactId) },
    ];
    return { content };
  });

  return state;
}
