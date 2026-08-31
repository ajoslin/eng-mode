import {
  classifierOutputNeedsExpertGuidance,
  parsePromptClassification,
  registerAutoMode,
} from "./auto-mode.ts";
import { registerEngOrchestration } from "./eng-orchestrator.ts";
import { EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE, registerExpertLens } from "./expert-lens.ts";
import type { ExtensionAPI } from "./extension-types.ts";
import { registerGoalTool } from "./goal-tool.ts";
import { registerLoopTool } from "./loop-tool.ts";

export {
  classifierOutputNeedsExpertGuidance,
  EXPERT_DECISION_GUIDANCE,
  parsePromptClassification,
};
export { actionNames, executeEngOrch } from "./eng-orchestrator.ts";

export default function engModeExtension(pi: ExtensionAPI): void {
  registerExpertLens(pi);
  registerAutoMode(pi, EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE);
  registerGoalTool(pi);
  registerLoopTool(pi);
  registerEngOrchestration(pi);
}
