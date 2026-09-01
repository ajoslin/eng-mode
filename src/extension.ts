import { resolve } from "node:path";
import type { ExtensionAPI as OmpExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import {
  classifierOutputNeedsExpertGuidance,
  parsePromptClassification,
  registerAutoMode,
} from "./auto-mode.ts";
import { registerEngAdvisor } from "./advisor/index.ts";
import { installAgentSkills } from "./eng-agent-skills.ts";
import type { ExtensionAPI } from "./extension-types.ts";
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

function installJudgmentSkillOverlay(): void {
  queueMicrotask(() => {
    void installAgentSkills({ pluginRoot: resolve(import.meta.dir, "..") }).catch(() => {});
  });
}

export default function engModeExtension(pi: OmpExtensionAPI & ExtensionAPI): void {
  installJudgmentSkillOverlay();
  registerEngAdvisor(pi);
  registerExpertLens(pi);
  registerAutoMode(pi, EXPERT_DECISION_GUIDANCE, EXPERT_DECISION_MESSAGE);
  registerGoalTool(pi);
  registerLoopTool(pi);
  registerEngOrchestration(pi);
}
