import { describe, expect, it } from "bun:test";
import { HIGHLY_DANGEROUS_BLOCK_REASON, registerDangerGate } from "./danger-gate.ts";
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

function interactive(): ExtensionEventContext & { asked: string[] } {
  const asked: string[] = [];
  return {
    hasUI: true,
    cwd: "/repo",
    asked,
    ui: {
      confirm: async (_title, message) => {
        asked.push(message);
        return true;
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

  it("denies a flagged call without asking, even when a user is present", async () => {
    const gate = harness(FLAGGED);
    const ctx = interactive();
    const blocked = { block: true, reason: HIGHLY_DANGEROUS_BLOCK_REASON };
    await expect(gate.call(bash("git push --force origin main"), ctx)).resolves.toEqual(blocked);
    await expect(gate.call(bash("git push --force origin main"), headless())).resolves.toEqual(blocked);
    expect(ctx.asked).toHaveLength(0);
  });

  it("retries a failed classification once, then allows the call", async () => {
    const results: DangerVerdict[] = [{ kind: "error" }, { kind: "classified", level: "safe" }];
    const recovering = harness(async () => results.shift() ?? FLAGGED);
    await expect(recovering.call(bash("make"), interactive())).resolves.toBeUndefined();
    expect(recovering.seen).toHaveLength(2);

    const down = harness(async () => {
      throw new Error("boom");
    });
    const ctx = interactive();
    await expect(down.call(bash("make"), ctx)).resolves.toBeUndefined();
    expect(down.seen).toHaveLength(2);
    expect(ctx.asked).toHaveLength(0);
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
