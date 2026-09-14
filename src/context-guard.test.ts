import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LEAD_WRITE_BLOCK_REASON,
  LEAD_WRITES_COMMAND,
  registerContextGuard,
} from "./context-guard.ts";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
  ToolResultEvent,
  ToolResultEventResult,
} from "./extension-types.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

type CallHandler = (event: ToolCallEvent, context: ExtensionContext) => Promise<ToolCallEventResult | void> | ToolCallEventResult | void;
type ResultHandler = (event: ToolResultEvent, context: ExtensionContext) => Promise<ToolResultEventResult | void> | ToolResultEventResult | void;
type CommandHandler = (args: string, context: ExtensionContext) => Promise<void>;

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "eng-mode-context-guard-"));
  roots.push(root);
  const sessionDir = join(root, "sessions");
  const leadSessionFile = join(sessionDir, "lead.jsonl");
  const artifactsDir = join(sessionDir, "lead");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(leadSessionFile, "");
  const childSessionFile = join(artifactsDir, "Worker.jsonl");
  await writeFile(childSessionFile, "");

  const saved: Array<{ content: string; toolType: string }> = [];
  const notices: string[] = [];
  let onCall: CallHandler | undefined;
  let onResult: ResultHandler | undefined;
  let command: CommandHandler | undefined;
  const lifecycle: Array<() => void> = [];
  const pi = {
    on: (event: string, handler: CallHandler | ResultHandler | (() => void)) => {
      if (event === "tool_call") onCall = handler as CallHandler;
      if (event === "tool_result") onResult = handler as ResultHandler;
      if (event === "session_switch") lifecycle.push(handler as () => void);
    },
    registerCommand: (name: string, options: { handler: CommandHandler }) => {
      if (name === LEAD_WRITES_COMMAND) command = options.handler;
    },
  } as unknown as ExtensionAPI;
  registerContextGuard(pi);

  const context = (mode: "tui" | "print", sessionFile: string): ExtensionContext =>
    ({
      mode,
      ui: { notify: (message: string) => notices.push(message) },
      sessionManager: {
        getSessionFile: () => sessionFile,
        getArtifactsDir: () => artifactsDir,
        saveArtifact: async (content: string, toolType: string) => {
          saved.push({ content, toolType });
          return "7";
        },
      },
    }) as unknown as ExtensionContext;

  return {
    root,
    artifactsDir,
    saved,
    notices,
    lead: context("tui", leadSessionFile),
    headlessLead: context("print", leadSessionFile),
    child: context("print", childSessionFile),
    call: (event: Omit<ToolCallEvent, "type" | "toolCallId">, ctx: ExtensionContext) =>
      onCall?.({ type: "tool_call", toolCallId: "c1", ...event }, ctx),
    result: (event: Omit<ToolResultEvent, "type" | "toolCallId" | "isError"> & { isError?: boolean }, ctx: ExtensionContext) =>
      onResult?.({ type: "tool_result", toolCallId: "c1", isError: false, ...event }, ctx),
    command: (args: string, ctx: ExtensionContext) => command?.(args, ctx),
    switchSession: () => {
      for (const reset of lifecycle) reset();
    },
  };
}

describe("lead write gate", () => {
  it("blocks lead repository writes and edits, allows internal URIs and artifacts", async () => {
    const h = await harness();
    const repoFile = join(h.root, "src", "a.ts");
    expect(await h.call({ toolName: "write", input: { path: repoFile, content: "x" } }, h.lead)).toEqual({
      block: true,
      reason: LEAD_WRITE_BLOCK_REASON,
    });
    expect(await h.call({ toolName: "edit", input: { input: `[${repoFile}#A1B2]\nPUT 1.=1:\n+x` } }, h.lead)).toEqual({
      block: true,
      reason: LEAD_WRITE_BLOCK_REASON,
    });
    const multi = `[local://plan.md#A1B2]\nPUT 1.=1:\n+x\n[${repoFile}#C3D4]\nPUT 1.=1:\n+y`;
    expect(await h.call({ toolName: "edit", input: { input: multi } }, h.lead)).toMatchObject({ block: true });
    expect(await h.call({ toolName: "edit", input: { input: `[local://plan.md#A1B2]\nPUT 1.=1:\n+x` } }, h.lead)).toBeUndefined();
    expect(await h.call({ toolName: "write", input: { path: "xd://eng_orch", content: "{}" } }, h.lead)).toBeUndefined();
    expect(await h.call({ toolName: "write", input: { path: "local://plan.md", content: "" } }, h.lead)).toBeUndefined();
    expect(await h.call({ toolName: "write", input: { path: join(h.artifactsDir, "note.md"), content: "" } }, h.lead)).toBeUndefined();
  });

  it("never blocks headless sessions and honours the allow toggle until the session changes", async () => {
    const h = await harness();
    const repoFile = join(h.root, "src", "a.ts");
    expect(await h.call({ toolName: "write", input: { path: repoFile, content: "x" } }, h.child)).toBeUndefined();
    expect(await h.call({ toolName: "write", input: { path: repoFile, content: "x" } }, h.headlessLead)).toBeUndefined();
    await h.command("allow", h.lead);
    expect(h.notices).toEqual(["Lead repository writes: allowed."]);
    expect(await h.call({ toolName: "write", input: { path: repoFile, content: "x" } }, h.lead)).toBeUndefined();
    h.switchSession();
    expect(await h.call({ toolName: "write", input: { path: repoFile, content: "x" } }, h.lead)).toMatchObject({ block: true });
  });
});

