import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { agentNames, playbookNames, skillNames } from "./manifest.ts";

const id = z.string().min(1);
const sourceRefSchema = z.object({ id, path: id, heading: id }).strict();
const actorSchema = z.object({ id }).strict();
const stateSchema = z.object({ id, terminal: z.boolean().optional(), resumable: z.boolean().optional() }).strict();
const namedSchema = z.object({ id }).strict();
const mutationSchema = z.object({ id, owner: id }).strict();
const authoritySchema = z.object({ id, actor: id, mutation: id }).strict();
const laneSchema = z.object({ actor: id, evidence: id }).strict();
const verificationSchema = z.object({
  implementationActor: id,
  headEvidence: id,
  baseEvidence: id,
  patchIdentityEvidence: id,
  lanes: z.array(laneSchema).min(3),
}).strict();
const stackReadySchema = z.object({ state: id, requiredEvidence: z.array(id).min(1), requiredMutation: id }).strict();
const babysitSchema = z.object({ actor: id, forbiddenMutations: z.array(id), forbiddenCapabilities: z.array(id) }).strict();
const capabilityOwnerSchema = z.enum(["provider", "external-skill", "graphite"]);
const capabilitySchema = z.object({
  id,
  owner: capabilityOwnerSchema,
  delegatesTo: id.optional(),
  external: z.boolean().optional(),
  confirmationEvidence: z.array(id).min(1),
}).strict();
const providerSchema = z.object({
  id,
  sourceRef: id,
  capabilities: z.array(capabilitySchema),
  requirements: z.array(id),
}).strict();
const referencesSchema = z.object({
  skills: z.array(id),
  agents: z.array(id),
  playbooks: z.array(id),
  tools: z.array(id),
}).strict();
const transitionSchema = z.object({
  id,
  from: id,
  to: id,
  actor: id,
  mutation: id.optional(),
  authority: id.optional(),
  evidence: z.array(id).optional(),
}).strict();
const workflowLawSchema = z.object({
  version: z.literal(1),
  sourceRefs: z.array(sourceRefSchema),
  actors: z.array(actorSchema),
  states: z.array(stateSchema),
  tools: z.array(namedSchema),
  evidence: z.array(namedSchema),
  mutations: z.array(mutationSchema),
  authorities: z.array(authoritySchema),
  verification: verificationSchema,
  stackReady: stackReadySchema,
  babysit: babysitSchema,
  providers: z.array(providerSchema),
  references: referencesSchema,
  transitions: z.array(transitionSchema),
}).strict();

export type WorkflowLaw = z.infer<typeof workflowLawSchema>;
export type WorkflowTransition = WorkflowLaw["transitions"][number];

export interface SourceInventory {
  readonly root: string;
  readonly files: ReadonlyMap<string, string>;
  readonly skills: ReadonlySet<string>;
  readonly agents: ReadonlySet<string>;
  readonly playbooks: ReadonlySet<string>;
  readonly tools: ReadonlySet<string>;
}

export interface WorkflowDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly manifestPath: string;
  readonly sourceRef?: { readonly path: string; readonly heading: string };
}

export type ParseWorkflowLawResult =
  | { readonly ok: true; readonly law: WorkflowLaw }
  | { readonly ok: false; readonly diagnostics: readonly WorkflowDiagnostic[] };

export interface TransitionContext {
  readonly actor: string;
  readonly evidence: readonly string[];
  readonly authorities: readonly string[];
  readonly previousHead?: string;
  readonly currentHead?: string;
  readonly patchIdentityProven?: boolean;
}

export type TransitionValidationResult =
  | { readonly ok: true; readonly transition: WorkflowTransition }
  | { readonly ok: false; readonly diagnostics: readonly WorkflowDiagnostic[] };

const manifestPath = "workflow-law.yml";
const requiredProviderCapabilities = [
  "snapshot", "watch", "rearm", "frozen-queue", "arm-confirmation",
  "topology", "merge-when-ready-request", "disarm", "compare-head-base",
] as const;

function diagnostic(code: string, message: string, path = manifestPath): WorkflowDiagnostic {
  return { code, message, manifestPath: path };
}

function ids<T extends { readonly id: string }>(entries: readonly T[]): Set<string> {
  return new Set(entries.map((entry) => entry.id));
}

function duplicateDiagnostics<T extends { readonly id: string }>(kind: string, entries: readonly T[]): WorkflowDiagnostic[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) duplicates.add(entry.id);
    seen.add(entry.id);
  }
  return [...duplicates].sort().map((entry) => diagnostic("duplicate-id", `${kind} id ${entry} is declared more than once`));
}

