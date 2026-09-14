import { describe, expect, it } from "bun:test";
import {
  CHEAP_MODEL_ROLE,
  EXPERT_MODEL_ROLE,
  ESCALATION_STEER_TYPE,
  HANDOFF_STEER_TYPE,
  isGateCommand,
  registerEscalation,
} from "./escalation.ts";
import type {
  ExtensionAPI,
  ExtensionContext,
  InputEventResult,
  ToolContext,
  ToolDefinition,
  ToolResultEvent,
} from "./extension-types.ts";

type InputHandler = (event: { text: string }, context: ExtensionContext) => Promise<InputEventResult | void>;
type ToolResultHandler = (event: ToolResultEvent) => void;
type SessionStartHandler = (event: unknown, context: ExtensionContext) => void;
const text = (value: string) => ({ content: [{ type: "text", text: value }] });
const STEER = `message:${ESCALATION_STEER_TYPE}:steer`;
const HANDOFF_STEER = `message:${HANDOFF_STEER_TYPE}:steer`;

function setup(
  options: { resolve?: boolean; activate?: boolean; compactError?: string; contextTokens?: number } = {},
) {
  const events: string[] = [];
  const timers: Array<() => unknown> = [];
  let inputHandler: InputHandler | undefined;
  let toolResultHandler: ToolResultHandler | undefined;
  let sessionStart: SessionStartHandler | undefined;
  const tools = new Map<string, ToolDefinition>();
  const model = {};
  const pi = {
    zod: { object: (shape: unknown) => shape, string: () => ({ describe: () => ({}) }) },
    pi: { Text: class {} },
    registerMessageRenderer: () => {},
    on: (event: string, value: unknown) => {
      if (event === "input") inputHandler = value as InputHandler;
      if (event === "tool_result") toolResultHandler = value as ToolResultHandler;
      if (event === "session_start") sessionStart = value as SessionStartHandler;
    },
    registerTool: (definition: ToolDefinition) => tools.set(definition.name, definition),
    setModel: async () => {
      events.push("setModel");
      return options.activate ?? true;
    },
    setThinkingLevel: (level: string) => events.push(`thinking:${level}`),
    sendUserMessage: (prompt: string) => events.push(`prompt:${prompt}`),
    sendMessage: (message: { customType: string }, sendOptions: { deliverAs?: string }) =>
      events.push(`message:${message.customType}:${sendOptions.deliverAs}`),
  } as unknown as ExtensionAPI;
  let streaming = true;
  const context = {
    models: {
      resolve: (role: string) => {
        events.push(`resolve:${role}`);
        return options.resolve === false ? undefined : model;
      },
    },
    ui: { notify: (message: string, type?: string) => events.push(`notify:${type}:${message}`) },
    compact: async (focus: string) => {
      events.push(`compact:${focus}`);
      if (options.compactError) throw new Error(options.compactError);
    },
    setTimeout: (callback: () => void) => timers.push(callback),
    abort: () => {
      events.push("abort");
      streaming = false;
    },
    isIdle: () => !streaming,
    getContextUsage: () => ({ tokens: options.contextTokens ?? 30_000 }),
  } as unknown as ToolContext & ExtensionContext;
  registerEscalation(pi);
  async function run(name: string, input: Record<string, unknown>): Promise<unknown> {
    streaming = true;
    const result = await tools.get(name)?.execute("call", input, undefined, undefined, context);
    while (timers.length > 0) for (const timer of timers.splice(0)) await timer();
    return result;
  }
  const handoff = () => run("handoff", { brief: "edit src/x.ts and run bun test" });
  const escalate = () => run("escalate", { reason: "concurrency bug", evidence: "two failed bun test runs" });
  function gate(failed: boolean, command = "bun test ./src/x.test.ts"): void {
    toolResultHandler?.({ toolName: "bash", input: { command }, isError: false, details: { exitCode: failed ? 1 : 0 } });
  }
  function call(toolName: string, input: Record<string, unknown> = {}): void {
    toolResultHandler?.({ toolName, input, isError: false });
  }
  function startSession(current: string | undefined): void {
    sessionStart?.({}, {
      ...context,
      models: {
        resolve: (role: string) => ({ provider: "p", id: role }),
        current: () => (current === undefined ? undefined : { provider: "p", id: current }),
      },
    } as unknown as ExtensionContext);
  }
  return { events, inputHandler, context, handoff, escalate, gate, call, startSession };
}

describe("session start tier", () => {
  it("adopts the cheap tier when the session already runs the cheap model", async () => {
    const state = setup();
    state.startSession(CHEAP_MODEL_ROLE);
    await expect(state.handoff()).resolves.toEqual(text("already on the execution tier"));
    await expect(state.escalate()).resolves.toEqual(text(expect.stringContaining("Escalating")));
  });

  it("defaults to the expert tier for any other model", async () => {
    const state = setup();
    state.startSession("something-else");
    await expect(state.escalate()).resolves.toEqual(text("already on the expert tier"));
    state.startSession(undefined);
    await expect(state.escalate()).resolves.toEqual(text("already on the expert tier"));
  });
});

