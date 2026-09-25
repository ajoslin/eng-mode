import type { EventContext, ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "./extension-types.ts";
import type { OperationClassifier } from "./typesafe.ts";

const DANGEROUS_TOOLS: Record<string, true> = { bash: true, write: true, edit: true, eval: true };
const DANGER_GATE_TIMEOUT_MS = 5_000;

/** Returned to the LLM when an ULTRA DANGEROUS call cannot be confirmed (no UI: subagent, headless). */
export const ULTRA_DANGEROUS_BLOCK_REASON =
  "Blocked by the TypeSafe danger gate: this operation was classified ULTRA DANGEROUS and no user is attached to confirm it. Stop and ask the user to confirm before proceeding.";

/** Returned to the LLM when the attached user declines the confirmation dialog. */
export const ULTRA_DANGEROUS_DENIED_REASON =
  "Blocked by the TypeSafe danger gate: the user declined this ULTRA DANGEROUS operation. Do not retry it; ask the user how to proceed.";

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
 * Gates ULTRA DANGEROUS tool calls before execution. With a user attached, the user decides in a
 * confirm dialog: a chat-level "yes" cannot reach this gate, so blocking outright would re-block the
 * same command forever. Without a UI (subagents, headless) the call is blocked. Failure posture is
 * fail-closed when a TypeSafe key is configured: a classifier error or timeout blocks the call,
 * because an unclassifiable mutation must not run silently. With no key the gate is disabled.
 */
export function registerDangerGate(pi: ExtensionAPI, classifier: OperationClassifier): void {
  pi.on("tool_call", async (event, ctx?: EventContext): Promise<ToolCallEventResult | void> => {
    const toolEvent = event as ToolCallEvent;
    if (!DANGEROUS_TOOLS[toolEvent.toolName]) return;

    const operation = operationFor(toolEvent);
    if (operation === undefined) return;

    let verdict;
    try {
      verdict = await classifier.classifyDanger(operation, DANGER_GATE_TIMEOUT_MS);
    } catch {
      return {
        block: true,
        reason: "Danger classifier crashed; blocking this operation out of caution.",
      };
    }

    if (verdict.kind === "disabled") return;
    if (verdict.kind === "error") {
      return {
        block: true,
        reason:
          "Danger classifier is configured but unavailable or timed out; blocking this operation out of caution.",
      };
    }
    if (verdict.level !== "ultra_dangerous") return;
    if (ctx?.hasUI !== true) return { block: true, reason: ULTRA_DANGEROUS_BLOCK_REASON };

    const approved = await ctx.ui.confirm("Danger gate: ULTRA DANGEROUS operation", operation);

    return approved ? undefined : { block: true, reason: ULTRA_DANGEROUS_DENIED_REASON };
  });
}