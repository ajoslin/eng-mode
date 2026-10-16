import { describe, expect, it } from "bun:test";
import { classifierOutputNeedsExpertGuidance, registerAutoMode } from "./auto-mode.ts";
import type { CustomMessagePayload, ExtensionAPI, ExtensionEventContext, SessionEntryView } from "./extension-types.ts";
import type { DangerVerdict, ExpertVerdict, OperationClassifier } from "./typesafe.ts";

const message: CustomMessagePayload = {
  customType: "test",
  content: "expert guidance",
  display: false,
  attribution: "agent",
};

function fakeClassifier(danger: DangerVerdict, expert: ExpertVerdict): OperationClassifier {
  return {
    classifyDanger: async () => danger,
    classifyExpert: async () => expert,
  };
}

function captureHandler() {
  const handlers = new Map<string, (event: unknown, ctx: ExtensionEventContext) => unknown>();
  const schema = {
    optional: () => schema,
    describe: () => schema,
    int: () => schema,
    min: () => schema,
    positive: () => schema,
    nonnegative: () => schema,
  };
  const pi: ExtensionAPI = {
    zod: {
      object: () => schema,
      enum: () => schema,
      string: () => schema,
      number: () => schema,
      boolean: () => schema,
      array: () => schema,
    },
    pi: { Text: class {} },
    registerTool() {},
    registerMessageRenderer() {},
    on: (event, value) => {
      handlers.set(event, value);
    },
  };
  const context: ExtensionEventContext = {
    hasUI: false,
    cwd: "/test",
    ui: { confirm: async () => false },
  };
  return {
    pi,
    async handler(event: { prompt: string }, branch?: readonly SessionEntryView[]) {
      const handler = handlers.get("before_agent_start");
      if (!handler) throw new Error("Missing before_agent_start handler");
      return await handler(event, branch === undefined ? context : {
        ...context, sessionManager: { getBranch: () => branch },
      });
    },
  };
}

describe("classifierOutputNeedsExpertGuidance", () => {
  it("requires guidance only for the expert lens", () => {
    expect(classifierOutputNeedsExpertGuidance("ordinary")).toBeFalse();
    expect(classifierOutputNeedsExpertGuidance("expert")).toBeTrue();
    expect(classifierOutputNeedsExpertGuidance(undefined)).toBeFalse();
  });
});

