import type { ExtensionAPI } from "./extension-types.ts";

export const EASY_MODEL_ROLE = "@eng_mode_easy";

export function registerEasyMode(pi: ExtensionAPI): void {
  if (!pi.registerCommand || !pi.setModel || !pi.setThinkingLevel || !pi.sendUserMessage) return;
  const setModel = pi.setModel.bind(pi);
  const setThinkingLevel = pi.setThinkingLevel.bind(pi);
  const sendUserMessage = pi.sendUserMessage.bind(pi);

  pi.registerCommand("easy", {
    description: "Run Eng Mode with GPT 5.6 Sol at low thinking.",
    async handler(args, context): Promise<void> {
      const model = context.models.resolve(EASY_MODEL_ROLE);
      if (!model) {
        context.ui.notify(`Model role ${EASY_MODEL_ROLE} is not configured.`, "error");
        return;
      }
      if (!(await setModel(model))) {
        context.ui.notify(`Model role ${EASY_MODEL_ROLE} is unavailable.`, "error");
        return;
      }

      setThinkingLevel("low");
      const prompt = args.trim();
      if (prompt.length === 0) {
        context.ui.notify("Easy mode selected.", "info");
        return;
      }
      sendUserMessage(`/eng-mode ${prompt}`);
    },
  });
}
