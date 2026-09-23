import type { ExtensionAPI as OmpExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { classifierOutputNeedsExpertGuidance, registerAutoMode } from "./auto-mode.ts";
import { registerDangerGate } from "./danger-gate.ts";
import { registerEngOrchestration } from "./eng-orchestrator.ts";
import { EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE, registerExpertLens } from "./expert-lens.ts";
import type { ExtensionAPI } from "./extension-types.ts";
import { registerGoalTool } from "./goal-tool.ts";
import { registerLoopTool } from "./loop-tool.ts";
import { makeClassifier, type OperationClassifier } from "./typesafe.ts";

export { classifierOutputNeedsExpertGuidance, EXPERT_DECISION_GUIDANCE };
export { actionNames, executeEngOrch } from "./eng-orchestrator.ts";

export default function engModeExtension(pi: OmpExtensionAPI & ExtensionAPI, classifier?: OperationClassifier): void {
  const gate = classifier ?? makeClassifier();
  registerExpertLens(pi);
  registerAutoMode(pi, EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE, gate);
  registerDangerGate(pi, gate);
  registerGoalTool(pi);
  registerLoopTool(pi);
  registerEngOrchestration(pi);
}
