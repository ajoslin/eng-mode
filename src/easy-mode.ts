import type { ExtensionAPI } from "./extension-types.ts";

export const EASY_MODEL_ROLE = "@eng_mode_easy";

const EASY_WORD = /(^|\s)\/easy(?=\s|$)/;

export function stripEasyModifier(prompt: string): string | undefined {
  if (!prompt.includes("/eng-mode") || !EASY_WORD.test(prompt)) return undefined;
  return prompt.replace(EASY_WORD, "$1").replace(/\s+/g, " ").trim();
}

export function registerEasyMode(pi: ExtensionAPI): void {
  if (!pi.registerCommand || !pi.setModel || !pi.setThinkingLevel || !pi.sendUserMessage) return;
  const setModel = pi.setModel.bind(pi);
  const setThinkingLevel = pi.setThinkingLevel.bind(pi);
  const sendUserMessage = pi.sendUserMessage.bind(pi);

  pi.on("input", async (event, context) => {
    const prompt = stripEasyModifier(event.text);
    if (prompt === undefined) return;
    const model = context.models.resolve(EASY_MODEL_ROLE);
    if (!model) {
      context.ui.notify(`Model role ${EASY_MODEL_ROLE} is not configured.`, "error");
      return { handled: true };
    }
    if (!(await setModel(model))) {
      context.ui.notify(`Model role ${EASY_MODEL_ROLE} is unavailable.`, "error");
      return { handled: true };
    }
    setThinkingLevel("low");
    return { text: prompt };
  });

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
