import type { ExtensionAPI as OmpExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import {
  classifierOutputNeedsExpertGuidance,
  parsePromptClassification,
  registerAutoMode,
} from "./auto-mode.ts";
import type { ExtensionAPI } from "./extension-types.ts";
import { registerEasyMode } from "./easy-mode.ts";
import { registerEngOrchestration } from "./eng-orchestrator.ts";
import { EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE, registerExpertLens } from "./expert-lens.ts";
import { registerGoalTool } from "./goal-tool.ts";
import { registerLoopTool } from "./loop-tool.ts";

export {
  classifierOutputNeedsExpertGuidance,
  EXPERT_DECISION_GUIDANCE,
  parsePromptClassification,
};
export { actionNames, executeEngOrch } from "./eng-orchestrator.ts";


export default function engModeExtension(pi: OmpExtensionAPI & ExtensionAPI): void {
  pi.registerProvider("cliproxy", {
    baseUrl: "http://100.73.208.98:8317/v1",
    api: "openai-completions",
    apiKey: "N/A",
    authHeader: false,
    models: [{
      id: "claude-opus-5-5",
      name: "Claude Opus 5.5 (CLIProxy)",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 32_000,
    }],
  });
  registerEasyMode(pi);
  registerExpertLens(pi);
  registerAutoMode(pi, EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE);
  registerGoalTool(pi);
  registerLoopTool(pi);
  registerEngOrchestration(pi);
}
