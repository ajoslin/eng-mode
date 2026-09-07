import { expect, spyOn, test } from "bun:test";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Model } from "@oh-my-pi/pi-ai";
import { zod, type ExtensionContext, type SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { registerEngAdvisor, type AdvisorExtensionAPI } from "../index";
import { InProcessReviewer } from "../reviewer";

function selectionCommands() {
  let handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  const notices: Array<{message: string; level: string | undefined}> = [];
  const callbacks: Array<() => Promise<void>> = [];
  const persisted: string[] = [];
  const entries: SessionEntry[] = [];
  const available = {primary: true, fallback: true, duplicate: false};
  const model = (id: string) => ({
    id, provider: `test-${id}`, name: id, api: "openai-responses", baseUrl: "https://example.invalid",
    reasoning: true, thinking: {efforts: ["low", "medium", "max"]}, input: ["text"],
    contextWindow: 8192, maxTokens: 1024, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
  } as unknown as Model);
  registerEngAdvisor({
    registerCommand: (_name: string, command: {handler: typeof handler}) => {handler = command.handler;},
    registerMessageRenderer: () => {}, on: () => {}, zod,
    pi: {getAgentDir: () => path.join(tmpdir(), "eng-advisor-selection-no-profile")},
    appendEntry: (name: string) => persisted.push(name),
    sendMessage: () => {throw new Error("No findings expected");},
  } as unknown as AdvisorExtensionAPI);
  const ctx = {
    cwd: path.resolve(import.meta.dir, "../.."),
    ui: {notify: (message: string, level?: string) => notices.push({message, level})},
    setTimeout: (fn: () => Promise<void>) => callbacks.push(fn),
    sessionManager: {getBranch: () => entries, getSessionId: () => "selection-test"},
    models: {resolve: (selector: string) => {
      if (selector === "@advisor") return available.primary ? model("primary") : undefined;
      if (selector === "@advisor_fallback") return available.fallback ? model(available.duplicate ? "primary" : "fallback") : undefined;
      return undefined;
    }},
    modelRegistry: {resolver: () => {throw new Error("No provider requests expected");}},
  } as unknown as ExtensionContext;
  return {
    run: (args: string) => handler(args, ctx), notices, callbacks, available, persisted, entries,
    flush: async () => {while (callbacks.length) await callbacks.shift()!();},
  };
}

test("commands select fallback and return to primary", async () => {
  const c = selectionCommands();
  await c.run("fallback");
  expect(c.notices.at(-1)?.message).toContain("selected fallback");
  await c.flush();
  await c.run("status");
  expect(c.notices.at(-1)?.message).toContain("Active model: test-fallback/fallback:");
  await c.run("primary");
  expect(c.notices.at(-1)?.message).toContain("selected primary");
  await c.flush();
  await c.run("status");
  expect(c.notices.at(-1)?.message).toContain("Active model: test-primary/primary:");
  expect(c.persisted).toEqual([]);
});

test("switching models preserves pause state", async () => {
  const c = selectionCommands();
  await c.run("off");
  await c.run("fallback");
  expect(c.callbacks).toHaveLength(0);
  await c.run("show");
  expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: paused");
  expect(c.notices.at(-1)?.message).toContain("test-fallback/fallback");
  await c.run("on");
  await c.flush();
  await c.run("status");
  expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: enabled");
  expect(c.notices.at(-1)?.message).toContain("fallback: manual selection");
});

test.each(["missing", "duplicate"])("an invalid fallback keeps the active primary: %s", async kind => {
  const c = selectionCommands();
  await c.run("primary");
  await c.flush();
  if (kind === "missing") c.available.fallback = false;
  else c.available.duplicate = true;
  await c.run("fallback");
  expect(c.notices.at(-1)?.level).toBe("warning");
  expect(c.notices.at(-1)?.message).toContain("fallback failed");
  expect(c.callbacks).toHaveLength(0);
  await c.run("show");
  expect(c.notices.at(-1)?.message).toContain("Active model: test-primary/primary:");
});

test("an unavailable primary keeps the active fallback", async () => {
  const c = selectionCommands();
  await c.run("fallback");
  await c.flush();
  c.available.primary = false;
  await c.run("primary");
  expect(c.notices.at(-1)?.level).toBe("warning");
  expect(c.callbacks).toHaveLength(0);
  await c.run("status");
  expect(c.notices.at(-1)?.message).toContain("Active model: test-fallback/fallback:");
});

test("switching an in-flight review cancels it and retries the unconsumed batch", async () => {
  const c = selectionCommands();
  c.entries.push({type: "message", id: "request", parentId: null, timestamp: new Date().toISOString(), message: {role: "user", content: [{type: "text", text: "Inspect the unchecked external value before marking the change complete."}], timestamp: Date.now()}} as SessionEntry);
  const models: string[] = [];
  const batches: string[] = [];
  let started!: () => void;
  const firstStarted = new Promise<void>(resolve => {started = resolve;});
  let aborted = false;
  const review = spyOn(InProcessReviewer.prototype, "review").mockImplementation(async function(this: InProcessReviewer, options) {
    models.push(this.modelStatus);
    batches.push(options.batch.text);
    if (models.length === 1) {
      started();
      return await new Promise((_, reject) => options.signal?.addEventListener("abort", () => {aborted = true; reject(options.signal?.reason);}, {once: true}));
    }
    return [];
  });
  try {
    await c.run("primary");
    const pending = c.flush();
    await firstStarted;
    await c.run("fallback");
    await pending;
    expect(aborted).toBe(true);
    expect(models).toHaveLength(2);
    expect(models[0]).toContain("test-primary/primary");
    expect(models[1]).toContain("test-fallback/fallback");
    expect(batches[1]).toBe(batches[0]);
    expect(c.persisted).toHaveLength(1);
    expect(c.notices.some(n => n.message.includes("review failed"))).toBe(false);
    await c.run("status");
    expect(c.notices.at(-1)?.message).toContain("reviews: 1");
  } finally {review.mockRestore();}
});
