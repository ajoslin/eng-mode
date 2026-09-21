import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

const easyToken = /(^|\s)\/easy(?=\s|$)/;

export function registerEasyMode(pi: ExtensionAPI): void {
  let selectedSession: string | undefined;

  async function selectEasyModel(text: string, context: ExtensionContext): Promise<boolean> {
    if (!easyToken.test(text)) return false;
    const session = context.sessionManager.getSessionId();
    if (selectedSession === session || context.sessionManager.getBranch().some(
      (entry) => entry.type === "message" && entry.message.role === "user",
    )) return false;

    const model = context.models.resolve("@eng_mode_easy");
    if (!model) throw new Error("/easy requires a configured eng_mode_easy model role.");
    const thinking = pi.getThinkingLevel();
    if (!await pi.setModel(model)) throw new Error("/easy could not select eng_mode_easy: no API key available.");
    if (thinking !== undefined) pi.setThinkingLevel(thinking);
    selectedSession = session;
    return true;
  }

  pi.on("input", async (event, context) => {
    if (event.source === "extension" || !await selectEasyModel(event.text, context)) return;
    const text = event.text.replace(/(^|\s)\/easy(?=\s|$)/g, "$1").trim();
    return text ? { text } : { handled: true };
  });

  pi.on("before_agent_start", async (event, context) => {
    await selectEasyModel(event.prompt, context);
  });
}
