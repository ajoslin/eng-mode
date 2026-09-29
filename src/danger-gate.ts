import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionEventContext, ToolCallEvent, ToolCallEventResult } from "./extension-types.ts";
import type { DangerVerdict, OperationClassifier } from "./typesafe.ts";

const DANGER_GATE_TIMEOUT_MS = 5_000;
/** Block at or above this probability that the call is severe and unauthorized. */
const RISK_THRESHOLD = 0.5;

export const HIGHLY_DANGEROUS_BLOCK_REASON =
  "Blocked by the danger gate: this operation was classified as severe and not authorized by the user. Do not retry it or work around it; ask the user to run it themselves or to authorize it explicitly.";

interface GatedCall {
  readonly tool: string;
  readonly input: string;
}

/**
 * The call to classify, or undefined when it needs no gate. Shell and code execution are always
 * classified. File writes inside the project are reviewable through version control and skip the
 * classifier; writes outside it (dotfiles, crontabs, other repos) are classified.
 */
function gatedCall(event: ToolCallEvent, cwd: string): GatedCall | undefined {
  const { toolName, input } = event;
  switch (toolName) {
    case "bash":
      return typeof input.command === "string" ? { tool: "bash", input: input.command } : undefined;
    case "eval": {
      const language = typeof input.language === "string" ? input.language : "?";
      return typeof input.code === "string" ? { tool: `eval(${language})`, input: input.code } : undefined;
    }
    case "write":
    case "edit": {
      const path = input.path;
      if (typeof path !== "string" || path.includes("://")) return undefined;
      const rel = relative(cwd, resolve(cwd, path.replace(/^~(?=\/|$)/, process.env.HOME ?? "~")));
      if (!rel.startsWith("..") && !isAbsolute(rel)) return undefined;
      const body = typeof input.content === "string" ? input.content : typeof input.input === "string" ? input.input : "";
      return { tool: toolName, input: `${path}\n${body}` };
    }
    default:
      return undefined;
  }
}

/** User messages on the current branch, oldest first. Includes parent-agent messages, which relay the user. */
function userMessages(ctx: ExtensionEventContext): string[] {
  const messages: string[] = [];
  for (const entry of ctx.sessionManager?.getBranch() ?? []) {
    if (entry.type !== "message" || entry.message?.role !== "user") continue;
    const content = entry.message.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((part: { type?: unknown; text?: unknown }) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
              .filter((part) => part.length > 0)
              .join("\n")
          : "";
    if (text.length > 0) messages.push(text);
  }
  return messages;
}

/**
 * Blocks tool calls that would cause severe, unauthorized harm. The classifier sees the proposed
 * call and the session's user messages, never assistant text or tool output, so the agent cannot
 * argue its way past the gate and injected content cannot address it. A call at or above
 * RISK_THRESHOLD is denied outright; there is no approval prompt. A classifier error is retried
 * once, then the call is allowed (fail open). With no TypeSafe key configured the gate is disabled.
 */
export function registerDangerGate(pi: ExtensionAPI, classifier: OperationClassifier): void {
  pi.on("tool_call", async (event, ctx: ExtensionEventContext): Promise<ToolCallEventResult | void> => {
    const call = gatedCall(event as ToolCallEvent, ctx.cwd);
    if (call === undefined) return;

    const context = { userMessages: userMessages(ctx), tool: call.tool, input: call.input, cwd: ctx.cwd };
    const classify = async (): Promise<DangerVerdict> => {
      try {
        return await classifier.classifyDanger(context, DANGER_GATE_TIMEOUT_MS);
      } catch {
        return { kind: "error" };
      }
    };
    let verdict = await classify();
    if (verdict.kind === "error") verdict = await classify();

    if (verdict.kind !== "classified") return;
    if (verdict.risk >= RISK_THRESHOLD) return { block: true, reason: HIGHLY_DANGEROUS_BLOCK_REASON };
  });
}