describe("escalation", () => {
  it("classifies gate commands", () => {
    expect(isGateCommand("bun test ./src/x.test.ts")).toBeTrue();
    expect(isGateCommand("bunx tsgo -p tsconfig.json")).toBeTrue();
    expect(isGateCommand("bun run check")).toBeTrue();
    expect(isGateCommand("bun run build")).toBeFalse();
    expect(isGateCommand("git status")).toBeFalse();
  });

  it("starts Eng Mode on the expert tier at low thinking", async () => {
    const state = setup();
    await expect(state.inputHandler?.({ text: "/eng-mode build the page" }, state.context)).resolves.toBeUndefined();
    expect(state.events).toEqual([`resolve:${EXPERT_MODEL_ROLE}`, "setModel", "thinking:low"]);
  });

  it("handles the prompt when the expert role is missing", async () => {
    const state = setup({ resolve: false });
    await expect(state.inputHandler?.({ text: "/eng-mode build" }, state.context)).resolves.toEqual({ handled: true });
  });

  it("hands off below the size gate: aborts the turn and switches without compacting", async () => {
    const state = setup();
    const result = await state.handoff();
    expect(result).toEqual(text(expect.stringContaining("Handing off")));
    expect(state.events).toEqual([
      "abort",
      `resolve:${CHEAP_MODEL_ROLE}`,
      "setModel",
      "thinking:medium",
      expect.stringMatching(/^prompt:.*Brief: edit src\/x\.ts.*escalate/s),
    ]);
  });

  it("hands off above the size gate: compacts with the brief first", async () => {
    const state = setup({ contextTokens: 120_000 });
    await state.handoff();
    expect(state.events).toEqual([
      expect.stringMatching(/^compact:.*edit src\/x\.ts/s),
      `resolve:${CHEAP_MODEL_ROLE}`,
      "setModel",
      "thinking:medium",
      expect.stringMatching(/^prompt:.*Brief: edit src\/x\.ts/s),
    ]);
  });

  it("escalates after a handoff and then refuses a second handoff", async () => {
    const state = setup();
    await state.handoff();
    state.events.length = 0;
    const result = await state.escalate();
    expect(result).toEqual(text(expect.stringContaining("Escalating")));
    expect(state.events).toEqual([
      expect.stringMatching(/^compact:.*concurrency bug.*two failed bun test runs/s),
      `resolve:${EXPERT_MODEL_ROLE}`,
      "setModel",
      "thinking:low",
      expect.stringMatching(/^prompt:.*Reason: concurrency bug.*Evidence: two failed bun test runs/s),
    ]);
    state.events.length = 0;
    await expect(state.handoff()).resolves.toEqual(text(expect.stringContaining("refused")));
    await expect(state.escalate()).resolves.toEqual(text("already on the expert tier"));
    expect(state.events).toEqual([]);
  });

  it("refuses escalate on the expert tier and handoff on the cheap tier without side effects", async () => {
    const state = setup();
    await expect(state.escalate()).resolves.toEqual(text("already on the expert tier"));
    expect(state.events).toEqual([]);
    await state.handoff();
    state.events.length = 0;
    await expect(state.handoff()).resolves.toEqual(text("already on the execution tier"));
    expect(state.events).toEqual([]);
  });

  it("still restarts when there is nothing to compact", async () => {
    const state = setup({ compactError: "Nothing to compact (session too small)" });
    await state.handoff();
    await state.escalate();
    expect(state.events).toContainEqual(expect.stringContaining("compact:"));
    expect(state.events).toContainEqual(expect.stringMatching(/^prompt:.*expert tier/));
    expect(state.events).not.toContainEqual(expect.stringContaining("notify:"));
  });

  it("skips compaction when the session is below the keep-recent floor", async () => {
    const state = setup({ contextTokens: 5_000 });
    await state.handoff();
    await state.escalate();
    expect(state.events).not.toContainEqual(expect.stringContaining("compact:"));
    expect(state.events).toContainEqual(expect.stringMatching(/^prompt:.*expert tier/));
  });

  it("reverts the tier when the target model is unavailable so a retry is possible", async () => {
    const state = setup({ activate: false });
    await state.handoff();
    expect(state.events).not.toContainEqual(expect.stringContaining("prompt:"));
    state.events.length = 0;
    await expect(state.handoff()).resolves.not.toEqual(text("already on the execution tier"));
  });

  it("steers once after two consecutive gate failures on the cheap tier and resets on success", async () => {
    const state = setup();
    state.gate(true);
    state.gate(true);
    expect(state.events).toEqual([]);
    await state.handoff();
    state.events.length = 0;
    state.gate(true);
    expect(state.events).toEqual([]);
    state.gate(true);
    expect(state.events).toEqual([STEER]);
    state.gate(true);
    expect(state.events).toEqual([STEER]);
    state.gate(false);
    state.gate(true);
    state.gate(true, "git status");
    expect(state.events).toEqual([STEER]);
    state.gate(true);
    expect(state.events).toEqual([STEER, STEER]);
  });

  it("steers the expert tier once at the exploration threshold unless it already edited", async () => {
    const state = setup();
    for (let i = 0; i < 29; i++) state.call("read", { path: "src/x.ts" });
    expect(state.events).toEqual([]);
    state.call("read", { path: "src/x.ts" });
    expect(state.events).toEqual([HANDOFF_STEER]);
    for (let i = 0; i < 40; i++) state.call("grep");
    expect(state.events).toEqual([HANDOFF_STEER]);

    const edited = setup();
    for (let i = 0; i < 10; i++) edited.call("read", { path: "src/x.ts" });
    edited.call("write", { path: "xd://checkpoint" });
    edited.call("edit", { input: "[src/x.ts#0000]" });
    for (let i = 0; i < 40; i++) edited.call("read", { path: "src/x.ts" });
    expect(edited.events).toEqual([]);
  });

  it("does not steer for handoff on the cheap tier or after an escalation", async () => {
    const state = setup();
    await state.handoff();
    state.events.length = 0;
    for (let i = 0; i < 40; i++) state.call("read", { path: "src/x.ts" });
    expect(state.events).toEqual([]);
    await state.escalate();
    state.events.length = 0;
    for (let i = 0; i < 40; i++) state.call("read", { path: "src/x.ts" });
    expect(state.events).toEqual([]);
  });
});
