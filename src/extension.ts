import type { ExtensionAPI as OmpExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { classifierOutputNeedsExpertGuidance, registerAutoMode } from "./auto-mode.ts";
import { registerEngGithubShim } from "./eng-github-shim.ts";
import { registerGhGuard } from "./gh-guard.ts";
import { registerEngOrchestration } from "./eng-orchestrator.ts";
import { EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE, registerExpertLens } from "./expert-lens.ts";
import type { ExtensionAPI } from "./extension-types.ts";
import { registerGoalTool } from "./goal-tool.ts";
import { registerLoopTool } from "./loop-tool.ts";
import { registerSkillCommands } from "./skill-commands.ts";
import { hostedByT3Code } from "../skills/eng-github/scripts/lib/t3-host.ts";
import { makeClassifier, type ExpertClassifier } from "./typesafe.ts";

export { classifierOutputNeedsExpertGuidance, EXPERT_DECISION_GUIDANCE };
export { actionNames, executeEngOrch } from "./eng-orchestrator.ts";

export default function engModeExtension(pi: OmpExtensionAPI & ExtensionAPI, classifier?: ExpertClassifier): void {
  const expertClassifier = classifier ?? makeClassifier();
  registerExpertLens(pi);
  registerSkillCommands(pi);
  registerAutoMode(pi, EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE, expertClassifier);
  if (!hostedByT3Code()) {
    registerGhGuard(pi);
    registerEngGithubShim();
  }
  registerGoalTool(pi);
  registerLoopTool(pi);
  registerEngOrchestration(pi);
}
