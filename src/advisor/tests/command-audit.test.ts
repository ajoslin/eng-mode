import { expect, spyOn, test } from "bun:test";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { InProcessReviewer } from "../reviewer";
import * as policy from "../policy";
import { restoreState } from "../state";
import { findingIdentityKey } from "../finding-identity";
import { ENG_ADVISOR_FINDING_STATE_TYPE, type DurableFinding, type ProposedFinding } from "../types";
import { selectionCommands } from "./command-harness";

function entry(id: string): SessionEntry {
  return {type: "message", id, parentId: null, timestamp: new Date().toISOString(), message: {role: "user", content: [{type: "text", text: `Inspect the unchecked input ${id}.`}], timestamp: Date.now()}} as SessionEntry;
}

function proposal(resource = "advisor/index.ts"): ProposedFinding {
  return {category: "type-contract", resource, evidence: [{source: "repository", locator: `${resource}:1`, quote: 'import * as path from "node:path";', claim: "The external value needs validation."}], note: "Validate the external value before narrowing it.", severity: "concern", status: "open"};
}

function savedFinding(resource: string): SessionEntry {
  const p = proposal(resource);
  const finding: DurableFinding = {...p, key: findingIdentityKey(p), evidenceDigest: "fixture", firstSeenAt: 1, lastSeenAt: 1, lastEmittedAt: 1, lastEmittedReview: 1, occurrences: 1};
  return {type: "custom", id: resource, parentId: null, timestamp: new Date().toISOString(), customType: ENG_ADVISOR_FINDING_STATE_TYPE, data: {version: 2, finding}} as SessionEntry;
}

test("refresh works while paused and deliberately re-emits an unchanged open finding", async () => {
  const c = selectionCommands(true);
  const review = spyOn(InProcessReviewer.prototype, "review").mockResolvedValue([proposal()]);
  try {
    await c.run("off");
    await c.run("primary");
    c.entries.push(entry("first"));
    await c.run("review");await c.flush();
    expect(c.sent).toHaveLength(1);
    await c.run("refresh");await c.flush();
    expect(review).toHaveBeenCalledTimes(2);
    expect(c.sent).toHaveLength(2);
    expect(c.notices.at(-1)?.message).toContain("refresh completed");
    await c.run("status");
    expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: paused");
  } finally {review.mockRestore();}
});

test("refresh requested during a review runs afterward instead of being consumed by that review", async () => {
  const c = selectionCommands();
  let started!: () => void;let release!: () => void;
  const firstStarted = new Promise<void>(resolve => {started = resolve;});
  const firstRelease = new Promise<void>(resolve => {release = resolve;});
  const batches: string[] = [];
  const review = spyOn(InProcessReviewer.prototype, "review").mockImplementation(async options => {
    batches.push(options.batch.text);
    if (batches.length === 1) {started();await firstRelease;}
    return [];
  });
  try {
    await c.run("primary");await c.flush();
    c.entries.push(entry("first"));
    await c.run("review");const pending = c.flush();await firstStarted;
    await c.run("refresh");release();await pending;
    expect(batches).toHaveLength(2);
    expect(batches[1]).toBe(batches[0]);
    expect(c.notices.at(-1)?.message).toContain("refresh completed");
  } finally {release();review.mockRestore();}
});

test("refresh initializes an uninitialized advisor and reports empty input honestly", async () => {
  const c = selectionCommands();
  const review = spyOn(InProcessReviewer.prototype, "review").mockResolvedValue([]);
  try {
    await c.run("refresh");await c.flush();
    expect(c.notices.at(-1)?.message).toContain("no messages to refresh");
    expect(review).not.toHaveBeenCalled();
  } finally {review.mockRestore();}
});

test("reload restores primary preference without resetting findings or unpausing", async () => {
  const c = selectionCommands();
  c.entries.push(savedFinding("fixture/reload"));
  await c.emit("session_start", {});
  await c.run("off");await c.run("fallback");await c.run("reload");
  expect(c.notices.at(-1)?.message).toBe("Eng-Advisor configuration reloaded");
  expect(c.callbacks).toHaveLength(0);
  await c.run("status");
  const status = c.notices.at(-1)?.message ?? "";
  expect(status).toContain("Role: main");
  expect(status).toStartWith("Eng-Advisor: paused");
  expect(status).toContain("Active model: test-primary/primary:");
  expect(status).toContain("Open findings: 1");
});

test("failed reload preserves a working fallback", async () => {
  const c = selectionCommands();
  await c.run("off");await c.run("fallback");
  c.available.primary = false;c.available.fallback = false;
  await c.run("reload");
  expect(c.notices.at(-1)?.level).toBe("warning");
  expect(c.callbacks).toHaveLength(0);
  await c.run("show");
  expect(c.notices.at(-1)?.message).toContain("Active model: test-fallback/fallback:");
});