describe("same-path read short-circuit", () => {
  it("blocks an identical lead re-read of an unchanged file only", async () => {
    const h = await harness();
    const file = join(h.root, "doc.md");
    await writeFile(file, "one\n");
    const read = async (path: string, ctx = h.lead) => {
      const outcome = await h.call({ toolName: "read", input: { path } }, ctx);
      if (outcome?.block) return outcome;
      const executed = typeof outcome?.input?.path === "string" ? outcome.input.path : path;
      const details = executed.includes("://") ? { resolvedPath: file } : { meta: { source: { type: "path", value: file } } };
      await h.result({ toolName: "read", input: { path: executed }, content: [{ type: "text", text: "one" }], details }, ctx);
      return outcome;
    };
    expect(await read(file)).toBeUndefined();
    expect(await read(file)).toMatchObject({ block: true, reason: expect.stringContaining("unchanged since it was read") });
    expect(await read(`${file}:1-1`)).toBeUndefined();
    expect(await read(`${file}?fresh`)).toEqual({ input: { path: file } });
    expect(await read(file)).toMatchObject({ block: true });
    expect(await read(file, h.child)).toBeUndefined();

    await writeFile(file, "one\ntwo\n");
    expect(await read(file)).toBeUndefined();
    expect(await read(file)).toMatchObject({ block: true });

    await h.result({ toolName: "write", input: { path: file, content: "" }, content: [{ type: "text", text: "ok" }] }, h.lead);
    expect(await read(file)).toBeUndefined();
    expect(await read(file)).toMatchObject({ block: true });
    h.switchSession();
    expect(await read(file)).toBeUndefined();
  });
});

describe("lead result cap", () => {
  const big = Array.from({ length: 1200 }, (_, i) => `line ${i} ${"x".repeat(24)}`).join("\n");

  it("spills oversized lead results to an artifact and keeps head and tail", async () => {
    const h = await harness();
    const result = await h.result({ toolName: "hub", input: { op: "wait" }, content: [{ type: "text", text: big }] }, h.lead);
    const text = result?.content?.[0]?.text ?? "";
    expect(result?.content).toHaveLength(1);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(6144 + 160);
    expect(text.startsWith("line 0 ")).toBe(true);
    expect(text.endsWith("line 1199 " + "x".repeat(24))).toBe(true);
    expect(text).toContain("full output: artifact://7");
    expect(h.saved).toEqual([{ content: big, toolType: "hub" }]);
  });

  it("reuses a core spill artifact, and leaves small, error, and subagent results alone", async () => {
    const h = await harness();
    const spilled = await h.result(
      { toolName: "bash", input: {}, content: [{ type: "text", text: big }], details: { meta: { truncation: { artifactId: "3" } } } },
      h.lead,
    );
    expect(spilled?.content?.[0]?.text).toContain("artifact://3");
    expect(h.saved).toHaveLength(0);

    expect(await h.result({ toolName: "hub", input: {}, content: [{ type: "text", text: "x".repeat(3000) }] }, h.lead)).toBeUndefined();
    expect(await h.result({ toolName: "hub", input: {}, content: [{ type: "text", text: big }], isError: true }, h.lead)).toBeUndefined();
    expect(await h.result({ toolName: "hub", input: {}, content: [{ type: "text", text: big }] }, h.child)).toBeUndefined();
  });
});