function exactHeadingExists(text: string, heading: string): boolean {
  return text.split(/\r?\n/u).some((line) => /^#{1,6}\s+(.+?)\s*$/u.exec(line)?.[1] === heading);
}

export function parseWorkflowLaw(text: string): ParseWorkflowLawResult {
  let input: unknown;
  try {
    input = parseYaml(text);
  } catch (error) {
    return { ok: false, diagnostics: [diagnostic("yaml-invalid", error instanceof Error ? error.message : String(error))] };
  }
  const result = workflowLawSchema.safeParse(input);
  if (result.success) return { ok: true, law: result.data };
  const diagnostics = result.error.issues.map((issue) => diagnostic(
    "schema-invalid",
    `${issue.path.join(".") || "root"}: ${issue.message}`,
  ));
  return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function validateWorkflowLaw(law: WorkflowLaw, inventory: SourceInventory): readonly WorkflowDiagnostic[] {
  const diagnostics: WorkflowDiagnostic[] = [];
  diagnostics.push(
    ...duplicateDiagnostics("sourceRef", law.sourceRefs),
    ...duplicateDiagnostics("actor", law.actors),
    ...duplicateDiagnostics("state", law.states),
    ...duplicateDiagnostics("tool", law.tools),
    ...duplicateDiagnostics("evidence", law.evidence),
    ...duplicateDiagnostics("mutation", law.mutations),
    ...duplicateDiagnostics("authority", law.authorities),
    ...duplicateDiagnostics("provider", law.providers),
    ...duplicateDiagnostics("transition", law.transitions),
  );

  const actorIds = ids(law.actors);
  const stateIds = ids(law.states);
  const evidenceIds = ids(law.evidence);
  const mutationIds = ids(law.mutations);
  const authorityIds = ids(law.authorities);
  const toolIds = ids(law.tools);
  const sourceRefIds = ids(law.sourceRefs);
  const terminalStates = new Set(law.states.filter((state) => state.terminal).map((state) => state.id));
  const resumableStates = new Set(law.states.filter((state) => state.resumable).map((state) => state.id));

  const requireDeclared = (kind: string, value: string, declared: ReadonlySet<string>, owner: string): void => {
    if (!declared.has(value)) diagnostics.push(diagnostic(`undefined-${kind}`, `${owner} references undefined ${kind} ${value}`));
  };

  for (const ref of law.sourceRefs) {
    const text = inventory.files.get(ref.path);
    if (text === undefined) {
      diagnostics.push(diagnostic("source-path-missing", `source reference ${ref.id} path does not exist: ${ref.path}`));
    } else if (!exactHeadingExists(text, ref.heading)) {
      diagnostics.push({
        ...diagnostic("source-heading-missing", `source reference ${ref.id} heading does not exist exactly once: ${ref.heading}`),
        sourceRef: { path: ref.path, heading: ref.heading },
      });
    }
  }

  for (const mutation of law.mutations) requireDeclared("actor", mutation.owner, actorIds, `mutation ${mutation.id}`);
  for (const authority of law.authorities) {
    requireDeclared("actor", authority.actor, actorIds, `authority ${authority.id}`);
    requireDeclared("mutation", authority.mutation, mutationIds, `authority ${authority.id}`);
  }

  requireDeclared("actor", law.verification.implementationActor, actorIds, "verification");
  requireDeclared("evidence", law.verification.headEvidence, evidenceIds, "verification");
  requireDeclared("evidence", law.verification.baseEvidence, evidenceIds, "verification");
  requireDeclared("evidence", law.verification.patchIdentityEvidence, evidenceIds, "verification");
  const verifierActors = new Set<string>();
  for (const lane of law.verification.lanes) {
    requireDeclared("actor", lane.actor, actorIds, "verification lane");
    requireDeclared("evidence", lane.evidence, evidenceIds, "verification lane");
    if (lane.actor === law.verification.implementationActor) {
      diagnostics.push(diagnostic("verifier-owner-collision", `implementation actor ${lane.actor} cannot independently verify its own work`));
    }
    if (verifierActors.has(lane.actor)) diagnostics.push(diagnostic("verification-lanes-not-independent", `verification actor ${lane.actor} owns more than one lane`));
    verifierActors.add(lane.actor);
  }
  if (law.verification.lanes.length !== 3) diagnostics.push(diagnostic("verification-lane-count", "VERIFIED must contain exactly three independent lanes"));

  requireDeclared("state", law.stackReady.state, stateIds, "stackReady");
  requireDeclared("mutation", law.stackReady.requiredMutation, mutationIds, "stackReady");
  for (const evidence of law.stackReady.requiredEvidence) requireDeclared("evidence", evidence, evidenceIds, "stackReady");
  const stackEvidence = new Set(law.stackReady.requiredEvidence);
  const requiredStackEvidence = [
    law.verification.headEvidence,
    ...law.verification.lanes.map((lane) => lane.evidence),
    "babysit-merge-ready", "pr-posted-verdict", "topology-append-receipt", "root-countersign",
  ];
  for (const evidence of requiredStackEvidence) {
    if (!stackEvidence.has(evidence)) diagnostics.push(diagnostic("stack-ready-incomplete", `STACK-READY is missing required evidence ${evidence}`));
  }

  requireDeclared("actor", law.babysit.actor, actorIds, "babysit");
  for (const mutation of law.babysit.forbiddenMutations) requireDeclared("mutation", mutation, mutationIds, "babysit");
  if (!law.babysit.forbiddenMutations.includes("merge") || !law.babysit.forbiddenMutations.includes("topology-append")) {
    diagnostics.push(diagnostic("babysit-authority", "Babysit must forbid merge and topology mutation"));
  }
  for (const capability of ["merge-when-ready-request", "force-push", "restack"]) {
    if (!law.babysit.forbiddenCapabilities.includes(capability)) diagnostics.push(diagnostic("babysit-authority", `Babysit must forbid capability ${capability}`));
  }

  const mergeMutation = law.mutations.find((mutation) => mutation.id === "merge");
  if (!mergeMutation || mergeMutation.owner !== "shipping") diagnostics.push(diagnostic("merge-owner-invalid", "merge mutation must have exactly one owner: shipping"));
  const mergeAuthorities = law.authorities.filter((authority) => authority.mutation === "merge");
  if (mergeAuthorities.length !== 1 || mergeAuthorities[0]?.actor !== "shipping") diagnostics.push(diagnostic("merge-authority-invalid", "merge must have exactly one Shipping authority"));

  for (const provider of law.providers) {
    requireDeclared("sourceRef", provider.sourceRef, sourceRefIds, `provider ${provider.id}`);
    const capabilities = ids(provider.capabilities);
    for (const capability of provider.capabilities) {
      if (capability.confirmationEvidence.length === 0) diagnostics.push(diagnostic("provider-confirmation-missing", `provider ${provider.id} capability ${capability.id} has no confirmation evidence`));
      for (const evidence of capability.confirmationEvidence) requireDeclared("evidence", evidence, evidenceIds, `provider ${provider.id} capability ${capability.id}`);
      if (capability.external && capability.owner !== "external-skill") diagnostics.push(diagnostic("provider-external-owner-invalid", `provider ${provider.id} capability ${capability.id} is external but not owned by external-skill`));
      if (capability.owner === "external-skill" && !capability.delegatesTo) diagnostics.push(diagnostic("provider-delegate-missing", `provider ${provider.id} capability ${capability.id} must name delegatesTo`));
    }
    for (const required of requiredProviderCapabilities) {
      if (!provider.requirements.includes(required) || !capabilities.has(required)) diagnostics.push(diagnostic("provider-capability-missing", `provider ${provider.id} is missing required capability ${required}`));
    }
    for (const required of provider.requirements) {
      if (!capabilities.has(required)) diagnostics.push(diagnostic("provider-capability-missing", `provider ${provider.id} requires undeclared capability ${required}`));
    }
  }

  for (const transition of law.transitions) {
    requireDeclared("state", transition.from, stateIds, `transition ${transition.id}`);
    requireDeclared("state", transition.to, stateIds, `transition ${transition.id}`);
    requireDeclared("actor", transition.actor, actorIds, `transition ${transition.id}`);
    if (transition.mutation) requireDeclared("mutation", transition.mutation, mutationIds, `transition ${transition.id}`);
    if (transition.authority) requireDeclared("authority", transition.authority, authorityIds, `transition ${transition.id}`);
    for (const evidence of transition.evidence ?? []) requireDeclared("evidence", evidence, evidenceIds, `transition ${transition.id}`);
    if (terminalStates.has(transition.from)) diagnostics.push(diagnostic("terminal-has-outgoing", `terminal state ${transition.from} has outgoing transition ${transition.id}`));
    if (transition.mutation) {
      const mutation = law.mutations.find((entry) => entry.id === transition.mutation);
      if (mutation && mutation.owner !== transition.actor) diagnostics.push(diagnostic("mutation-owner-mismatch", `transition ${transition.id} actor ${transition.actor} does not own mutation ${transition.mutation}`));
    }
    if (transition.mutation === "merge") {
      const authority = transition.authority ? law.authorities.find((entry) => entry.id === transition.authority) : undefined;
      if (!authority || authority.actor !== transition.actor || authority.mutation !== "merge") diagnostics.push(diagnostic("merge-without-authority", `transition ${transition.id} merges without matching explicit authority`));
    }
  }
  for (const state of resumableStates) {
    if (terminalStates.has(state)) diagnostics.push(diagnostic("resumable-terminal", `state ${state} cannot be both resumable and terminal`));
    if (!law.transitions.some((transition) => transition.from === state)) diagnostics.push(diagnostic("resumable-without-exit", `resumable state ${state} has no outgoing transition`));
  }

  for (const tool of law.references.tools) {
    if (!toolIds.has(tool) || !inventory.tools.has(tool)) diagnostics.push(diagnostic("undefined-tool", `reference names undefined registered tool ${tool}`));
  }
  for (const skill of law.references.skills) if (!inventory.skills.has(skill)) diagnostics.push(diagnostic("undefined-skill", `reference names undefined skill ${skill}`));
  for (const agent of law.references.agents) if (!inventory.agents.has(agent)) diagnostics.push(diagnostic("undefined-agent", `reference names undefined agent ${agent}`));
  for (const playbook of law.references.playbooks) if (!inventory.playbooks.has(playbook)) diagnostics.push(diagnostic("undefined-playbook", `reference names undefined playbook ${playbook}`));

  return sortDiagnostics(diagnostics);
}

export function validateTransition(law: WorkflowLaw, transitionId: string, context: TransitionContext): TransitionValidationResult {
  const transition = law.transitions.find((entry) => entry.id === transitionId);
  if (!transition) return { ok: false, diagnostics: [diagnostic("transition-undefined", `transition ${transitionId} is not declared`)] };
  const diagnostics: WorkflowDiagnostic[] = [];
  if (transition.actor !== context.actor) diagnostics.push(diagnostic("transition-actor-invalid", `transition ${transitionId} requires actor ${transition.actor}, received ${context.actor}`));
  const suppliedEvidence = new Set(context.evidence);
  for (const evidence of transition.evidence ?? []) if (!suppliedEvidence.has(evidence)) diagnostics.push(diagnostic("transition-evidence-missing", `transition ${transitionId} requires evidence ${evidence}`));
  if (transition.authority && !context.authorities.includes(transition.authority)) diagnostics.push(diagnostic("transition-authority-missing", `transition ${transitionId} requires authority ${transition.authority}`));
  if (context.previousHead !== undefined && context.currentHead !== undefined && context.previousHead !== context.currentHead && !context.patchIdentityProven) {
    diagnostics.push(diagnostic("stale-sha-verdict", `transition ${transitionId} cannot reuse evidence from ${context.previousHead} at ${context.currentHead} without patch identity proof`));
  }
  return diagnostics.length === 0 ? { ok: true, transition } : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function buildSourceInventory(root: string): SourceInventory {
  const absoluteRoot = resolve(root);
  const files = new Map<string, string>();
  const walk = (relative: string): void => {
    const absolute = join(absoluteRoot, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) files.set(child, readFileSync(join(absoluteRoot, child), "utf8"));
    }
  };
  walk("skills");
  return {
    root: absoluteRoot,
    files,
    skills: new Set<string>([...skillNames, "better-github-skill"]),
    agents: new Set<string>(agentNames),
    playbooks: new Set<string>(playbookNames),
    tools: new Set(["goal", "loop", "eng_orch"]),
  };
}

export function loadAndValidateWorkflowLaw(root: string): { readonly law?: WorkflowLaw; readonly diagnostics: readonly WorkflowDiagnostic[] } {
  const absoluteRoot = resolve(root);
  let text: string;
  try {
    text = readFileSync(join(absoluteRoot, manifestPath), "utf8");
  } catch (error) {
    return { diagnostics: [diagnostic("manifest-unreadable", error instanceof Error ? error.message : String(error))] };
  }
  const parsed = parseWorkflowLaw(text);
  if (!parsed.ok) return { diagnostics: parsed.diagnostics };
  const diagnostics = validateWorkflowLaw(parsed.law, buildSourceInventory(absoluteRoot));
  return diagnostics.length === 0 ? { law: parsed.law, diagnostics } : { diagnostics };
}

export function sortDiagnostics(diagnostics: readonly WorkflowDiagnostic[]): readonly WorkflowDiagnostic[] {
  return [...diagnostics].sort((left, right) =>
    left.code.localeCompare(right.code) || left.manifestPath.localeCompare(right.manifestPath) || left.message.localeCompare(right.message)
  );
}
