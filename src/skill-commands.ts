import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CustomMessagePayload, ExtensionAPI } from "./extension-types.ts";
import { skillNames } from "./manifest.ts";

export function registerSkillCommands(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event: unknown): Promise<{ message?: CustomMessagePayload }> => {
    if (typeof event !== "object" || event === null || !("prompt" in event) || typeof event.prompt !== "string") return {};
    const invocation = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(event.prompt.trimStart());
    const name = skillNames.find((name) => name === invocation?.[1]);
    if (!name) return {};
    const directory = resolve(import.meta.dir, "../skills", name);
    const body = (await readFile(resolve(directory, "SKILL.md"), "utf8")).replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
    const args = invocation?.[2]?.trim();
    return {
      message: {
        customType: "eng-mode-skill-invocation",
        content: `[IMPORTANT: User invoked the "${name}" skill; follow its instructions. Full skill below.]\n\n${body}\n\n---\n\n[Skill directory: ${directory}]\nResolve relative paths in this skill (e.g. \`scripts/foo.js\`, \`templates/config.yaml\`) against this absolute directory; read referenced assets and templates; run scripts with the terminal tool when skill instructions call for it.${args ? `\nUser: ${args}` : ""}`,
        display: false,
        attribution: "user",
      },
    };
  });
}
