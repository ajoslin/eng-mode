import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildSourceInventory,
  parseWorkflowLaw,
  validateTransition,
  validateWorkflowLaw,
} from "./workflow-law.ts";
import type { WorkflowLaw } from "./workflow-law.ts";

const root = join(import.meta.dir, "..");
const manifestPath = join(root, "workflow-law.yml");

async function validLaw(): Promise<WorkflowLaw> {
  const parsed = parseWorkflowLaw(await readFile(manifestPath, "utf8"));
  if (!parsed.ok) throw new Error(parsed.diagnostics.map((item) => item.message).join("\n"));
  return parsed.law;
}

function codes(law: WorkflowLaw): string[] {
  return validateWorkflowLaw(law, buildSourceInventory(root)).map((item) => item.code);
}

describe("workflow law", () => {
  it("validates the repository manifest", async () => {
    expect(codes(await validLaw())).toEqual([]);
  });

  it("rejects Babysit merge authority and topology mutation", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    unsafe.babysit.forbiddenMutations = [];
    unsafe.babysit.forbiddenCapabilities = [];
    expect(codes(unsafe)).toContain("babysit-authority");
  });

  it("rejects Shipping merge without explicit authority", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    const land = unsafe.transitions.find((item) => item.id === "land-independent");
    if (land) delete land.authority;
    expect(codes(unsafe)).toContain("merge-without-authority");
  });

  it("rejects implementation and verification actor collision", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    const lane = unsafe.verification.lanes[0];
    if (lane) lane.actor = unsafe.verification.implementationActor;
    expect(codes(unsafe)).toContain("verifier-owner-collision");
  });

  it("rejects stale SHA evidence without patch identity", async () => {
    const law = await validLaw();
    const result = validateTransition(law, "land-independent", {
      actor: "shipping",
      authorities: ["merge-authority"],
      evidence: ["head-sha", "base-sha", "repository-gates", "live-surface", "receipts-diff", "provider-arm-confirmation"],
      previousHead: "old",
      currentHead: "new",
      patchIdentityProven: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((item) => item.code)).toContain("stale-sha-verdict");
  });

  it("allows a changed SHA only with patch identity proof", async () => {
    const law = await validLaw();
    expect(validateTransition(law, "land-independent", {
      actor: "shipping",
      authorities: ["merge-authority"],
      evidence: ["head-sha", "base-sha", "repository-gates", "live-surface", "receipts-diff", "babysit-merge-ready", "pr-posted-verdict", "root-countersign", "provider-arm-confirmation"],
      previousHead: "old",
      currentHead: "new",
      patchIdentityProven: true,
    }).ok).toBe(true);
  });

  it("rejects incomplete STACK-READY evidence", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    unsafe.stackReady.requiredEvidence = ["head-sha"];
    expect(codes(unsafe)).toContain("stack-ready-incomplete");
  });

  it("rejects outgoing transitions from terminal states", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    unsafe.transitions.push({ id: "resurrect", from: "landed", to: "building", actor: "lead" });
    expect(codes(unsafe)).toContain("terminal-has-outgoing");
  });

  it("rejects undefined actor, state, evidence, mutation, and tool references", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    unsafe.transitions.push({
      id: "undefined-all",
      from: "missing-state",
      to: "building",
      actor: "missing-actor",
      mutation: "missing-mutation",
      evidence: ["missing-evidence"],
    });
    unsafe.references.tools.push("orch");
    expect(new Set(codes(unsafe))).toEqual(new Set([
      "undefined-state", "undefined-actor", "undefined-mutation", "undefined-evidence", "undefined-tool",
    ]));
  });

  it("rejects duplicate mutation ownership declarations", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    unsafe.mutations.push({ id: "merge", owner: "coordinator" });
    expect(codes(unsafe)).toContain("duplicate-id");
  });

  it("rejects every missing provider capability or confirmation receipt", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    const provider = unsafe.providers[0];
    if (!provider) throw new Error("provider fixture missing");
    provider.capabilities = provider.capabilities.filter((item) => item.id !== "watch");
    const snapshot = provider.capabilities.find((item) => item.id === "snapshot");
    if (snapshot) snapshot.confirmationEvidence = [];
    expect(codes(unsafe)).toEqual(expect.arrayContaining(["provider-capability-missing", "provider-confirmation-missing"]));
  });

  it("rejects unknown provider delegate skills", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    const provider = unsafe.providers[0];
    const capability = provider?.capabilities.find((item) => item.delegatesTo !== undefined);
    if (!capability) throw new Error("delegated capability fixture missing");
    capability.delegatesTo = "missing-skill";
    expect(codes(unsafe)).toContain("provider-delegate-undefined");
  });

  it("requires independent landing readiness evidence", async () => {
    const law = await validLaw();
    const result = validateTransition(law, "land-independent", {
      actor: "shipping",
      authorities: ["merge-authority"],
      evidence: ["head-sha", "base-sha", "repository-gates", "live-surface", "receipts-diff", "provider-arm-confirmation"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((item) => item.code)).toEqual([
      "transition-evidence-missing", "transition-evidence-missing", "transition-evidence-missing",
    ]);
  });

  it("rejects missing source paths and exact headings", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    unsafe.sourceRefs.push({ id: "missing-path", path: "skills/nope/SKILL.md", heading: "Nope" });
    const source = unsafe.sourceRefs[0];
    if (source) source.heading = "Not the Eng Mode heading";
    expect(codes(unsafe)).toEqual(expect.arrayContaining(["source-path-missing", "source-heading-missing"]));
  });

  it("rejects undefined skill, agent, and playbook references", async () => {
    const law = await validLaw();
    const unsafe = structuredClone(law);
    unsafe.references.skills.push("missing-skill");
    unsafe.references.agents.push("missing-agent");
    unsafe.references.playbooks.push("missing-playbook");
    expect(codes(unsafe)).toEqual(expect.arrayContaining(["undefined-skill", "undefined-agent", "undefined-playbook"]));
  });
});
