import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StreamFn } from "@oh-my-pi/pi-agent-core";
import type { AssistantMessage, Model } from "@oh-my-pi/pi-ai";
import { createAssistantMessageEventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
import { zod, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { loadEngAdvisorConfig } from "../config";
import type { AdvisorExtensionAPI } from "../index";
import { InProcessReviewer } from "../reviewer";
import type { ReviewBatch } from "../types";

const config = await loadEngAdvisorConfig(path.resolve(import.meta.dir, ".."));
const model = (id: string): Model => ({
  id, name: id, provider: id === "primary" ? "test-primary" : "test-alternative",
  api: "openai-responses", baseUrl: "https://example.invalid", reasoning: true,
  thinking: { efforts: ["medium", "max"] }, input: ["text"],
  contextWindow: 1000000, maxTokens: 128000,
  cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
} as unknown as Model);
const batch: ReviewBatch = {messages: [], text: "Review the current work.", groundingText: new Map(), wip: false, cursor: 1};

function harness(outcomes: string[], {
  fallback = true, resolveFallback = true, resolvePrimary = true, duplicate = false,
}: {fallback?: boolean; resolveFallback?: boolean; resolvePrimary?: boolean; duplicate?: boolean} = {}) {
  const calls: Array<{id: string; effort: unknown; messages: string}> = [];
  const notices: string[] = [];
  const streamFn: StreamFn = (selected, context, options) => {
    calls.push({id: selected.id, effort: options?.reasoning, messages: JSON.stringify(context.messages)});
    const outcome = outcomes.shift();
    if (!outcome) throw new Error("Unexpected extra provider call");
    const message: AssistantMessage = {
      role: "assistant", api: selected.api, provider: selected.provider, model: selected.id,
      content: outcome === "report" ? [{type: "toolCall", id: `report-${calls.length}`, name: "report_findings", arguments: {findings: []}}] : [],
      stopReason: outcome === "report" ? "toolUse" : outcome === "stop" ? "stop" : "error",
      timestamp: Date.now(), usage: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}},
      ...(outcome !== "report" && outcome !== "stop" ? {errorMessage: outcome} : {}),
    };
    const stream = createAssistantMessageEventStream();
    if (message.stopReason === "error") stream.push({type: "error", reason: "error", error: message});
    else stream.push({type: "done", reason: outcome === "report" ? "toolUse" : "stop", message});
    stream.end();
    return stream;
  };
  const ctx = {
    cwd: process.cwd(), models: {resolve: (name: string) => {
      if (name === "primary") return resolvePrimary ? model("primary") : undefined;
      if (name === "fallback" && resolveFallback) return model(duplicate ? "primary" : "fallback");
      return undefined;
    }},
    sessionManager: {getSessionId: () => "fallback-test"},
    modelRegistry: {resolver: () => "test-only"},
    ui: {notify: (message: string) => notices.push(message)},
  } as unknown as ExtensionContext;
  const {fallback: _installedFallback, ...base} = config;
  const reviewer = new InProcessReviewer({
    pi: {zod} as AdvisorExtensionAPI, ctx, instructions: "Repository authority still applies.", streamFn,
    config: {...base, model: "primary", thinking: "medium", ...(fallback ? {fallback: {model: "fallback", thinking: "max" as const}} : {})},
  });
  return {reviewer, calls, notices};
}

test.each(["rate_limit_exceeded", "usage_limit_reached", "This request would exceed your account's rate limit. Please try again later."])("limit retries the batch at Max and retains fallback: %s", async error => {
  const {reviewer, calls, notices} = harness([error, "report", "stop", "report", "stop"]);
  try {
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.map(c => [c.id, c.effort])).toEqual([["primary", "medium"], ["fallback", "max"], ["fallback", "max"]]);
    expect(calls[1]?.messages).not.toContain("rate_limit_exceeded");
    expect(calls[1]?.messages).toContain(batch.text);
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.filter(c => c.id === "primary")).toHaveLength(1);
    expect(notices).toHaveLength(1);
    expect(reviewer.modelStatus).toContain("test-alternative/fallback:max (fallback");
  } finally {reviewer.dispose();}
});

