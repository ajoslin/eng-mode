import * as path from "node:path";
import type { ExtensionAPI as OmpExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { getModelMatchPreferences, resolveModelRoleValue } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { buildSkillPromptMessage } from "@oh-my-pi/pi-coding-agent/extensibility/skills";
import { SKILL_PROMPT_MESSAGE_TYPE } from "@oh-my-pi/pi-coding-agent/session/messages";
import { AUTO_THINKING } from "@oh-my-pi/pi-coding-agent/thinking";
import { ENG_MODE_ENTERED_TYPE } from "./eng-mode-state.ts";

/** Workstation role that `/eng-mode` switches the session onto; configured under `modelRoles`. */
export const ENG_MODE_ROLE = "eng_mode";
export const ENG_MODE_ROLE_ALIAS = `@${ENG_MODE_ROLE}`;

/** `pi` carries the host's live `settings` singleton; a deep import would load an uninitialized copy. */
export type EngModeCommandAPI = Pick<
  OmpExtensionAPI,
  "pi" | "appendEntry" | "registerCommand" | "sendMessage" | "setModel" | "setThinkingLevel"
>;

/**
 * Switch the session to `@eng_mode`, mark the session as in Eng Mode (which
 * arms the expert lens), and inject the Eng Mode skill as a user invocation.
 * The skill is hidden from model invocation; this command is the only entry
 * point, so the cheaper default model handles everything else.
 */
export function registerEngModeCommand(pi: EngModeCommandAPI, extensionRoot: string): void {
  const skillPath = path.join(extensionRoot, "skills", "eng-mode", "SKILL.md");
  pi.registerCommand("eng-mode", {
    description: `Enter Eng Mode: switch to the ${ENG_MODE_ROLE_ALIAS} model role and load the eng-mode skill`,
    handler: async (args, ctx) => {
      const switched = await switchToEngModeModel(pi, ctx);
      pi.appendEntry(ENG_MODE_ENTERED_TYPE);
      const built = await buildSkillPromptMessage(
        { name: "eng-mode", filePath: skillPath, baseDir: path.dirname(skillPath) },
        args,
        "user",
      );
      pi.sendMessage(
        {
          customType: SKILL_PROMPT_MESSAGE_TYPE,
          content: built.message,
          display: true,
          details: built.details,
          attribution: "user",
        },
        { triggerTurn: true },
      );
      if (switched) ctx.ui.notify(`Eng Mode on ${switched}`, "info");
    },
  });
}

async function switchToEngModeModel(pi: EngModeCommandAPI, ctx: ExtensionCommandContext): Promise<string | undefined> {
  const settings = pi.pi.settings;
  const resolved = resolveModelRoleValue(ENG_MODE_ROLE_ALIAS, ctx.models.list(), {
    settings,
    matchPreferences: getModelMatchPreferences(settings),
  });
  if (!resolved.model) {
    ctx.ui.notify(
      `modelRoles.${ENG_MODE_ROLE} is unset or unavailable; staying on ${ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "the current model"}`,
      "warning",
    );
    return undefined;
  }
  const label = `${resolved.model.provider}/${resolved.model.id}`;
  if (!(await pi.setModel(resolved.model))) {
    ctx.ui.notify(`No credentials for ${label}; staying on the current model`, "warning");
    return undefined;
  }
  if (resolved.explicitThinkingLevel && resolved.thinkingLevel !== undefined && resolved.thinkingLevel !== AUTO_THINKING) {
    pi.setThinkingLevel(resolved.thinkingLevel);
  }
  return resolved.thinkingLevel === undefined ? label : `${label}:${resolved.thinkingLevel}`;
}
