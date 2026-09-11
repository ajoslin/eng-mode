import { describe, expect, it } from "bun:test";
import { EASY_MODEL_ROLE, registerEasyMode } from "./easy-mode.ts";
import type { ExtensionAPI, ExtensionContext } from "./extension-types.ts";

describe("easy mode", () => {
  function setup(options: { resolve?: boolean; activate?: boolean } = {}) {
    let handler: ((args: string, context: ExtensionContext) => Promise<void>) | undefined;
    const events: string[] = [];
    const model = {} as NonNullable<Parameters<typeof registerEasyMode>[0]["setModel"]> extends (model: infer T) => Promise<boolean> ? T : never;
    const pi = {
      registerCommand: (name: string, command: { handler: typeof handler }) => {
        events.push(`command:${name}`);
        handler = command.handler;
      },
      setModel: async () => options.activate ?? true,
      setThinkingLevel: (level: "low") => events.push(`thinking:${level}`),
      sendUserMessage: (prompt: string) => events.push(`prompt:${prompt}`),
    } as unknown as ExtensionAPI;
    const context = {
      models: { resolve: (role: string) => {
        events.push(`resolve:${role}`);
        return options.resolve === false ? undefined : model;
      } },
      ui: { notify: (message: string, type?: string) => events.push(`notify:${type}:${message}`) },
    } as unknown as ExtensionContext;
    registerEasyMode(pi);
    return { events, handler, context };
  }

  it("selects the easy role at low thinking and starts Eng Mode", async () => {
    const state = setup();
    await state.handler?.(" build the settings page ", state.context);
    expect(state.events).toEqual([
      "command:easy",
      `resolve:${EASY_MODEL_ROLE}`,
      "thinking:low",
      "prompt:/eng-mode build the settings page",
    ]);
  });

  it("selects without starting a turn when no task is provided", async () => {
    const state = setup();
    await state.handler?.(" ", state.context);
    expect(state.events).toContain("thinking:low");
    expect(state.events).not.toContainEqual(expect.stringContaining("prompt:"));
  });

  it("does not submit when the role is missing or activation fails", async () => {
    for (const options of [{ resolve: false }, { activate: false }]) {
      const state = setup(options);
      await state.handler?.("work", state.context);
      expect(state.events).not.toContainEqual(expect.stringContaining("prompt:"));
      expect(state.events).not.toContain("thinking:low");
    }
  });
});
