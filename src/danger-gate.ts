import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionEventContext,
  ToolCallEvent,
  ToolCallEventResult,
} from "./extension-types.ts";
import type { OperationClassifier } from "./typesafe.ts";

const DANGEROUS_TOOLS: Record<string, true> = { bash: true, write: true, edit: true, eval: true };
const DANGER_GATE_TIMEOUT_MS = 5_000;

export const HIGHLY_DANGEROUS_BLOCK_REASON =
  "Blocked by the danger gate: this operation was classified highly dangerous and no user is available to approve it. Ask the user to confirm before proceeding.";
export const USER_DECLINED_REASON = "The user declined this operation at the danger gate. Do not retry it; ask the user how to proceed.";
export const CLASSIFIER_UNAVAILABLE_REASON =
  "Danger classifier is configured but unavailable or timed out, and no user is available to approve; blocking this operation.";

function operationFor(event: ToolCallEvent): string | undefined {
  const { toolName, input } = event;
  switch (toolName) {
    case "bash": {
      const command = input.command;
      return typeof command === "string" ? `bash: ${command}` : undefined;
    }
    case "write": {
      const path = input.path;
      return typeof path === "string" ? `write: ${path}` : "write";
    }
    case "edit": {
      const path = input.path;
      return typeof path === "string" ? `edit: ${path}` : "edit";
    }
    case "eval": {
      const code = input.code;
      const language = typeof input.language === "string" ? input.language : "?";
      return typeof code === "string" ? `eval(${language}): ${code}` : `eval(${language})`;
    }
    default:
      return undefined;
  }
}

/**
 * Gates highly dangerous tool calls. The classifier sees the operation, the user's latest
 * request, and the cwd. A flagged or unclassifiable call asks the user; approval is remembered
 * for the exact operation for the rest of the session. Without a UI the call is blocked.
 * With no TypeSafe key configured the gate is disabled.
 */
export function registerDangerGate(pi: ExtensionAPI, classifier: OperationClassifier): void {
  let userRequest = "";
  const approved = new Set<string>();

  pi.on("before_agent_start", (event) => {
    userRequest = (event as BeforeAgentStartEvent).prompt;
  });

  pi.on("tool_call", async (event, ctx: ExtensionEventContext): Promise<ToolCallEventResult | void> => {
    const toolEvent = event as ToolCallEvent;
    if (!DANGEROUS_TOOLS[toolEvent.toolName]) return;

    const operation = operationFor(toolEvent);
    if (operation === undefined || approved.has(operation)) return;

    let verdict;
    try {
      verdict = await classifier.classifyDanger({ operation, userRequest, cwd: ctx.cwd }, DANGER_GATE_TIMEOUT_MS);
    } catch {
      verdict = { kind: "error" } as const;
    }

    if (verdict.kind === "disabled") return;
    if (verdict.kind === "classified" && verdict.level === "safe") return;

    const flagged = verdict.kind === "classified";
    if (!ctx.hasUI) {
      return { block: true, reason: flagged ? HIGHLY_DANGEROUS_BLOCK_REASON : CLASSIFIER_UNAVAILABLE_REASON };
    }

    const title = flagged ? "Highly dangerous operation" : "Danger classifier unavailable";
    const allowed = await ctx.ui.confirm(title, `Allow the agent to run this?\n\n${operation}`);
    if (!allowed) return { block: true, reason: USER_DECLINED_REASON };
    approved.add(operation);
    return;
  });
}
