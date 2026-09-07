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
  const events = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
  const available = {primary: true, fallback: true, duplicate: false};
  const model = (id: string) => ({
    id, provider: `test-${id}`, name: id, api: "openai-responses", baseUrl: "https://example.invalid",
    reasoning: true, thinking: {efforts: ["low", "medium", "max"]}, input: ["text"],
    contextWindow: 8192, maxTokens: 1024, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
  } as unknown as Model);
  registerEngAdvisor({
    registerCommand: (_name: string, command: {handler: typeof handler}) => {handler = command.handler;},
    registerMessageRenderer: () => {}, on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => events.set(name, handler), zod,
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
    emit: (name: string, event: unknown) => events.get(name)?.(event, ctx),
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

test.each([false, true])("switching an in-flight review retries its batch, paused=%s", async paused => {
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
    if (paused) await c.run("off");
    await c.run("primary");
    if (paused) await c.run("review");
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


function reviewEntry(text = "Inspect the unchecked external value."): SessionEntry {
  return {type: "message", id: `request-${text}`, parentId: null, timestamp: new Date().toISOString(), message: {role: "user", content: [{type: "text", text}], timestamp: Date.now()}} as SessionEntry;
}

test("manual review bypasses cadence and does not rereview consumed messages", async () => {
  const c = selectionCommands();
  const review = spyOn(InProcessReviewer.prototype, "review").mockResolvedValue([]);
  try {
    await c.run("primary");
    await c.flush();
    c.entries.push(reviewEntry());
    c.emit("turn_end", {message: {role: "assistant", content: [{type: "toolCall", id: "read", name: "read", arguments: {}}]}});
    expect(c.callbacks).toHaveLength(0);
    await c.run("review");
    await c.flush();
    expect(review).toHaveBeenCalledTimes(1);
    expect(c.notices.at(-1)?.message).toContain("manual review completed");
    await c.run("review");
    await c.flush();
    expect(review).toHaveBeenCalledTimes(1);
    expect(c.notices.at(-1)?.message).toContain("no unreviewed messages");
    expect(c.persisted).toHaveLength(1);
  } finally {review.mockRestore();}
});

test("manual review uses the selected fallback once while automatic review stays paused", async () => {
  const c = selectionCommands();
  const models: string[] = [];
  const review = spyOn(InProcessReviewer.prototype, "review").mockImplementation(async function(this: InProcessReviewer) {models.push(this.modelStatus);return [];});
  try {
    await c.run("off");
    await c.run("fallback");
    c.entries.push(reviewEntry());
    await c.run("review");
    await c.flush();
    expect(models).toHaveLength(1);
    expect(models[0]).toContain("test-fallback/fallback");
    await c.run("status");
    expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: paused");
    c.entries.push(reviewEntry("A later update"));
    c.emit("turn_end", {message: {role: "assistant", content: [{type: "text", text: "Updated"}]}});
    expect(c.callbacks).toHaveLength(0);
  } finally {review.mockRestore();}
});

test("manual review reports empty and filtered input without invoking a reviewer", async () => {
  const c = selectionCommands();
  const review = spyOn(InProcessReviewer.prototype, "review").mockResolvedValue([]);
  try {
    await c.run("review");
    await c.flush();
    expect(c.notices.at(-1)?.message).toContain("no unreviewed messages");
    c.entries.push({type: "message", id: "ignored", parentId: null, timestamp: new Date().toISOString(), message: {role: "assistant", content: [{type: "toolCall", id: "git", name: "git", arguments: {}}]}} as SessionEntry);
    await c.run("review");
    await c.flush();
    expect(c.notices.at(-1)?.message).toContain("no reviewable messages after filtering");
    expect(review).not.toHaveBeenCalled();
  } finally {review.mockRestore();}
});

test("a failed manual review stays visible while paused and can be explicitly retried", async () => {
  const c = selectionCommands();
  const review = spyOn(InProcessReviewer.prototype, "review").mockRejectedValueOnce(new Error("Synthetic failure")).mockResolvedValue([]);
  try {
    await c.run("off");
    await c.run("primary");
    c.entries.push(reviewEntry());
    await c.run("review");
    await c.flush();
    expect(c.notices.at(-1)).toEqual({message: "Eng-Advisor manual review failed: Synthetic failure", level: "warning"});
    expect(c.persisted).toHaveLength(0);
    await c.run("status");
    expect(c.notices.at(-1)?.message).toContain("Last error: Synthetic failure");
    await c.run("review");
    await c.flush();
    expect(review).toHaveBeenCalledTimes(2);
    expect(c.notices.at(-1)?.message).toContain("manual review completed");
    await c.run("status");
    expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: paused");
    expect(c.notices.at(-1)?.message).not.toContain("Last error:");
  } finally {review.mockRestore();}
});

test("repeated manual requests during a review coalesce into one subsequent batch", async () => {
  const c = selectionCommands();
  let started!: () => void;
  let release!: () => void;
  const firstStarted = new Promise<void>(resolve => {started = resolve;});
  const firstRelease = new Promise<void>(resolve => {release = resolve;});
  let count = 0;
  let active = 0;
  let peak = 0;
  const review = spyOn(InProcessReviewer.prototype, "review").mockImplementation(async () => {
    count++;active++;peak = Math.max(peak, active);
    if (count === 1) {started();await firstRelease;}
    active--;return [];
  });
  try {
    await c.run("off");
    await c.run("primary");
    c.entries.push(reviewEntry());
    await c.run("review");
    const pending = c.flush();
    await firstStarted;
    c.entries.push(reviewEntry("A new unreviewed update"));
    await c.run("review");
    await c.run("review");
    release();
    await pending;
    expect(count).toBe(2);
    expect(peak).toBe(1);
    expect(c.persisted).toHaveLength(2);
    await c.run("status");
    expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: paused");
    expect(c.notices.at(-1)?.message).toContain("reviews: 2");
  } finally {release();review.mockRestore();}
});

test("off cancels an active manual review and its queued request", async () => {
  const c = selectionCommands();
  let started!: () => void;
  const firstStarted = new Promise<void>(resolve => {started = resolve;});
  const review = spyOn(InProcessReviewer.prototype, "review").mockImplementation(async options => {
    started();
    return await new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(options.signal?.reason), {once: true}));
  });
  try {
    await c.run("off");
    await c.run("primary");
    c.entries.push(reviewEntry());
    await c.run("review");
    const pending = c.flush();
    await firstStarted;
    await c.run("review");
    await c.run("off");
    await pending;
    expect(review).toHaveBeenCalledTimes(1);
    expect(c.persisted).toHaveLength(0);
    expect(c.notices.some(n => n.message.includes("manual review completed"))).toBe(false);
    await c.run("status");
    expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: paused");
  } finally {review.mockRestore();}
});
