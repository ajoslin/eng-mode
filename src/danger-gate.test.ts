import { describe, expect, it } from "bun:test";
import { registerDangerGate, ULTRA_DANGEROUS_BLOCK_REASON, ULTRA_DANGEROUS_DENIED_REASON } from "./danger-gate.ts";
import type { EventContext, ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "./extension-types.ts";
import type { DangerVerdict, OperationClassifier } from "./typesafe.ts";

type ToolCallHandler = (event: ToolCallEvent, ctx?: EventContext) => Promise<ToolCallEventResult | void>;

function captureToolCall(): { pi: ExtensionAPI; handler: ToolCallHandler | undefined } {
  let handler: ToolCallHandler | undefined;
  const pi = {
    on: (_event: string, value: (event: unknown, ctx?: EventContext) => unknown) => {
      handler = value as ToolCallHandler;
    },
  } as ExtensionAPI;
  return {
    pi,
    get handler() {
      return handler;
    },
  };
}

/** A UI that answers every confirm with `answer` and records what it was asked. */
function attachedUser(answer: boolean): { ctx: EventContext; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    ctx: {
      hasUI: true,
      ui: {
        confirm: async (_title, message) => {
          asked.push(message);
          return answer;
        },
      },
    },
  };
}

function fakeClassifier(danger: DangerVerdict): OperationClassifier {
  return {
    classifyDanger: async () => danger,
    classifyExpert: async () => ({ kind: "error" }),
  };
}

function event(toolName: string, input: Record<string, unknown>): ToolCallEvent {
  return { type: "tool_call", toolCallId: "1", toolName, input };
}

describe("registerDangerGate", () => {
  it("blocks an ultra-dangerous bash command when no user is attached", async () => {
    const captured = captureToolCall();
    registerDangerGate(captured.pi, fakeClassifier({ kind: "classified", level: "ultra_dangerous" }));
    await expect(captured.handler?.(event("bash", { command: "git push --force origin main" }))).resolves.toEqual({
      block: true,
      reason: ULTRA_DANGEROUS_BLOCK_REASON,
    });
    await expect(
      captured.handler?.(event("bash", { command: "git push --force origin main" }), {
        hasUI: false,
        ui: { confirm: async () => true },
      }),
    ).resolves.toEqual({ block: true, reason: ULTRA_DANGEROUS_BLOCK_REASON });
  });

  it("runs an ultra-dangerous command the attached user approves", async () => {
    const captured = captureToolCall();
    const user = attachedUser(true);
    registerDangerGate(captured.pi, fakeClassifier({ kind: "classified", level: "ultra_dangerous" }));
    await expect(
      captured.handler?.(event("bash", { command: "quantg stack down --drop" }), user.ctx),
    ).resolves.toBeUndefined();
    expect(user.asked).toEqual(["bash: quantg stack down --drop"]);
  });

  it("blocks an ultra-dangerous command the attached user declines", async () => {
    const captured = captureToolCall();
    const user = attachedUser(false);
    registerDangerGate(captured.pi, fakeClassifier({ kind: "classified", level: "ultra_dangerous" }));
    await expect(captured.handler?.(event("bash", { command: "rm -rf ~/data" }), user.ctx)).resolves.toEqual({
      block: true,
      reason: ULTRA_DANGEROUS_DENIED_REASON,
    });
  });

  it("never asks the user about a non-ultra operation", async () => {
    const captured = captureToolCall();
    const user = attachedUser(false);
    registerDangerGate(captured.pi, fakeClassifier({ kind: "classified", level: "dangerous" }));
    await expect(captured.handler?.(event("write", { path: "src/main.ts" }), user.ctx)).resolves.toBeUndefined();
    expect(user.asked).toEqual([]);
  });

  it("allows a safe bash command", async () => {
    const captured = captureToolCall();
    registerDangerGate(captured.pi, fakeClassifier({ kind: "classified", level: "safe" }));
    await expect(captured.handler?.(event("bash", { command: "git status" }))).resolves.toBeUndefined();
  });

  it("allows a dangerous (non-ultra) operation", async () => {
    const captured = captureToolCall();
    registerDangerGate(captured.pi, fakeClassifier({ kind: "classified", level: "dangerous" }));
    await expect(captured.handler?.(event("write", { path: "src/main.ts" }))).resolves.toBeUndefined();
  });

  it("does not gate read-only tools", async () => {
    const captured = captureToolCall();
    let calls = 0;
    const counting: OperationClassifier = {
      classifyExpert: async () => ({ kind: "error" }),
      classifyDanger: async () => {
        calls += 1;
        return { kind: "classified", level: "ultra_dangerous" };
      },
    };
    registerDangerGate(captured.pi, counting);
    await expect(captured.handler?.(event("read", { path: "src/main.ts" }))).resolves.toBeUndefined();
    expect(calls).toBe(0);
  });

  it("allows everything when the classifier is disabled (no key)", async () => {
    const captured = captureToolCall();
    registerDangerGate(captured.pi, fakeClassifier({ kind: "disabled" }));
    await expect(captured.handler?.(event("bash", { command: "git push --force origin main" }))).resolves.toBeUndefined();
  });

  it("fails closed on classifier error when configured", async () => {
    const captured = captureToolCall();
    registerDangerGate(captured.pi, fakeClassifier({ kind: "error" }));
    const result = await captured.handler?.(event("eval", { language: "py", code: "print('hello')" }));
    expect(result?.block).toBeTrue();
  });

  it("fails closed when the classifier throws", async () => {
    const captured = captureToolCall();
    const throwing: OperationClassifier = {
      classifyExpert: async () => ({ kind: "error" }),
      classifyDanger: async () => {
        throw new Error("boom");
      },
    };
    registerDangerGate(captured.pi, throwing);
    const result = await captured.handler?.(event("edit", { path: "src/main.ts" }));
    expect(result?.block).toBeTrue();
  });

  it("skips gating when the operation cannot be described", async () => {
    const captured = captureToolCall();
    let calls = 0;
    const counting: OperationClassifier = {
      classifyExpert: async () => ({ kind: "error" }),
      classifyDanger: async () => {
        calls += 1;
        return { kind: "classified", level: "ultra_dangerous" };
      },
    };
    registerDangerGate(captured.pi, counting);
    await expect(captured.handler?.(event("bash", { command: 42 }))).resolves.toBeUndefined();
    expect(calls).toBe(0);
  });
});