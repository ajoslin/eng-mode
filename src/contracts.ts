import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const contractNames = ["project-standards", "verify-project"] as const;
export type ContractName = (typeof contractNames)[number];

export type ForgeProviderName = "github-graphite" | "pr-cockpit";

export type ContractParseStatus = "ok" | "unconfigured" | "missing" | "unreadable" | "malformed" | "wrong-name";

export interface ContractObservation {
  readonly name: ContractName;
  readonly expectedPath: string;
  readonly parse: ContractParseStatus;
  readonly forgeProvider?: string;
}

export type ContractDecision =
  | "proceed"
  | "standards-unavailable-read-only"
  | "blocked-standards"
  | "inconclusive-verification"
  | "unconfigured";

export type ContractMode = "read-only" | "code-producing";

export interface RepositoryContractsInput {
  readonly repositoryRoot: string;
  readonly mode: ContractMode;
  readonly observations: readonly ContractObservation[];
}

export interface RepositoryContractsResult {
  readonly decision: ContractDecision;
  readonly mode: ContractMode;
  readonly repositoryRoot: string;
  readonly contracts: readonly ContractObservation[];
  readonly forgeProvider: ForgeProviderName | null;
  readonly reasons: readonly string[];
}

const UNCONFIGURED_SENTINEL = "UNCONFIGURED";

function observedContract(input: RepositoryContractsInput, name: ContractName): ContractObservation {
  const found = input.observations.find((entry) => entry.name === name);
  if (found) return found;
  return {
    name,
    expectedPath: expectedContractPath(input.repositoryRoot, name),
    parse: "missing",
  };
}

export function expectedContractPath(repositoryRoot: string, name: ContractName): string {
  return join(resolve(repositoryRoot), ".agents", "skills", name, "SKILL.md");
}

export function decideRepositoryContracts(
  input: RepositoryContractsInput,
): RepositoryContractsResult {
  const standards = observedContract(input, "project-standards");
  const verification = observedContract(input, "verify-project");
  const contracts = [standards, verification];
  const configuredForgeProvider = standards.parse === "ok"
    ? (standards.forgeProvider ?? "github-graphite")
    : null;
  const forgeProvider: ForgeProviderName | null = configuredForgeProvider === "github-graphite" || configuredForgeProvider === "pr-cockpit"
    ? configuredForgeProvider
    : null;
  const done = (decision: ContractDecision, reasons: readonly string[]): RepositoryContractsResult => ({
    decision,
    mode: input.mode,
    repositoryRoot: input.repositoryRoot,
    contracts,
    forgeProvider,
    reasons,
  });

  if (standards.parse === "unreadable" || standards.parse === "malformed" || standards.parse === "wrong-name") {
    return done("blocked-standards", [`project-standards is ${standards.parse} at ${standards.expectedPath}`]);
  }
  if (standards.parse === "unconfigured") {
    return done("unconfigured", ["project-standards is an explicit UNCONFIGURED sentinel"]);
  }
  if (standards.parse === "missing") {
    if (input.mode === "read-only") {
      return done("standards-unavailable-read-only", [
        "project-standards is absent; read-only work may proceed without policy-compliance claims",
      ]);
    }
    return done("blocked-standards", [
      "project-standards is absent; code-producing work stops before any edit, write, or writer delegation",
    ]);
  }
  if (forgeProvider === null) {
    return done("blocked-standards", [
      `project-standards selects unknown forge-provider ${JSON.stringify(configuredForgeProvider)}`,
    ]);
  }

  if (verification.parse === "unconfigured") {
    return done("unconfigured", ["verify-project is an explicit UNCONFIGURED sentinel"]);
  }
  if (verification.parse !== "ok") {
    return done("inconclusive-verification", [
      `verify-project is ${verification.parse}; behavioral claims on the product surface are INCONCLUSIVE and browser proof is not a substitute`,
    ]);
  }

  return done("proceed", [
    "both project contracts are valid repository-owned skills",
    `forge provider ${forgeProvider} selected`,
  ]);
}

export function observeRepositoryContracts(repositoryRoot: string): ContractObservation[] {
  return contractNames.map((name) => {
    const canonicalPath = expectedContractPath(repositoryRoot, name);
    const legacyPath = join(resolve(repositoryRoot), ".omp", "skills", name, "SKILL.md");
    let expectedPath = canonicalPath;
    let text: string;
    try {
      text = readFileSync(canonicalPath, "utf8");
    } catch (canonicalError) {
      if ((canonicalError as NodeJS.ErrnoException).code !== "ENOENT") {
        return { name, expectedPath, parse: "unreadable" as const };
      }
      expectedPath = legacyPath;
      try {
        text = readFileSync(legacyPath, "utf8");
      } catch (legacyError) {
        const missing = (legacyError as NodeJS.ErrnoException).code === "ENOENT";
        return { name, expectedPath: canonicalPath, parse: missing ? ("missing" as const) : ("unreadable" as const) };
      }
    }
    if (text.trim() === UNCONFIGURED_SENTINEL) {
      return { name, expectedPath, parse: "unconfigured" as const };
    }
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text);
    if (!frontmatter) {
      return { name, expectedPath, parse: "malformed" as const };
    }
    const declaredName = /^name:\s*(\S+)\s*$/m.exec(frontmatter[1] ?? "");
    if (!declaredName || declaredName[1] !== name) {
      return { name, expectedPath, parse: "wrong-name" as const };
    }
    let forgeProvider: string | undefined;
    if (name === "project-standards") {
      const providerLines = frontmatter[1]?.match(/^forge-provider\b.*$/gm) ?? [];
      if (providerLines.length > 1) {
        return { name, expectedPath, parse: "malformed" as const };
      }
      if (providerLines.length === 1) {
        const provider = /^forge-provider:\s*(\S+)\s*$/.exec(providerLines[0] ?? "");
        if (!provider) {
          return { name, expectedPath, parse: "malformed" as const };
        }
        forgeProvider = provider[1];
      }
    }
    return {
      name,
      expectedPath,
      parse: "ok" as const,
      ...(forgeProvider === undefined ? {} : { forgeProvider }),
    };
  });
}

export const contracts = {
  contractNames,
  expectedContractPath,
  observeRepositoryContracts,
  decideRepositoryContracts,
} as const;
