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
import { InProcessReviewer, type AdvisorSelection } from "../reviewer";
import type { ReviewBatch } from "../types";

const config = await loadEngAdvisorConfig(path.resolve(import.meta.dir, ".."));
type Capability = "controlled" | "uncontrolled" | "none";
const model = (id: string, capability: Capability = "controlled"): Model => ({
  id, name: id, provider: id === "primary" ? "test-primary" : "test-alternative",
  api: "openai-responses", baseUrl: "https://example.invalid", reasoning: capability !== "none",
  ...(capability === "controlled" ? {thinking: {efforts: ["medium", "max"]}} : {}), input: ["text"],
  contextWindow: 1000000, maxTokens: 128000,
  cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
} as unknown as Model);
const batch: ReviewBatch = {messages: [], text: "Review the current work.", groundingText: new Map(), wip: false, cursor: 1};

function harness(outcomes: string[], {
  fallback = true, resolveFallback = true, resolvePrimary = true, duplicate = false,
  capability = "controlled", thinking = "medium", fallbackThinking = "max", selection,
}: {fallback?: boolean; resolveFallback?: boolean; resolvePrimary?: boolean; duplicate?: boolean; capability?: Capability; thinking?: "off" | "medium"; fallbackThinking?: "off" | "max"; selection?: AdvisorSelection} = {}) {
  const calls: Array<{id: string; effort: unknown; messages: string; disabled: boolean}> = [];
  const notices: Array<{message: string; level: string | undefined}> = [];
  const streamFn: StreamFn = (selected, context, options) => {
    calls.push({id: selected.id, effort: options?.reasoning, messages: JSON.stringify(context.messages), disabled: options?.disableReasoning === true});
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
      if (name === "primary") return resolvePrimary ? model("primary", capability) : undefined;
      if (name === "fallback" && resolveFallback) return model(duplicate ? "primary" : "fallback", capability);
      return undefined;
    }},
    sessionManager: {getSessionId: () => "fallback-test"},
    modelRegistry: {resolver: () => "test-only"},
    ui: {notify: (message: string, level?: string) => notices.push({message, level})},
  } as unknown as ExtensionContext;
  const {fallback: _installedFallback, ...base} = config;
  const reviewer = new InProcessReviewer({
    pi: {zod} as AdvisorExtensionAPI, ctx, instructions: "Repository authority still applies.", streamFn, ...(selection ? {selection} : {}),
    config: {...base, model: "primary", thinking, ...(fallback ? {fallback: {model: "fallback", thinking: fallbackThinking}} : {})},
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

test.each(["maximum context length exceeded", "connection timed out", "invalid tool schema", "content policy violation"])("does not switch providers for %s", async error => {
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


test.each([
  {capability: "uncontrolled" as const, thinking: "medium" as const, fallbackThinking: "max" as const, label: "model default", disabled: false},
  {capability: "none" as const, thinking: "medium" as const, fallbackThinking: "max" as const, label: "unsupported", disabled: false},
  {capability: "controlled" as const, thinking: "off" as const, fallbackThinking: "off" as const, label: "off", disabled: true},
])("status distinguishes $label from explicit reasoning disablement", async scenario => {
  const {reviewer, calls} = harness(["usage_limit_reached", "report", "stop"], scenario);
  try {
    expect(reviewer.modelStatus).toContain(`primary:${scenario.label} (primary)`);
    expect(reviewer.fallbackStatus).toContain(`fallback:${scenario.label}`);
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(reviewer.modelStatus).toContain(`fallback:${scenario.label} (fallback`);
    expect(calls.every(c => c.disabled === scenario.disabled)).toBe(true);
  } finally {reviewer.dispose();}
});


test.each(["Invalid API key", "401 Unauthorized", "invalid_grant: refresh token has expired"])("authentication failure stays visible while fallback completes: %s", async error => {
  const {reviewer, calls, notices} = harness([error, "report", "stop", "report", "stop"]);
  try {
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.map(c => c.id)).toEqual(["primary", "fallback", "fallback"]);
    expect(calls[1]?.messages).not.toContain(error);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.level).toBe("warning");
    expect(notices[0]?.message).toContain("authentication failed");
    expect(notices[0]?.message).toContain("test-primary/primary");
    expect(notices[0]?.message).toContain("credentials");
    expect(reviewer.modelStatus).toContain("fallback: authentication failure on test-primary/primary");
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.filter(c => c.id === "primary")).toHaveLength(1);
    expect(notices).toHaveLength(1);
    expect(reviewer.modelStatus).toContain("authentication failure");
  } finally {reviewer.dispose();}
});

test("authentication warning does not echo provider error contents", async () => {
  const sensitive = "fixture-secret-not-for-display";
  const {reviewer, notices} = harness([`Invalid API key: ${sensitive}`, "report", "stop"]);
  try {
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(notices[0]?.message).toContain("authentication failed");
    expect(notices[0]?.message).not.toContain(sensitive);
    expect(reviewer.modelStatus).not.toContain(sensitive);
  } finally {reviewer.dispose();}
});

test("authentication fallback failure remains a failure with the primary warning retained", async () => {
  const {reviewer, calls, notices} = harness(["Invalid API key", "usage_limit_reached"]);
  try {
    await expect(reviewer.review({batch, openFindings: []})).rejects.toThrow();
    expect(calls.map(c => c.id)).toEqual(["primary", "fallback"]);
    expect(notices[0]?.level).toBe("warning");
    expect(reviewer.modelStatus).toContain("authentication failure");
  } finally {reviewer.dispose();}
});


test("manual fallback uses its own effort even while the primary is available", async () => {
  const {reviewer, calls} = harness(["report", "stop"], {selection: "fallback"});
  try {
    expect(reviewer.modelStatus).toContain("fallback:max (fallback: manual selection");
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.every(c => c.id === "fallback" && c.effort === "max")).toBe(true);
  } finally {reviewer.dispose();}
});

test("manual primary selection keeps automatic recovery available", async () => {
  const {reviewer, calls} = harness(["usage_limit_reached", "report", "stop"], {selection: "primary"});
  try {
    expect(reviewer.modelStatus).toContain("primary:medium (primary)");
    expect(await reviewer.review({batch, openFindings: []})).toEqual([]);
    expect(calls.map(c => c.id)).toEqual(["primary", "fallback", "fallback"]);
  } finally {reviewer.dispose();}
});

test("a disabled fallback cannot be selected manually", () => {
  expect(() => harness([], {fallback: false, selection: "fallback"})).toThrow("Fallback is disabled");
});
