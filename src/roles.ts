import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { type AgentName, agentModelChains, agentNames } from "./manifest.ts";

/**
 * Two-stage workstation role migration. Stage one (prepare) adds and validates
 * every new generic and panel role while retaining all old roles, so old and
 * new workflows coexist until the repository hard cut is proven. Stage two
 * (retire) deletes the four old `boja_*` keys only after no old workflow
 * consumer remains. Both stages are atomic over the config document and the
 * file runner restores the prior bytes on failure.
 */

export const genericRoleSources = {
  code: "boja_code",
  judgment: "boja_judgment",
  adversary: "boja_adversary",
  fast: "boja_fast",
} as const;

export const panelRoleNames = ["panel_opus", "panel_sol", "panel_fable", "panel_grok"] as const;
export type PanelRoleName = (typeof panelRoleNames)[number];

export const retiredRoleNames = ["boja_fast", "boja_code", "boja_judgment", "boja_adversary"] as const;
export const preservedRoleNames = ["smol", "review", "commit"] as const;

export interface RoleConflict {
  readonly role: string;
  readonly existing: string;
  readonly incoming: string;
}

export interface AgentChainResolution {
  readonly agent: AgentName;
  readonly chain: readonly string[];
  /** First chain entry whose role key resolves; null when nothing resolves. */
  readonly primary: string | null;
  /** True when the resolving entry is not the chain's first entry. */
  readonly fallback: boolean;
  readonly unresolved: readonly string[];
}

export interface PrepareRolesInput {
  readonly roles: Readonly<Record<string, string>>;
  /** Current pinned panel selectors, e.g. from the workstation's existing panel agents. */
  readonly panelSelectors?: Partial<Record<PanelRoleName, string>>;
}

export interface PrepareRolesResult {
  readonly status: "applied" | "conflict" | "needs-selection";
  /** Unchanged from the input unless status is `applied`. */
  readonly roles: Readonly<Record<string, string>>;
  readonly added: Readonly<Record<string, string>>;
  readonly conflicts: readonly RoleConflict[];
  /** Roles that require an explicit user selection; never invented. */
  readonly needsSelection: readonly string[];
  readonly invalid: readonly string[];
  readonly agentResolution: readonly AgentChainResolution[];
}

export interface RetireRolesResult {
  readonly status: "applied" | "blocked";
  readonly roles: Readonly<Record<string, string>>;
  readonly removed: readonly string[];
  readonly blockers: readonly string[];
}

export function resolveAgentChains(
  roles: Readonly<Record<string, string>>,
): AgentChainResolution[] {
  return agentNames.map((agent) => {
    const chain = agentModelChains[agent];
    const unresolved: string[] = [];
    let primary: string | null = null;
    for (const entry of chain) {
      const key = entry.startsWith("@") ? entry.slice(1) : entry;
      const value = roles[key];
      if (typeof value === "string" && value.trim().length > 0) {
        if (primary === null) primary = entry;
      } else {
        unresolved.push(entry);
      }
    }
    return { agent, chain, primary, fallback: primary !== null && primary !== chain[0], unresolved };
  });
}

export function prepareRoles(input: PrepareRolesInput): PrepareRolesResult {
  const roles = input.roles;
  const conflicts: RoleConflict[] = [];
  const needsSelection: string[] = [];
  const invalid: string[] = [];
  const added: Record<string, string> = {};

  const stage = (role: string, incoming: string | undefined) => {
    const existing = roles[role];
    const existingValid = typeof existing === "string" && existing.trim().length > 0;
    if (typeof existing === "string" && !existingValid) {
      invalid.push(role);
      return;
    }
    const incomingValid = typeof incoming === "string" && incoming.trim().length > 0;
    if (existingValid) {
      // An existing valid new value wins; a differing old/new pair is a conflict.
      if (incomingValid && incoming !== existing) {
        conflicts.push({ role, existing, incoming });
      }
      return;
    }
    if (incomingValid) {
      added[role] = incoming;
      return;
    }
    needsSelection.push(role);
  };

  for (const [role, source] of Object.entries(genericRoleSources)) {
    const old = roles[source];
    const oldValid = typeof old === "string" && old.trim().length > 0;
    if (typeof old === "string" && !oldValid) invalid.push(source);
    stage(role, oldValid ? old : undefined);
  }
  for (const role of panelRoleNames) {
    stage(role, input.panelSelectors?.[role]);
  }

  if (conflicts.length > 0 || invalid.length > 0) {
    return {
      status: "conflict",
      roles,
      added: {},
      conflicts,
      needsSelection,
      invalid,
      agentResolution: resolveAgentChains(roles),
    };
  }
  if (needsSelection.length > 0) {
    return {
      status: "needs-selection",
      roles,
      added: {},
      conflicts,
      needsSelection,
      invalid,
      agentResolution: resolveAgentChains(roles),
    };
  }
  const next = { ...roles, ...added };
  return {
    status: "applied",
    roles: next,
    added,
    conflicts,
    needsSelection,
    invalid,
    agentResolution: resolveAgentChains(next),
  };
}

