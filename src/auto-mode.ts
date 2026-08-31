import { completeSimple } from "@oh-my-pi/pi-ai";
import type { BeforeAgentStartEvent, CustomMessagePayload, ExtensionAPI, ExtensionContext } from "./extension-types.ts";

const PROMPT_CLASSIFIER_MAX_TOKENS = 16;

export const EXPERT_GUIDANCE_CLASSIFIER_PROMPT = `Decide whether this request requires an expert decision lens. This is a high threshold: complexity alone is not enough.

Reply expert only when the stated task asks for, or necessarily requires, a material choice among plausible alternatives where a poor choice would have meaningful architectural, product, operational, security, migration, or long-term maintenance consequences.

Reply ordinary for acknowledgements, open-ended offers to help, pasted text without a task, factual questions, explanations, routine investigation or debugging, ordinary implementation, mechanical edits, exact renames, and multi-file work that does not itself require a consequential design choice.

Examples:
- "help me" -> ordinary
- "explore these files and report findings" -> ordinary
- "make the button blue" -> ordinary
- "fix this failing test" -> ordinary
- "implement this exact design" -> ordinary
- "help me design an app" -> expert
- "choose the storage architecture for this service" -> expert
- "review this authentication architecture" -> expert
- "plan a zero-downtime migration from Redis to Postgres" -> expert

Ignore conversational scaffolding and classify the substantive task. When uncertain, reply ordinary unless the prompt itself establishes meaningful consequences.
Reply with exactly one label: ordinary or expert.`;

export function parsePromptClassification(text: string): "ordinary" | "expert" | undefined {
  const normalized = text.trim().toLowerCase();
  if (normalized === "ordinary") return "ordinary";
  if (normalized === "expert") return "expert";
  return undefined;
}

export function classifierOutputNeedsExpertGuidance(text: string | undefined): boolean {
  return text !== undefined && parsePromptClassification(text) === "expert";
}

async function classifyPrompt(prompt: string, context: ExtensionContext): Promise<string | undefined> {
  const model = context.models.resolve("@tiny");
  if (!model) return undefined;
  const apiKey = await context.modelRegistry.getApiKey(model);
  if (!apiKey) return undefined;

  const response = await completeSimple(
    model,
    {
      systemPrompt: [EXPERT_GUIDANCE_CLASSIFIER_PROMPT],
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    },
    { apiKey, maxTokens: PROMPT_CLASSIFIER_MAX_TOKENS, disableReasoning: true },
  );
  if (response.stopReason === "error") return undefined;
  return response.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
}

export function registerAutoMode(
  pi: ExtensionAPI,
  expertGuidance: string,
  expertMessage: CustomMessagePayload,
): void {
  pi.on("before_agent_start", async (event, context) => {
    const startEvent = event as BeforeAgentStartEvent;
    if (startEvent.prompt.includes(expertGuidance)) return {};
    let output: string | undefined;
    try {
      output = await classifyPrompt(startEvent.prompt, context);
    } catch {
      output = undefined;
    }
    if (!classifierOutputNeedsExpertGuidance(output)) return {};
    return { message: expertMessage };
  });
}
