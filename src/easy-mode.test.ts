import { describe, expect, it } from "bun:test";
import type { ExtensionAPI, ExtensionContext, InputEvent, BeforeAgentStartEvent } from "@oh-my-pi/pi-coding-agent";
import { registerEasyMode } from "./easy-mode.ts";

function harness() {
  const handlers = new Map<string, (event: never, context: ExtensionContext) => unknown>();
  let currentModel = "original";
  let thinking = "high";
  let session = "first";
  let hasHistory = false;
  let available = true;
  let selections = 0;
  const context = {
    models: { resolve: () => available ? { id: "easy" } : undefined },
    sessionManager: {
      getSessionId: () => session,
      getBranch: () => hasHistory ? [{ type: "message", message: { role: "user" } }] : [],
    },
  } as unknown as ExtensionContext;
  registerEasyMode({
    on: (name: string, handler: (event: never, context: ExtensionContext) => unknown) => handlers.set(name, handler),
    getThinkingLevel: () => thinking,
    setThinkingLevel: (level: string) => { thinking = level; },
    setModel: async (model: { id: string }) => {
      currentModel = model.id;
      thinking = "low";
      selections++;
      return true;
    },
  } as unknown as ExtensionAPI);
  return {
    input: (text: string) => (handlers.get("input") as (event: InputEvent, context: ExtensionContext) => Promise<unknown>)({ type: "input", text, source: "interactive" }, context),
    start: (prompt: string) => (handlers.get("before_agent_start") as (event: BeforeAgentStartEvent, context: ExtensionContext) => Promise<unknown>)({ type: "before_agent_start", prompt, systemPrompt: [] }, context),
    history: () => { hasHistory = true; },
    newSession: () => { session = "second"; hasHistory = false; currentModel = "original"; },
    missingRole: () => { available = false; },
    state: () => ({ currentModel, thinking, selections }),
  };
}

describe("initial /easy modifier", () => {
  it("selects the easy role once and preserves thinking across input and CLI hooks", async () => {
    const h = harness();
    expect(await h.input("Please /easy do this")).toEqual({ text: "Please  do this" });
    await h.start("Please /easy do this");
    expect(h.state()).toEqual({ currentModel: "easy", thinking: "high", selections: 1 });
    h.newSession();
    await h.start("/easy CLI task");
    expect(h.state()).toEqual({ currentModel: "easy", thinking: "high", selections: 2 });
  });

  it("does not treat paths or longer words as modifiers, or switch a continued session", async () => {
    const h = harness();
    await h.start("Read /easy/file and /easygoing");
    expect(h.state().currentModel).toBe("original");
    h.history();
    await h.input("/easy later task");
    await h.start("/easy later task");
    expect(h.state().currentModel).toBe("original");
  });

  it("handles a bare initial modifier without sending an empty prompt", async () => {
    const h = harness();
    expect(await h.input("/easy")).toEqual({ handled: true });
    expect(h.state().currentModel).toBe("easy");
  });

  it("reports a missing role without changing the model", async () => {
    const h = harness();
    h.missingRole();
    await expect(h.input("/easy task")).rejects.toThrow("eng_mode_easy");
    expect(h.state().currentModel).toBe("original");
  });
});