test("successful primary retains Medium effort and never invokes fallback", async () => {
  const {reviewer, calls, notices} = harness(["report", "stop"]);
  try {
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.every(c => c.id === "primary" && c.effort === "medium")).toBe(true);
    expect(notices).toEqual([]);
  } finally {reviewer.dispose();}
});

test.each(["Invalid API key", "maximum context length exceeded", "connection timed out", "invalid tool schema"])("does not switch providers for %s", async error => {
  const {reviewer, calls} = harness([error]);
  try {
    await expect(reviewer.review({batch, openFindings: []})).rejects.toThrow();
    expect(calls).toHaveLength(1);
  } finally {reviewer.dispose();}
});

test("both providers at limit cause a bounded failure instead of an empty accepted report", async () => {
  const {reviewer, calls} = harness(["rate_limit_exceeded", "usage_limit_reached"]);
  try {
    await expect(reviewer.review({batch, openFindings: []})).rejects.toThrow();
    expect(calls.map(c => c.id)).toEqual(["primary", "fallback"]);
  } finally {reviewer.dispose();}
});

test.each([false, true])("a missing or unresolved fallback fails without retry (configured=%s)", async configured => {
  const {reviewer, calls} = harness(["rate_limit_exceeded"], {fallback: configured, resolveFallback: false});
  try {
    await expect(reviewer.review({batch, openFindings: []})).rejects.toThrow();
    expect(calls).toHaveLength(1);
  } finally {reviewer.dispose();}
});

test("an already cancelled review makes no provider calls", async () => {
  const {reviewer, calls} = harness([]);
  try {
    await expect(reviewer.review({batch, openFindings: [], signal: AbortSignal.abort(new Error("cancelled"))})).rejects.toThrow("cancelled");
    expect(calls).toHaveLength(0);
  } finally {reviewer.dispose();}
});

test("config inherits primary effort for the optional role and accepts overrides or disablement", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "advisor-fallback-config-"));
  try {
    expect((await loadEngAdvisorConfig(dir)).fallback).toEqual({model: "@advisor_fallback", thinking: "low"});
    await writeFile(path.join(dir, "eng-advisor.json"), JSON.stringify({thinking: "medium", fallback: {model: "@advisor_fallback", thinking: "max"}}));
    const loaded = await loadEngAdvisorConfig(dir);
    expect(loaded.thinking).toBe("medium");
    expect(loaded.fallback).toEqual({model: "@advisor_fallback", thinking: "max"});
    await writeFile(path.join(dir, "eng-advisor.json"), JSON.stringify({thinking: "high", fallback: {model: "@alternative"}}));
    expect((await loadEngAdvisorConfig(dir)).fallback).toEqual({model: "@alternative", thinking: "high"});
    await writeFile(path.join(dir, "eng-advisor.json"), JSON.stringify({fallback: null}));
    expect((await loadEngAdvisorConfig(dir)).fallback).toBeUndefined();
  } finally {await rm(dir, {recursive: true, force: true});}
});


test("an unavailable primary starts on the resolved alternative", async () => {
  const {reviewer, calls} = harness(["report", "stop"], {resolvePrimary: false});
  try {
    expect(reviewer.modelStatus).toContain("test-alternative/fallback:max (fallback: primary unavailable");
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.every(c => c.id === "fallback" && c.effort === "max")).toBe(true);
  } finally {reviewer.dispose();}
});

test("a duplicate alternative is reported and never retried", async () => {
  const {reviewer, calls} = harness(["usage_limit_reached"], {duplicate: true});
  try {
    expect(reviewer.fallbackStatus).toContain("duplicates primary; skipped");
    await expect(reviewer.review({batch, openFindings: []})).rejects.toThrow();
    expect(calls).toHaveLength(1);
  } finally {reviewer.dispose();}
});

test("an unresolved optional role leaves a healthy primary usable", async () => {
  const {reviewer, calls} = harness(["report", "stop"], {resolveFallback: false});
  try {
    expect(reviewer.fallbackStatus).toContain("unavailable; optional");
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.every(c => c.id === "primary")).toBe(true);
  } finally {reviewer.dispose();}
});

test("an unavailable primary and alternative fail during initialization", () => {
  expect(() => harness([], {resolvePrimary: false, resolveFallback: false})).toThrow("could not be resolved");
});
