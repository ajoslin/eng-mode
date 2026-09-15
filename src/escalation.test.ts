import { describe, expect, it } from "bun:test";
import {
  CHEAP_MODEL_ROLE,
  EXPERT_MODEL_ROLE,
  ESCALATION_STEER_TYPE,
  EXPLORATION_STEER_TYPE,
  isGateCommand,
  registerEscalation,
  stripEasyModifier,
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
const EXPLORATION_STEER = `message:${EXPLORATION_STEER_TYPE}:steer`;

function setup(
  options: { resolve?: boolean; activate?: boolean | boolean[]; compactError?: string; contextTokens?: number } = {},
) {
  const events: string[] = [];
  const timers: Array<() => unknown> = [];
  let inputHandler: InputHandler | undefined;
  let toolResultHandler: ToolResultHandler | undefined;
  let easyCommand: ((args: string, context: ExtensionContext) => Promise<void>) | undefined;
  let sessionStart: SessionStartHandler | undefined;
  let sessionSwitch: SessionStartHandler | undefined;
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
      if (event === "session_switch") sessionSwitch = value as SessionStartHandler;
    },
    registerTool: (definition: ToolDefinition) => tools.set(definition.name, definition),
    registerCommand: (name: string, command: { handler: (args: string, context: ExtensionContext) => Promise<void> }) => {
      if (name === "easy") easyCommand = command.handler;
    },
    setModel: async () => {
      events.push("setModel");
      if (Array.isArray(options.activate)) return options.activate.shift() ?? true;
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
  const escalate = (evidence = "bun test ./src/x.test.ts\nFAIL expected true, received false") =>
    run("escalate", { reason: "the attempted fix still fails its regression test", evidence });
  const stuck = () => {
    gate(true);
    gate(true);
  };
  function gate(failed: boolean, command = "bun test ./src/x.test.ts"): void {
    toolResultHandler?.({
      toolName: "bash",
      input: { command },
      content: failed
        ? [{ type: "text", text: "FAIL expected true, received false\n1 test failed\nRan 2 tests in 20ms" }]
        : [{ type: "text", text: "1 pass" }],
      isError: false,
      details: { exitCode: failed ? 1 : 0 },
    });
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
  function switchSession(current: string | undefined): void {
    sessionSwitch?.({}, {
      ...context,
      models: {
        resolve: (role: string) => ({ provider: "p", id: role }),
        current: () => (current === undefined ? undefined : { provider: "p", id: current }),
      },
    } as unknown as ExtensionContext);
  }
  return { events, inputHandler, easyCommand, context, handoff, escalate, stuck, gate, call, startSession, switchSession };
}

describe("session start tier", () => {
  it("adopts the cheap tier when the session already runs the cheap model", async () => {
    const state = setup();
    state.startSession(CHEAP_MODEL_ROLE);
    await expect(state.handoff()).resolves.toEqual(text("already on the execution tier"));
    state.stuck();
    await expect(state.escalate()).resolves.toEqual(text(expect.stringContaining("Escalating")));
  });

  it("defaults to the expert tier for any other model", async () => {
    const state = setup();
    state.startSession("something-else");
    await expect(state.escalate()).resolves.toEqual(text("already on the expert tier"));
    state.startSession(undefined);
    await expect(state.escalate()).resolves.toEqual(text("already on the expert tier"));
  });
  it("resets routing state when a new session starts or switches", async () => {
    const state = setup();
    await state.easyCommand?.("", state.context);
    state.switchSession(EXPERT_MODEL_ROLE);
    await expect(state.escalate()).resolves.toEqual(text("already on the expert tier"));
    await expect(state.handoff()).resolves.toEqual(text(expect.stringContaining("Handing off")));

    state.startSession(EXPERT_MODEL_ROLE);
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

  it("strips only a boundary easy modifier and preserves prompt formatting", () => {
    expect(stripEasyModifier("/eng-mode first line\n\n- second line /easy")).toBe("/eng-mode first line\n\n- second line");
    expect(stripEasyModifier("/easy /eng-mode first line\n  second line")).toBe("/eng-mode first line\n  second line");
    expect(stripEasyModifier("document /eng-mode and /easy")).toBeUndefined();
    expect(stripEasyModifier("/eng-mode-help /easy")).toBeUndefined();
    expect(stripEasyModifier("/eng-mode explain /easy here")).toBeUndefined();
  });

  it("starts Eng Mode on the expert tier at low thinking", async () => {
    const state = setup();
    await expect(state.inputHandler?.({ text: "/eng-mode build the page" }, state.context)).resolves.toBeUndefined();
    expect(state.events).toEqual([`resolve:${EXPERT_MODEL_ROLE}`, "setModel", "thinking:low"]);
  });

  it("pins the session to the execution tier with the /easy modifier", async () => {
    const state = setup();
    await expect(state.inputHandler?.({ text: "/eng-mode build the page /easy" }, state.context)).resolves.toEqual({
      text: "/eng-mode build the page",
    });
    expect(state.events).toEqual([`resolve:${CHEAP_MODEL_ROLE}`, "setModel", "thinking:medium"]);

    state.events.length = 0;
    await expect(state.inputHandler?.({ text: "/eng-mode continue" }, state.context)).resolves.toBeUndefined();
    expect(state.events).toEqual([`resolve:${CHEAP_MODEL_ROLE}`, "setModel", "thinking:medium"]);
    await expect(state.escalate()).resolves.toEqual(text("refused: this session is pinned to the execution tier by /easy"));
  });

  it("pins the session to the execution tier with the /easy command", async () => {
    const state = setup();
    await state.easyCommand?.(" build the page ", state.context);
    expect(state.events).toEqual([
      `resolve:${CHEAP_MODEL_ROLE}`,
      "setModel",
      "thinking:medium",
      "prompt:/eng-mode build the page",
    ]);

    state.events.length = 0;
    await state.easyCommand?.(" ", state.context);
    expect(state.events).toEqual([
      `resolve:${CHEAP_MODEL_ROLE}`,
      "setModel",
      "thinking:medium",
      "notify:info:Easy mode selected for this session.",
    ]);
  });

  it("does not pin the session when the easy role cannot be selected", async () => {
    const state = setup({ activate: false });
    await expect(state.inputHandler?.({ text: "/eng-mode build /easy" }, state.context)).resolves.toEqual({ handled: true });
    state.events.length = 0;
    await expect(state.escalate()).resolves.toEqual(text("already on the expert tier"));
    expect(state.events).toEqual([]);
  });

  it("keeps an existing pin when reselecting the easy model fails", async () => {
    const state = setup({ activate: [true, false] });
    await state.easyCommand?.("", state.context);
    await expect(state.inputHandler?.({ text: "/eng-mode retry /easy" }, state.context)).resolves.toEqual({ handled: true });
    await expect(state.escalate()).resolves.toEqual(text("refused: this session is pinned to the execution tier by /easy"));
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
    state.stuck();
    state.events.length = 0;
    const result = await state.escalate();
    expect(result).toEqual(text(expect.stringContaining("Escalating")));
    expect(state.events).toEqual([
      expect.stringMatching(/^compact:.*attempted fix.*bun test \.\/src\/x\.test\.ts.*FAIL expected true, received false/s),
      `resolve:${EXPERT_MODEL_ROLE}`,
      "setModel",
      "thinking:low",
      expect.stringMatching(/^prompt:.*attempted fix.*bun test \.\/src\/x\.test\.ts.*FAIL expected true, received false/s),
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
    state.stuck();
    await state.escalate();
    expect(state.events).toContainEqual(expect.stringContaining("compact:"));
    expect(state.events).toContainEqual(expect.stringMatching(/^prompt:.*expert tier/));
    expect(state.events).not.toContainEqual(expect.stringContaining("notify:"));
  });

  it("skips compaction when the session is below the keep-recent floor", async () => {
    const state = setup({ contextTokens: 5_000 });
    await state.handoff();
    state.stuck();
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

  it("keeps escalation retryable when the expert model cannot be selected", async () => {
    const state = setup({ activate: [true, false, true] });
    await state.handoff();
    state.stuck();
    state.events.length = 0;
    await expect(state.escalate()).resolves.toEqual(text(expect.stringContaining("Escalating")));
    expect(state.events).not.toContainEqual(expect.stringMatching(/^prompt:.*expert tier/));

    state.events.length = 0;
    await expect(state.escalate()).resolves.toEqual(text(expect.stringContaining("Escalating")));
    expect(state.events).toContainEqual(expect.stringMatching(/^prompt:.*expert tier/));
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
    expect(state.events).toEqual([EXPLORATION_STEER]);
    for (let i = 0; i < 40; i++) state.call("grep");
    expect(state.events).toEqual([EXPLORATION_STEER]);

    const edited = setup();
    for (let i = 0; i < 10; i++) edited.call("read", { path: "src/x.ts" });
    edited.call("write", { path: "xd://checkpoint" });
    edited.call("edit", { input: "[src/x.ts#0000]" });
    for (let i = 0; i < 40; i++) edited.call("read", { path: "src/x.ts" });
    expect(edited.events).toEqual([]);
  });

  it("refuses escalate on the cheap tier until two gate failures or the attempt floor", async () => {
    const state = setup();
    await state.handoff();
    state.events.length = 0;
    for (let i = 0; i < 17; i++) state.call("read", { path: "src/x.ts" });
    state.gate(false);
    await expect(state.escalate()).resolves.toEqual(text(expect.stringContaining("refused: not stuck yet (18 of 40")));
    expect(state.events).toEqual([]);

    state.gate(true);
    await expect(state.escalate()).resolves.toEqual(text(expect.stringContaining("refused")));
    state.gate(true);
    await expect(state.escalate()).resolves.toEqual(text(expect.stringContaining("Escalating")));

    const floor = setup();
    await floor.handoff();
    for (let i = 0; i < 39; i++) floor.call("grep");
    await expect(floor.escalate()).resolves.toEqual(text(expect.stringContaining("refused")));
    floor.call("grep");
    floor.gate(true, "bun test ./src/x.test.ts");
    await expect(floor.escalate()).resolves.toEqual(text(expect.stringContaining("Escalating")));

    const recovered = setup();
    await recovered.handoff();
    recovered.stuck();
    recovered.gate(false);
    await expect(recovered.escalate()).resolves.toEqual(text(expect.stringContaining("refused")));
  });

  it("refuses escalation evidence that does not quote a real failed attempt", async () => {
    const fabricated = setup();
    await fabricated.handoff();
    fabricated.stuck();
    await expect(fabricated.escalate("needs expert review to ship")).resolves.toEqual(
      text("refused: evidence must quote the most recent failed command and one rendered failure line"),
    );

    const commandOnly = setup();
    await commandOnly.handoff();
    commandOnly.stuck();
    await expect(commandOnly.escalate("bun test ./src/x.test.ts failed")).resolves.toEqual(
      text("refused: evidence must quote the most recent failed command and one rendered failure line"),
    );
  });

  it("accepts any rendered failure line rather than only the output footer", async () => {
    const state = setup();
    await state.handoff();
    state.stuck();
    await expect(state.escalate("bun test ./src/x.test.ts\n1 test failed")).resolves.toEqual(
      text(expect.stringContaining("Escalating")),
    );
  });


  it("requires the command and failure as complete evidence lines", async () => {
    const state = setup();
    await state.handoff();
    state.stuck();
    await expect(state.escalate("bun test ./src/x.test.ts\n11 test failed")).resolves.toEqual(
      text("refused: evidence must quote the most recent failed command and one rendered failure line"),
    );
  });
  it("does not steer for handoff on the cheap tier or after an escalation", async () => {
    const state = setup();
    await state.handoff();
    state.events.length = 0;
    for (let i = 0; i < 40; i++) state.call("read", { path: "src/x.ts" });
    expect(state.events).toEqual([]);
    state.stuck();
    await state.escalate();
    state.events.length = 0;
    for (let i = 0; i < 40; i++) state.call("read", { path: "src/x.ts" });
    expect(state.events).toEqual([]);
  });
});
