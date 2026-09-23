import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "./extension-types.ts";
import type { OperationClassifier } from "./typesafe.ts";

const DANGEROUS_TOOLS: Record<string, true> = { bash: true, write: true, edit: true, eval: true };
const DANGER_GATE_TIMEOUT_MS = 5_000;

/** Used as the `block` reason surfaced to the LLM when a tool call is classified ULTRA DANGEROUS. */
export const ULTRA_DANGEROUS_BLOCK_REASON =
  "Blocked by the TypeSafe danger gate: this operation was classified ULTRA DANGEROUS. Stop and ask the user to confirm before proceeding.";

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
 * Blocks ULTRA DANGEROUS tool calls before execution. Failure posture is fail-closed when a
 * TypeSafe key is configured: a classifier error or timeout blocks the call, because an
 * unclassifiable mutation must not run silently. With no key configured the gate is disabled.
 */
export function registerDangerGate(pi: ExtensionAPI, classifier: OperationClassifier): void {
  pi.on("tool_call", async (event): Promise<ToolCallEventResult | void> => {
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
    if (verdict.level === "ultra_dangerous") {
      return { block: true, reason: ULTRA_DANGEROUS_BLOCK_REASON };
    }
    return;
  });
}