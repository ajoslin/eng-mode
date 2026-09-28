import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionEventContext,
  ToolCallEvent,
  ToolCallEventResult,
} from "./extension-types.ts";
import type { DangerVerdict, OperationClassifier } from "./typesafe.ts";

const DANGEROUS_TOOLS: Record<string, true> = { bash: true, write: true, edit: true, eval: true };
const DANGER_GATE_TIMEOUT_MS = 5_000;

export const HIGHLY_DANGEROUS_BLOCK_REASON =
  "Blocked by the danger gate: this operation was classified highly dangerous. Do not retry it or work around it; ask the user to run it themselves or confirm another approach.";

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
 * Blocks highly dangerous tool calls. The classifier sees the operation, the user's latest
 * request, and the cwd. A flagged call is denied outright; there is no approval prompt. A
 * classifier error is retried once, then the call is allowed (fail open). With no TypeSafe key
 * configured the gate is disabled.
 */
export function registerDangerGate(pi: ExtensionAPI, classifier: OperationClassifier): void {
  let userRequest = "";

  pi.on("before_agent_start", (event) => {
    userRequest = (event as BeforeAgentStartEvent).prompt;
  });

  pi.on("tool_call", async (event, ctx: ExtensionEventContext): Promise<ToolCallEventResult | void> => {
    const toolEvent = event as ToolCallEvent;
    if (!DANGEROUS_TOOLS[toolEvent.toolName]) return;

    const operation = operationFor(toolEvent);
    if (operation === undefined) return;

    const classify = async (): Promise<DangerVerdict> => {
      try {
        return await classifier.classifyDanger({ operation, userRequest, cwd: ctx.cwd }, DANGER_GATE_TIMEOUT_MS);
      } catch {
        return { kind: "error" };
      }
    };
    let verdict = await classify();
    if (verdict.kind === "error") verdict = await classify();

    if (verdict.kind !== "classified") return;
    if (verdict.level === "highly_dangerous") return { block: true, reason: HIGHLY_DANGEROUS_BLOCK_REASON };
  });
}