describe("registerAutoMode", () => {
  it("injects the expert message when classified expert", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "expert" }));
    await expect(captured.handler?.({ prompt: "Choose the storage architecture" })).resolves.toEqual({ message });
  });

  it("does not inject for an ordinary lens", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "ordinary" }));
    await expect(captured.handler?.({ prompt: "Fix this failing test" })).resolves.toEqual({});
  });

  it("fails open when the classifier is disabled", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "disabled" }));
    await expect(captured.handler?.({ prompt: "Review the architecture" })).resolves.toEqual({});
  });

  it("fails open when the classifier errors", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "error" }));
    await expect(captured.handler?.({ prompt: "Review the architecture" })).resolves.toEqual({});
  });

  it("fails open when the classifier throws", async () => {
    const captured = captureHandler();
    const throwing: OperationClassifier = {
      classifyDanger: async () => ({ kind: "error" }),
      classifyExpert: async () => {
        throw new Error("boom");
      },
    };
    registerAutoMode(captured.pi, "guidance", message, throwing);
    await expect(captured.handler?.({ prompt: "Review the architecture" })).resolves.toEqual({});
  });

  it("skips classification when the prompt already carries the guidance", async () => {
    const captured = captureHandler();
    let calls = 0;
    const counting: OperationClassifier = {
      classifyDanger: async () => ({ kind: "error" }),
      classifyExpert: async () => {
        calls += 1;
        return { kind: "classified", lens: "expert" };
      },
    };
    registerAutoMode(captured.pi, "guidance", message, counting);
    await expect(captured.handler?.({ prompt: "do this guidance thing" })).resolves.toEqual({});
    expect(calls).toBe(0);
  });

  it("skips at 49,999 branch tokens without classification and injects at 50,000", async () => {
    const captured = captureHandler();
    let calls = 0;
    registerAutoMode(captured.pi, "guidance", message, {
      classifyDanger: async () => ({ kind: "error" }),
      classifyExpert: async () => {
        calls += 1;
        return { kind: "classified", lens: "expert" };
      },
    });
    const branch = [
      { type: "custom_message", customType: "test" },
      { type: "message", message: { role: "assistant", usage: { input: 40_000, output: 9_999, cacheRead: 100_000, cacheWrite: 100_000 } } },
    ];
    expect(await captured.handler({ prompt: "Choose deployment" }, branch)).toEqual({});
    expect(calls).toBe(0);
    branch.push({ type: "message", message: { role: "assistant", usage: { input: 0, output: 1, cacheRead: 0, cacheWrite: 0 } } });
    expect(await captured.handler({ prompt: "Choose deployment" }, branch)).toEqual({ message: { customType: "test", content: "expert guidance", display: false, attribution: "agent" } });
    expect(calls).toBe(1);
  });

  it("does not double-count reasoning tokens or count non-assistant usage", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "expert" }));
    const branch = [
      { type: "custom_message", customType: "test" },
      { type: "message", message: { role: "assistant", usage: { input: 0, output: 30_000, reasoningTokens: 30_000 } } },
      { type: "message", message: { role: "user", usage: { input: 50_000, output: 50_000 } } },
    ];
    expect(await captured.handler({ prompt: "Choose deployment" }, branch)).toEqual({});
  });

  for (const type of ["reset_boundary", "compaction"]) {
    it(`injects after a branch ${type}`, async () => {
      const captured = captureHandler();
      registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "expert" }));
      expect(await captured.handler({ prompt: "Choose deployment" }, [
        { type: "custom_message", customType: "test" }, { type },
      ])).toEqual({ message: { customType: "test", content: "expert guidance", display: false, attribution: "agent" } });
    });
  }

  it("injects twice on the same empty branch after an aborted delivery", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "expert" }));
    const branch: SessionEntryView[] = [];
    expect(await captured.handler({ prompt: "Choose storage" }, branch)).toEqual({ message: { customType: "test", content: "expert guidance", display: false, attribution: "agent" } });
    expect(await captured.handler({ prompt: "Choose deployment" }, branch)).toEqual({ message: { customType: "test", content: "expert guidance", display: false, attribution: "agent" } });
  });

  it("consults the classifier without a session manager", async () => {
    const captured = captureHandler();
    const prompts: string[] = [];
    registerAutoMode(captured.pi, "guidance", message, {
      classifyDanger: async () => ({ kind: "error" }),
      classifyExpert: async (prompt) => {
        prompts.push(prompt);
        return { kind: "classified", lens: "expert" };
      },
    });
    expect(await captured.handler({ prompt: "Choose storage" })).toEqual({ message: { customType: "test", content: "expert guidance", display: false, attribution: "agent" } });
    expect(prompts).toEqual(["Choose storage"]);
  });

  it("treats invalid assistant usage as zero independently", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "expert" }));
    expect(await captured.handler({ prompt: "Choose storage" }, [
      { type: "custom_message", customType: "test" },
      { type: "message", message: { role: "assistant", usage: { input: NaN, output: 49_999 } } },
      { type: "message", message: { role: "assistant", usage: { input: Infinity, output: -1 } } },
      { type: "message", message: { role: "assistant" } },
    ])).toEqual({});
  });

  it("does not start a cooldown for an ordinary verdict", async () => {
    const captured = captureHandler();
    let ordinary = true;
    registerAutoMode(captured.pi, "guidance", message, {
      classifyDanger: async () => ({ kind: "error" }),
      classifyExpert: async () => ({ kind: "classified", lens: ordinary ? "ordinary" : "expert" }),
    });
    expect(await captured.handler({ prompt: "Rename heading" })).toEqual({});
    ordinary = false;
    expect(await captured.handler({ prompt: "Choose storage" })).toEqual({ message });
  });

  it("skips when a branch user message contains guidance followed by low usage", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "expert" }));
    for (const content of ["Existing guidance", [{ type: "text", text: "Existing guidance" }, { type: "image" }]]) {
      expect(await captured.handler({ prompt: "Choose storage" }, [
        { type: "message", message: { role: "user", content } },
        { type: "message", message: { role: "assistant", usage: { input: 100, output: 100 } } },
      ])).toEqual({});
    }
  });
});