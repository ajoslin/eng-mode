import { describe, expect, it } from "bun:test";
import type { ExtensionAPI, ToolDefinition } from "./extension-types.ts";
import { registerLoopTool } from "./loop-tool.ts";

class FakeInteractiveMode {
  readonly sessionManager: { getSessionId(): string };
  loopModeEnabled = false;
  loopModePaused = false;
  loopPrompt: string | undefined;
  loopLimit:
    | { kind: "iterations"; initial: number; remaining: number }
    | { kind: "duration"; durationMs: number; deadlineMs: number }
    | undefined;
  stopCalls = 0;

  constructor(sessionId: string) {
    this.sessionManager = { getSessionId: () => sessionId };
  }

  async init(): Promise<void> {}

  stop(): void {
    this.stopCalls += 1;
  }

  async handleLoopCommand(args = ""): Promise<string | undefined> {
    if (this.loopModeEnabled) {
      this.disableLoopMode();
      return undefined;
    }
    if (!/^\d+$/.test(args)) return undefined;
    const count = Number(args);
    this.loopModeEnabled = true;
    this.loopModePaused = false;
    this.loopPrompt = undefined;
    this.loopLimit = { kind: "iterations", initial: count, remaining: count };
    return undefined;
  }

  setLoopPrompt(prompt: string): void {
    if (!this.loopModeEnabled) return;
    this.loopPrompt = prompt;
    this.loopModePaused = false;
  }

  pauseLoop(): void {
    this.loopPrompt = undefined;
    this.loopModePaused = true;
  }

  disableLoopMode(): void {
    this.loopModeEnabled = false;
    this.loopModePaused = false;
    this.loopPrompt = undefined;
    this.loopLimit = undefined;
  }
}

function register(InteractiveMode: unknown = FakeInteractiveMode): ToolDefinition {
  let tool: ToolDefinition | undefined;
  const chain = { optional: () => chain, int: () => chain, positive: () => chain, nonnegative: () => chain };
  class Text {
    constructor(readonly text: string, readonly paddingX: number, readonly paddingY: number) {}
  }
  const pi: ExtensionAPI = {
    pi: { Text, InteractiveMode },
    zod: {
      object: () => ({}),
      enum: () => chain,
      string: () => chain,
      number: () => chain,
      boolean: () => chain,
      array: () => chain,
    },
    registerTool: (definition) => { tool = definition; },
    registerMessageRenderer: () => {},
    on: () => {},
  };
  registerLoopTool(pi);
  if (!tool) throw new Error("loop tool was not registered");
  return tool;
}

const context = (sessionId: string) => ({ sessionManager: { getSessionId: () => sessionId } });

describe("loop tool", () => {
  it("controls loop state", async () => {
    const tool = register();
    const mode = new FakeInteractiveMode("session");
    await mode.init();

    await expect(tool.execute("start", { op: "start", prompt: "Check the predicate, then stop the loop.", limit: "2" }, undefined, undefined, context("session"))).resolves.toMatchObject({
      details: {
        available: true,
        enabled: true,
        state: "running",
        prompt: "Check the predicate, then stop the loop.",
        limit: { kind: "iterations", initial: 2, remaining: 2 },
      },
    });

    mode.pauseLoop();
    await expect(tool.execute("status", { op: "status" }, undefined, undefined, context("session"))).resolves.toMatchObject({
      details: { enabled: true, state: "paused", prompt: null },
    });
    await expect(tool.execute("resume", { op: "resume", prompt: "Continue checking." }, undefined, undefined, context("session"))).resolves.toMatchObject({
      details: { enabled: true, state: "running", prompt: "Continue checking." },
    });
    await expect(tool.execute("stop", { op: "stop" }, undefined, undefined, context("session"))).resolves.toMatchObject({
      details: { available: true, enabled: false },
    });

    await mode.handleLoopCommand("3");
    mode.setLoopPrompt("Operator-owned prompt");
    await expect(tool.execute("status", { op: "status" }, undefined, undefined, context("session"))).resolves.toMatchObject({
      details: { enabled: true, state: "running", prompt: "Operator-owned prompt" },
    });
  });

  it("binds the lifecycle once across extension reloads", async () => {
    const first = register();
    register();
    const mode = new FakeInteractiveMode("reload");
    await mode.init();
    await first.execute("stop", { op: "stop" }, undefined, undefined, context("reload"));
    mode.stop();
    expect(mode.stopCalls).toBe(1);
    await expect(first.execute("status", { op: "status" }, undefined, undefined, context("reload"))).resolves.toMatchObject({
      isError: true,
      details: { available: false, error: "Loop is unavailable in this session." },
    });
  });

  it("fails closed when loop control is unavailable or rejects a limit", async () => {
    const unavailable = register(null);
    await expect(unavailable.execute("status", { op: "status" }, undefined, undefined, context("session"))).resolves.toMatchObject({
      isError: true,
      details: { available: false },
    });

    const tool = register();
    const mode = new FakeInteractiveMode("invalid");
    await mode.init();
    await expect(tool.execute("start", { op: "start", prompt: "Work", limit: "bad" }, undefined, undefined, context("invalid"))).resolves.toMatchObject({
      isError: true,
      details: { available: false, error: "Loop rejected limit: bad" },
    });
    expect(mode.loopModeEnabled).toBeFalse();
  });
});