test("dismiss requires a unique prefix and persists the chosen dismissal across session restore", async () => {
  const c = selectionCommands();
  const groups = new Map<string, string[]>();
  for (let i = 0; i < 17; i++) {
    const resource = `fixture/${i}`;const key = findingIdentityKey(proposal(resource));
    const group = groups.get(key[0]!) ?? [];group.push(resource);groups.set(key[0]!, group);
  }
  const pair = [...groups.values()].find(g => g.length > 1)!;
  c.entries.push(savedFinding(pair[0]!), savedFinding(pair[1]!));
  await c.emit("session_start", {});
  const firstKey = findingIdentityKey(proposal(pair[0]!));
  for (const args of ["dismiss", "dismiss no-match", `dismiss ${firstKey[0]}`]) {
    await c.run(args);
    expect(c.notices.at(-1)?.level).toBe("warning");
    expect(c.writes).toHaveLength(0);
  }
  await c.run(`dismiss ${firstKey.slice(0, 12)}`);
  expect(c.writes).toHaveLength(1);
  expect(c.notices.at(-1)?.message).toContain("Dismissed");
  expect(restoreState(c.entries).findings.find(f => f.key === firstKey)?.status).toBe("dismissed");
  await c.emit("session_start", {});await c.run("status");
  expect(c.notices.at(-1)?.message).toContain("Open findings: 1");
});

test("dismiss completion follows restored open findings and removes dismissed choices", async () => {
  const c = selectionCommands();
  c.entries.push(savedFinding("fixture/first"), savedFinding("fixture/second"));
  await c.emit("session_start", {});
  const firstKey = findingIdentityKey(proposal("fixture/first"));
  const choices = c.complete("dismiss ") ?? [];
  expect(choices).toHaveLength(2);
  expect(choices.find(item => item.value === `dismiss ${firstKey} `)?.description).toContain("Validate the external value");
  expect(c.complete(`dismiss ${firstKey.slice(0, 8).toUpperCase()}`)?.map(item => item.value)).toEqual([`dismiss ${firstKey} `]);
  expect(c.writes).toHaveLength(0);
  await c.run(`dismiss ${firstKey}`);
  expect(c.complete(`dismiss ${firstKey}`)).toBeNull();
  expect(c.complete("dismiss ")).toHaveLength(1);
});

test("on recovers from initialization failure and resumes pending material", async () => {
  const c = selectionCommands();
  const review = spyOn(InProcessReviewer.prototype, "review").mockResolvedValue([]);
  try {
    c.available.primary = false;c.available.fallback = false;
    await c.emit("session_start", {});
    expect(c.notices.at(-1)?.message).toContain("disabled");
    c.available.primary = true;c.entries.push(entry("pending"));
    await c.run("on");await c.flush();
    expect(review).toHaveBeenCalledTimes(1);
    await c.run("status");
    expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: enabled");
  } finally {review.mockRestore();}
});

test.each(["off", "reload"])("%s discards a result still undergoing evidence validation", async command => {
  const c = selectionCommands(true);
  let started!: () => void;let release!: () => void;
  const policyStarted = new Promise<void>(resolve => {started = resolve;});
  const policyRelease = new Promise<void>(resolve => {release = resolve;});
  const applyPolicy = policy.applyFindingPolicy;
  const apply = spyOn(policy, "applyFindingPolicy").mockImplementation(async options => {
    started();await policyRelease;
    return applyPolicy(options);
  });
  const review = spyOn(InProcessReviewer.prototype, "review").mockResolvedValue([proposal()]);
  try {
    await c.run("off");await c.run("primary");c.entries.push(entry("pending"));
    await c.run("review");const pending = c.flush();await policyStarted;
    await c.run(command);release();await pending;
    expect(c.sent).toHaveLength(command === "off" ? 0 : 1);
    expect(c.writes).toHaveLength(command === "off" ? 0 : 2);
    expect(review).toHaveBeenCalledTimes(command === "off" ? 1 : 2);
    await c.run("status");
    expect(c.notices.at(-1)?.message).toContain(`reviews: ${command === "off" ? 0 : 1}`);
  } finally {release();apply.mockRestore();review.mockRestore();}
});

test("dismissal during evidence validation wins over the pending refresh", async () => {
  const c = selectionCommands(true);
  const review = spyOn(InProcessReviewer.prototype, "review").mockResolvedValue([proposal()]);
  let release!: () => void;
  let apply: ReturnType<typeof spyOn<typeof policy, "applyFindingPolicy">> | undefined;
  try {
    await c.run("off");await c.run("primary");c.entries.push(entry("pending"));
    await c.run("review");await c.flush();
    let started!: () => void;
    const policyStarted = new Promise<void>(resolve => {started = resolve;});
    const policyRelease = new Promise<void>(resolve => {release = resolve;});
    const applyPolicy = policy.applyFindingPolicy;
    apply = spyOn(policy, "applyFindingPolicy").mockImplementation(async options => {
      started();await policyRelease;
      return applyPolicy(options);
    });
    await c.run("refresh");const pending = c.flush();await policyStarted;
    const key = findingIdentityKey(proposal());
    await c.run(`dismiss ${key.slice(0, 12)}`);release();await pending;
    expect(c.sent).toHaveLength(1);
    expect(restoreState(c.entries).findings.find(f => f.key === key)?.status).toBe("dismissed");
    await c.run("status");
    expect(c.notices.at(-1)?.message).toContain("Open findings: 0");
  } finally {release?.();apply?.mockRestore();review.mockRestore();}
});
