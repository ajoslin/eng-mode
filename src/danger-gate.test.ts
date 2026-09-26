import { describe, expect, it } from "bun:test";
import {
  CLASSIFIER_UNAVAILABLE_REASON,
  HIGHLY_DANGEROUS_BLOCK_REASON,
  registerDangerGate,
  USER_DECLINED_REASON,
} from "./danger-gate.ts";
import type { ExtensionAPI, ExtensionEventContext, ToolCallEvent, ToolCallEventResult } from "./extension-types.ts";
import type { DangerContext, DangerVerdict, OperationClassifier } from "./typesafe.ts";

type Handler = (event: unknown, ctx: ExtensionEventContext) => unknown;

interface Harness {
  readonly prompt: (text: string) => void;
  readonly call: (event: ToolCallEvent, ctx: ExtensionEventContext) => Promise<ToolCallEventResult | void>;
  readonly seen: DangerContext[];
}

function harness(verdict: DangerVerdict | (() => Promise<DangerVerdict>)): Harness {
  const handlers: Record<string, Handler> = {};
  const pi = { on: (name: string, handler: Handler) => (handlers[name] = handler) } as unknown as ExtensionAPI;
  const seen: DangerContext[] = [];
  const classifier: OperationClassifier = {
    classifyDanger: async (context) => {
      seen.push(context);
      return typeof verdict === "function" ? verdict() : verdict;
    },
    classifyExpert: async () => ({ kind: "error" }),
  };
  registerDangerGate(pi, classifier);
  return {
    prompt: (text) => void handlers.before_agent_start?.({ prompt: text }, headless()),
    call: async (event, ctx) => (await handlers.tool_call?.(event, ctx)) as ToolCallEventResult | void,
    seen,
  };
}

function headless(): ExtensionEventContext {
  return { hasUI: false, cwd: "/repo", ui: { confirm: async () => false } };
}

function interactive(answers: boolean[]): ExtensionEventContext & { asked: string[] } {
  const asked: string[] = [];
  return {
    hasUI: true,
    cwd: "/repo",
    asked,
    ui: {
      confirm: async (_title, message) => {
        asked.push(message);
        return answers.shift() ?? false;
      },
    },
  };
}

function bash(command: unknown): ToolCallEvent {
  return { type: "tool_call", toolCallId: "1", toolName: "bash", input: { command } };
}

const FLAGGED: DangerVerdict = { kind: "classified", level: "highly_dangerous" };

describe("registerDangerGate", () => {
  it("passes the user's request and cwd to the classifier", async () => {
    const gate = harness({ kind: "classified", level: "safe" });
    gate.prompt("dump the dev database");
    await expect(gate.call(bash("pg_dump devdb"), headless())).resolves.toBeUndefined();
    expect(gate.seen).toEqual([{ operation: "bash: pg_dump devdb", userRequest: "dump the dev database", cwd: "/repo" }]);
  });

  it("blocks a flagged call when no user can be asked", async () => {
    const gate = harness(FLAGGED);
    await expect(gate.call(bash("git push --force origin main"), headless())).resolves.toEqual({
      block: true,
      reason: HIGHLY_DANGEROUS_BLOCK_REASON,
    });
  });

  it("asks the user instead of blocking, and runs on approval", async () => {
    const gate = harness(FLAGGED);
    const ctx = interactive([true]);
    await expect(gate.call(bash("git push --force origin main"), ctx)).resolves.toBeUndefined();
    expect(ctx.asked).toHaveLength(1);
  });

  it("blocks with a do-not-retry reason when the user declines", async () => {
    const gate = harness(FLAGGED);
    await expect(gate.call(bash("rm -rf ~"), interactive([false]))).resolves.toEqual({
      block: true,
      reason: USER_DECLINED_REASON,
    });
  });

  it("remembers approval for the identical operation only", async () => {
    const gate = harness(FLAGGED);
    const ctx = interactive([true, false]);
    await gate.call(bash("git push --force origin main"), ctx);
    await expect(gate.call(bash("git push --force origin main"), ctx)).resolves.toBeUndefined();
    await expect(gate.call(bash("git push --force origin release"), ctx)).resolves.toEqual({
      block: true,
      reason: USER_DECLINED_REASON,
    });
    expect(ctx.asked).toHaveLength(2);
  });

  it("asks when the classifier fails, and blocks headless", async () => {
    const gate = harness(async () => {
      throw new Error("boom");
    });
    await expect(gate.call(bash("make"), headless())).resolves.toEqual({ block: true, reason: CLASSIFIER_UNAVAILABLE_REASON });
    await expect(gate.call(bash("make"), interactive([true]))).resolves.toBeUndefined();
  });

  it("allows everything when the classifier is disabled (no key)", async () => {
    const gate = harness({ kind: "disabled" });
    await expect(gate.call(bash("rm -rf ~"), headless())).resolves.toBeUndefined();
  });

  it("does not gate read-only tools or undescribable operations", async () => {
    const gate = harness(FLAGGED);
    const read: ToolCallEvent = { type: "tool_call", toolCallId: "1", toolName: "read", input: { path: "x" } };
    await expect(gate.call(read, headless())).resolves.toBeUndefined();
    await expect(gate.call(bash(42), headless())).resolves.toBeUndefined();
    expect(gate.seen).toHaveLength(0);
  });
});
