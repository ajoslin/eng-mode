import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";


export const contractNames = ["project-standards", "verify-project"] as const;
export type ContractName = (typeof contractNames)[number];

export type ContractParseStatus = "ok" | "unconfigured" | "missing" | "unreadable" | "malformed" | "wrong-name";

export interface ContractObservation {
  readonly name: ContractName;
  readonly expectedPath: string;
  readonly parse: ContractParseStatus;
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
  readonly reasons: readonly string[];
}

const UNCONFIGURED_SENTINEL = /^UNCONFIGURED$/m;

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
  return join(resolve(repositoryRoot), ".omp", "skills", name, "SKILL.md");
}

export function decideRepositoryContracts(
  input: RepositoryContractsInput,
): RepositoryContractsResult {
  const standards = observedContract(input, "project-standards");
  const verification = observedContract(input, "verify-project");
  const contracts = [standards, verification];
  const done = (decision: ContractDecision, reasons: readonly string[]): RepositoryContractsResult => ({
    decision,
    mode: input.mode,
    repositoryRoot: input.repositoryRoot,
    contracts,
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

  if (verification.parse === "unconfigured") {
    return done("unconfigured", ["verify-project is an explicit UNCONFIGURED sentinel"]);
  }
  if (verification.parse !== "ok") {
    return done("inconclusive-verification", [
      `verify-project is ${verification.parse}; behavioral claims on the product surface are INCONCLUSIVE and browser proof is not a substitute`,
    ]);
  }

  return done("proceed", ["both project contracts are valid repository-owned .omp/skills files"]);
}

export function observeRepositoryContracts(repositoryRoot: string): ContractObservation[] {
  return contractNames.map((name) => {
    const expectedPath = expectedContractPath(repositoryRoot, name);
    let text: string;
    try {
      text = readFileSync(expectedPath, "utf8");
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      return {
        name,
        expectedPath,
        parse: missing ? ("missing" as const) : ("unreadable" as const),
      };
    }
    if (UNCONFIGURED_SENTINEL.test(text)) {
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
    return { name, expectedPath, parse: "ok" as const };
  });
}

export const contracts = {
  contractNames,
  expectedContractPath,
  observeRepositoryContracts,
  decideRepositoryContracts,
} as const;
