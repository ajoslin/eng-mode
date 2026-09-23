import type { BeforeAgentStartEvent, CustomMessagePayload, ExtensionAPI } from "./extension-types.ts";
import type { ExpertLens, OperationClassifier } from "./typesafe.ts";

const PROMPT_CLASSIFIER_TIMEOUT_MS = 5_000;

/** An expert-lens classification requires guidance only when it is `expert`. */
export function classifierOutputNeedsExpertGuidance(lens: ExpertLens | undefined): boolean {
  return lens === "expert";
}

/**
 * Classifies each prompt's expert-lens need via the supplied classifier and, when the
 * lens is `expert`, injects the expert-decision guidance message for this turn.
 */
export function registerAutoMode(
  pi: ExtensionAPI,
  expertGuidance: string,
  expertMessage: CustomMessagePayload,
  classifier: OperationClassifier,
  classifierTimeoutMs = PROMPT_CLASSIFIER_TIMEOUT_MS,
): void {
  pi.on("before_agent_start", async (event) => {
    const startEvent = event as BeforeAgentStartEvent;
    if (startEvent.prompt.includes(expertGuidance)) return {};
    let lens: ExpertLens | undefined;
    try {
      const verdict = await classifier.classifyExpert(startEvent.prompt, classifierTimeoutMs);
      lens = verdict.kind === "classified" ? verdict.lens : undefined;
    } catch {
      lens = undefined;
    }
    if (!classifierOutputNeedsExpertGuidance(lens)) return {};
    return { message: expertMessage };
  });
}