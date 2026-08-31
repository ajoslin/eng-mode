import type { CustomMessagePayload, ExtensionAPI } from "./extension-types.ts";
export const EXPERT_DECISION_GUIDANCE =
  "For every decision, ask what the best expert in that field would do and why they would reject your current choice; if you can name that reason, don't make the choice. Optimize for what that expert would judge correct, never for what satisfies the stated constraints most cheaply. Every trade-off you take must be stated to the user, never absorbed.";

export const EXPERT_DECISION_MESSAGE: CustomMessagePayload = {
  customType: "eng-mode-expert-decision-guidance",
  content: EXPERT_DECISION_GUIDANCE,
  display: true,
  attribution: "agent",
};
export function registerExpertLens(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(
    "eng-mode-expert-decision-guidance",
    (_message, _options, theme) => new pi.pi.Text(`${theme.fg("accent", "◆")} ${theme.fg("dim", "Expert lens")}`, 0, 0),
  );
}
