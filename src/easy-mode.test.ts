import { describe, expect, it } from "bun:test";
import { EASY_MODEL_ROLE, registerEasyMode, stripEasyModifier } from "./easy-mode.ts";
import type { ExtensionAPI, ExtensionContext, InputEventResult } from "./extension-types.ts";

describe("easy mode", () => {
  function setup(options: { resolve?: boolean; activate?: boolean } = {}) {
    let handler: ((args: string, context: ExtensionContext) => Promise<void>) | undefined;
    let inputHandler: ((event: { text: string }, context: ExtensionContext) => Promise<InputEventResult | void>) | undefined;
    const events: string[] = [];
    const model = {} as NonNullable<Parameters<typeof registerEasyMode>[0]["setModel"]> extends (model: infer T) => Promise<boolean> ? T : never;
    const pi = {
      on: (event: string, value: typeof inputHandler) => {
        if (event === "input") inputHandler = value;
      },
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
    return { events, handler, inputHandler, context };
  }

  it("recognizes /easy only as an Eng Mode standalone modifier", () => {
    expect(stripEasyModifier("/eng-mode build the page /easy")).toBe("/eng-mode build the page");
    expect(stripEasyModifier("/easy /eng-mode build the page")).toBe("/eng-mode build the page");
    expect(stripEasyModifier("build the page /easy")).toBeUndefined();
    expect(stripEasyModifier("/eng-mode build /easy-mode")).toBeUndefined();
  });

  it("switches model before submitting an Eng Mode prompt with /easy", async () => {
    const state = setup();
    await expect(state.inputHandler?.({ text: "/eng-mode build the page /easy" }, state.context)).resolves.toEqual({
      text: "/eng-mode build the page",
    });
    expect(state.events).toContain(`resolve:${EASY_MODEL_ROLE}`);
    expect(state.events).toContain("thinking:low");
  });

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