/**
 * Delete the retired `boja_*` keys. `remainingConsumers` names any surviving
 * old-workflow reference discovered by the hard-cut proof; the stage refuses
 * to run while one remains.
 */
export function retireRoles(
  roles: Readonly<Record<string, string>>,
  remainingConsumers: readonly string[] = [],
): RetireRolesResult {
  if (remainingConsumers.length > 0) {
    return { status: "blocked", roles, removed: [], blockers: remainingConsumers };
  }
  const next: Record<string, string> = { ...roles };
  const removed: string[] = [];
  for (const role of retiredRoleNames) {
    if (role in next) {
      delete next[role];
      removed.push(role);
    }
  }
  return { status: "applied", roles: next, removed, blockers: [] };
}

export interface RoleStageFileResult {
  readonly stage: "prepare" | "retire";
  readonly configPath: string;
  readonly prepare?: PrepareRolesResult;
  readonly retire?: RetireRolesResult;
  readonly wrote: boolean;
}

interface RoleConfigDocument {
  readonly document: Record<string, unknown>;
  readonly roles: Record<string, string>;
  readonly originalText: string;
}

function readRoleConfig(configPath: string): RoleConfigDocument {
  let originalText: string;
  try {
    originalText = readFileSync(configPath, "utf8");
  } catch {
    throw new Error(`no config at ${configPath}; role migration never creates a config file`);
  }
  const parsed: unknown = parse(originalText);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`config at ${configPath} is not a mapping document`);
  }
  const document = { ...(parsed as Record<string, unknown>) };
  const rawRoles = document["modelRoles"];
  if (rawRoles !== undefined && (typeof rawRoles !== "object" || rawRoles === null || Array.isArray(rawRoles))) {
    throw new Error(`config at ${configPath} has a non-mapping modelRoles section`);
  }
  const roles: Record<string, string> = {};
  for (const [key, value] of Object.entries((rawRoles as Record<string, unknown> | undefined) ?? {})) {
    if (typeof value !== "string") throw new Error(`modelRoles.${key} is not a string`);
    roles[key] = value;
  }
  return { document, roles, originalText };
}

function writeRolesBack(
  configPath: string,
  config: RoleConfigDocument,
  roles: Readonly<Record<string, string>>,
  write: (path: string, text: string) => void,
): void {
  const document = { ...config.document, modelRoles: roles };
  try {
    write(configPath, stringify(document));
  } catch (error) {
    // Partial-failure recovery: restore the exact prior bytes before rethrowing.
    writeFileSync(configPath, config.originalText);
    throw error;
  }
}

/**
 * Run one migration stage against a YAML config file. `write` is injectable so
 * tests can prove partial-failure restoration; the default writes the file.
 */
export function applyRoleStageToFile(
  configPath: string,
  stage: "prepare" | "retire",
  options: {
    readonly panelSelectors?: Partial<Record<PanelRoleName, string>>;
    readonly remainingConsumers?: readonly string[];
    readonly write?: (path: string, text: string) => void;
  } = {},
): RoleStageFileResult {
  const config = readRoleConfig(configPath);
  const write = options.write ?? ((path, text) => writeFileSync(path, text));
  if (stage === "prepare") {
    const prepare = prepareRoles({ roles: config.roles, panelSelectors: options.panelSelectors ?? {} });
    const wrote = prepare.status === "applied" && Object.keys(prepare.added).length > 0;
    if (wrote) writeRolesBack(configPath, config, prepare.roles, write);
    return { stage, configPath, prepare, wrote };
  }
  const retire = retireRoles(config.roles, options.remainingConsumers ?? []);
  const wrote = retire.status === "applied" && retire.removed.length > 0;
  if (wrote) writeRolesBack(configPath, config, retire.roles, write);
  return { stage, configPath, retire, wrote };
}

export const roles = {
  genericRoleSources,
  panelRoleNames,
  retiredRoleNames,
  preservedRoleNames,
  prepareRoles,
  retireRoles,
  resolveAgentChains,
  applyRoleStageToFile,
} as const;
