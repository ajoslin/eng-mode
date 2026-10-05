import type { BeforeAgentStartEvent, CustomMessagePayload, ExtensionAPI, SessionEntryView } from "./extension-types.ts";
import type { ExpertLens, OperationClassifier } from "./typesafe.ts";

const PROMPT_CLASSIFIER_TIMEOUT_MS = 5_000;
const EXPERT_GUIDANCE_COOLDOWN_TOKENS = 50_000;

function isBeforeAgentStartEvent(event: unknown): event is BeforeAgentStartEvent {
  return typeof event === "object" && event !== null && "prompt" in event && typeof event.prompt === "string";
}

function expertGuidanceEligible(
  branch: readonly SessionEntryView[],
  expertGuidance: string,
  customType: string,
): boolean {
  let tokens = 0;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (!entry) continue;
    if (entry.type === "compaction" || entry.type === "reset_boundary") return true;
    if (entry.type === "custom_message" && entry.customType === customType) {
      return tokens >= EXPERT_GUIDANCE_COOLDOWN_TOKENS;
    }
    if (entry.type !== "message") continue;
    if (entry.message?.role === "user") {
      const content = entry.message.content;
      let text = typeof content === "string" ? content : "";
      if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === "object" && part !== null && "type" in part && part.type === "text" &&
            "text" in part && typeof part.text === "string") {
            text += `${text ? "\n" : ""}${part.text}`;
          }
        }
      }
      if (text.includes(expertGuidance)) return tokens >= EXPERT_GUIDANCE_COOLDOWN_TOKENS;
    }
    if (entry.message?.role !== "assistant") continue;
    const input = entry.message.usage?.input;
    const output = entry.message.usage?.output;
    if (typeof input === "number" && Number.isFinite(input) && input >= 0) tokens += input;
    if (typeof output === "number" && Number.isFinite(output) && output >= 0) tokens += output;
  }
  return true;
}

/** An expert-lens classification requires guidance only when it is `expert`. */
export function classifierOutputNeedsExpertGuidance(lens: ExpertLens | undefined): boolean {
  return lens === "expert";
}

export function registerAutoMode(
  pi: ExtensionAPI,
  expertGuidance: string,
  expertMessage: CustomMessagePayload,
  classifier: OperationClassifier,
  classifierTimeoutMs = PROMPT_CLASSIFIER_TIMEOUT_MS,
): void {
  pi.on("before_agent_start", async (event, ctx) => {
    if (!isBeforeAgentStartEvent(event) || event.prompt.includes(expertGuidance)) return {};
    if (!expertGuidanceEligible(ctx.sessionManager?.getBranch() ?? [], expertGuidance, expertMessage.customType)) return {};
    let lens: ExpertLens | undefined;
    try {
      const verdict = await classifier.classifyExpert(event.prompt, classifierTimeoutMs);
      lens = verdict.kind === "classified" ? verdict.lens : undefined;
    } catch {
      lens = undefined;
    }
    if (!classifierOutputNeedsExpertGuidance(lens)) return {};
    return { message: expertMessage };
  });
}