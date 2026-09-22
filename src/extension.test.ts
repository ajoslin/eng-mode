import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import engModeExtension, {
  classifierOutputNeedsExpertGuidance,
  executeEngOrch,
  EXPERT_DECISION_GUIDANCE,
  parsePromptClassification,
} from "./extension.ts";
import { MINIMUM_GOAL_TOKEN_BUDGET } from "./goal-tool.ts";
import { agentModelChains, agentNames } from "./manifest.ts";
import { prepareRoles, resolveAgentChains } from "./roles.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "eng-mode-extension-"));
  roots.push(value);
  return value;
}

async function withRepo<T>(fn: (repositoryRoot: string, homeDir: string) => Promise<T> | T): Promise<T> {
  const repositoryRoot = await root();
  const homeDir = await root();
  await mkdir(join(repositoryRoot, ".git"));
  const previousCwd = process.cwd();
  const previousHome = process.env.HOME;
  process.chdir(repositoryRoot);
  process.env.HOME = homeDir;
  try {
    return await fn(repositoryRoot, homeDir);
  } finally {
    process.chdir(previousCwd);
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
}

async function contract(
  repository: string,
  name: "project-standards" | "verify-project",
  forgeProvider?: string,
  skillsRoot = ".agents",
): Promise<void> {
  const directory = join(repository, skillsRoot, "skills", name);
  await mkdir(directory, { recursive: true });
  const provider = name === "project-standards" && forgeProvider !== undefined
    ? `forge-provider: ${forgeProvider}\n`
    : "";
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\n${provider}description: test\n---\nconfigured\n`);
}

describe("eng_orch executable entrypoint", () => {
  type RegisteredTool = Parameters<Parameters<typeof engModeExtension>[0]["registerTool"]>[0];
  it("resolves the package-owned Opus primary without a workstation role", () => {
    const roles = { adversary: "other/reviewer", review: "backup/reviewer" };
    expect(resolveAgentChains(roles).find((entry) => entry.agent === "panel-opus")).toEqual({
      agent: "panel-opus",
      chain: ["cliproxy/claude-opus-5-5:low", "@adversary", "@review"],
      primary: "cliproxy/claude-opus-5-5:low",
      fallback: false,
      unresolved: [],
    });
    expect(resolveAgentChains(roles).find((entry) => entry.agent === "panel-sol")).toMatchObject({
      primary: "@adversary",
      fallback: true,
      unresolved: ["@panel_sol"],
    });
  });

  it("prepares workstation roles without creating or overwriting panel_opus", () => {
    const roles = {
      code: "local/code", judgment: "local/judgment", adversary: "local/adversary", fast: "local/fast",
      panel_sol: "local/sol", panel_fable: "local/fable", panel_deepseek: "local/deepseek",
    };
    expect(prepareRoles({ roles })).toMatchObject({ status: "applied", roles, added: {}, needsSelection: [] });
    const existing = { ...roles, panel_opus: "operator/opus" };
    expect(prepareRoles({ roles: existing, panelSelectors: { panel_opus: "ignored/opus" } })).toMatchObject({
      status: "applied", roles: existing, added: {}, conflicts: [],
    });
  });

  it("returns the repository contract decision with the default forge provider", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    const result = await executeEngOrch({ action: "contracts", repositoryRoot, mode: "code-producing" });
    expect(result).toMatchObject({
      decision: "proceed",
      mode: "code-producing",
      forgeProvider: "github",
    });
  });

  it("prefers canonical project skills and falls back to legacy OMP skills", async () => {
    const canonicalRepository = await root();
    await contract(canonicalRepository, "project-standards", "pr-cockpit");
    await contract(canonicalRepository, "verify-project");
    await contract(canonicalRepository, "project-standards", "github", ".omp");
    await contract(canonicalRepository, "verify-project", undefined, ".omp");

    const canonical = await executeEngOrch({ action: "contracts", repositoryRoot: canonicalRepository });
    expect(canonical).toMatchObject({
      decision: "proceed",
      forgeProvider: "pr-cockpit",
      contracts: [
        { expectedPath: join(canonicalRepository, ".agents", "skills", "project-standards", "SKILL.md") },
        { expectedPath: join(canonicalRepository, ".agents", "skills", "verify-project", "SKILL.md") },
      ],
    });

    const legacyRepository = await root();
    await contract(legacyRepository, "project-standards", undefined, ".omp");
    await contract(legacyRepository, "verify-project", undefined, ".omp");
    const legacy = await executeEngOrch({ action: "contracts", repositoryRoot: legacyRepository });
    expect(legacy).toMatchObject({
      decision: "proceed",
      contracts: [
        { expectedPath: join(legacyRepository, ".omp", "skills", "project-standards", "SKILL.md") },
        { expectedPath: join(legacyRepository, ".omp", "skills", "verify-project", "SKILL.md") },
      ],
    });
  });

  it("selects an explicit forge provider and blocks unknown values", async () => {
    const cockpitRepository = await root();
    await contract(cockpitRepository, "project-standards", "pr-cockpit");
    await contract(cockpitRepository, "verify-project");

    expect(await executeEngOrch({ action: "contracts", repositoryRoot: cockpitRepository })).toMatchObject({
      decision: "proceed",
      forgeProvider: "pr-cockpit",
    });

    const unknownRepository = await root();
    await contract(unknownRepository, "project-standards", "unknown");
    await contract(unknownRepository, "verify-project");
    expect(await executeEngOrch({ action: "contracts", repositoryRoot: unknownRepository })).toMatchObject({
      decision: "blocked-standards",
      forgeProvider: null,
      reasons: ['project-standards selects unknown forge-provider "unknown"'],
    });
  });

  it("blocks an explicit malformed forge provider instead of defaulting", async () => {
    const malformedRepository = await root();
    await contract(malformedRepository, "project-standards", "");
    await contract(malformedRepository, "verify-project");
    const result = await executeEngOrch({ action: "contracts", repositoryRoot: malformedRepository });
    expect(result).toMatchObject({ decision: "blocked-standards", forgeProvider: null });
    expect(result).toHaveProperty("contracts.0", {
      name: "project-standards",
      parse: "malformed",
      expectedPath: join(malformedRepository, ".agents", "skills", "project-standards", "SKILL.md"),
    });
  });

  it("keeps an explicit sentinel distinct from missing and unreadable contracts", async () => {
    const repositoryRoot = await root();
    const standardsDirectory = join(repositoryRoot, ".agents", "skills", "project-standards");
    await mkdir(standardsDirectory, { recursive: true });
    await writeFile(join(standardsDirectory, "SKILL.md"), "UNCONFIGURED\n");
    await contract(repositoryRoot, "verify-project");

    const result = await executeEngOrch({ action: "contracts", repositoryRoot, mode: "code-producing" });
    expect(result).toMatchObject({
      decision: "unconfigured",
      contracts: [
        { name: "project-standards", parse: "unconfigured" },
        { name: "verify-project", parse: "ok" },
      ],
    });
  });


  it("initializes the default project store and honors an explicit store", async () => {
    const repositoryRoot = await root();
    const defaultStore = join(repositoryRoot, ".omp", "eng-orch");
    expect(await executeEngOrch({ action: "init", repositoryRoot, spawner: "session" })).toEqual({ store: defaultStore });
    expect(await executeEngOrch({ action: "unit_add", repositoryRoot, id: "unit-1", track: "core" })).toMatchObject({ id: "unit-1", track: "core" });
    expect(await executeEngOrch({ action: "unit_counts", repositoryRoot })).toEqual({ pending: 1 });

    const explicitStore = join(repositoryRoot, "explicit-store");
    expect(await executeEngOrch({ action: "init", store: explicitStore, spawner: "session" })).toEqual({ store: explicitStore });
  });

  it("registers the keyless Opus primary, goal, loop, and eng_orch from one entrypoint", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    type BeforeAgentStartHandler = (
      event: { prompt: string },
      context: typeof unavailableClassifier,
    ) => Promise<{
      message?: {
        customType: string;
        content: string;
        display: boolean;
        attribution: "agent";
      };
    }>;
    let beforeAgentStartHandler: BeforeAgentStartHandler | undefined;
    let expertRenderer: ((_message: unknown, _options: unknown, theme: { fg(color: "accent" | "dim", text: string): string }) => unknown) | undefined;
    const registered = new Map<string, RegisteredTool>();
    type ProviderConfig = Parameters<Parameters<typeof engModeExtension>[0]["registerProvider"]>[1];
    const providers = new Map<string, ProviderConfig>();
    const registeredCommands: Record<string, (args: string, context: unknown) => Promise<void>> = {};
    let tokenBudgetMinimum: number | undefined;
    const chain = {
      optional: () => chain,
      int: () => chain,
      describe: () => chain,
      min: (value: number) => {
        tokenBudgetMinimum = value;
        return chain;
      },
      positive: () => chain,
      nonnegative: () => chain,
    };
    const zod = {
      object: () => ({}),
      enum: () => chain,
      string: () => chain,
      number: () => chain,
      boolean: () => chain,
      array: () => chain,
    };
    let classifierCalls = 0;
    const unavailableClassifier = {
      models: {
        resolve: (_spec: "@tiny") => {
          classifierCalls += 1;
          return undefined;
        },
      },
      modelRegistry: { getApiKey: async (_model: never) => undefined },
    };
    class TestText {
      constructor(readonly text: string, readonly paddingX: number, readonly paddingY: number) {}
    }
    class TestInteractiveMode {
      readonly sessionManager = { getSessionId: () => "unused" };
      loopModeEnabled = false;
      loopModePaused = false;
      loopPrompt: string | undefined;
      loopLimit: undefined;
      async init(): Promise<void> {}
      stop(): void {}
      async handleLoopCommand(): Promise<string | undefined> {
        return undefined;
      }
      setLoopPrompt(): void {}
      pauseLoop(): void {}
      disableLoopMode(): void {}
    }
    await withRepo(async (repositoryRoot, homeDir) => {
      engModeExtension({
        pi: { Text: TestText, InteractiveMode: TestInteractiveMode },
        registerProvider: (name: string, config: ProviderConfig) => providers.set(name, config),
        registerMessageRenderer: (customType: string, renderer: unknown) => {
          if (customType === "eng-mode-expert-decision-guidance") {
            expertRenderer = renderer as typeof expertRenderer;
          }
        },
        zod,
        on: (event: string, handler: unknown) => {
          if (event === "before_agent_start") {
            beforeAgentStartHandler = handler as BeforeAgentStartHandler;
          }
        },
        registerCommand: (name: string, options: { handler: (args: string, context: unknown) => Promise<void> }) => {
          registeredCommands[name] = options.handler;
        },
        registerTool: (tool: RegisteredTool) => registered.set(tool.name, tool),
      } as unknown as Parameters<typeof engModeExtension>[0]);
      expect([...registered.keys()]).toEqual(["goal", "loop", "eng_orch"]);
      expect(Object.keys(registeredCommands)).toEqual([]);
      expect(existsSync(join(homeDir, ".agents"))).toBeFalse();
      expect(existsSync(join(repositoryRoot, ".agents"))).toBeFalse();
    });
    expect([...providers.keys()]).toEqual(["cliproxy"]);
    expect(providers.get("cliproxy")).toMatchObject({
      baseUrl: "http://100.73.208.98:8317/v1",
      api: "openai-completions",
      apiKey: "N/A",
      authHeader: false,
      models: [{ id: "claude-opus-5-5", reasoning: true }],
    });
    for (const agent of agentNames) {
      const source = await readFile(join(import.meta.dir, "..", "agents", `${agent}.md`), "utf8");
      const frontmatter = parse(source.split("---")[1] ?? "");
      expect(frontmatter.model).toEqual(agentModelChains[agent]);
    }
    const [selector = ""] = agentModelChains["panel-opus"];
    const [provider = "", modelWithEffort = ""] = selector.split("/");
    const [model, effort] = modelWithEffort.split(":");
    expect(providers.get(provider)?.models?.find((entry) => entry.id === model)?.id).toBe("claude-opus-5-5");
    expect(effort).toBe("low");
    expect(registered.get("loop")).toMatchObject({ strict: true, loadMode: "essential" });
    expect(beforeAgentStartHandler).toBeDefined();
    await expect(beforeAgentStartHandler?.({ prompt: "Explore these files and report findings" }, unavailableClassifier)).resolves.toEqual({});
    expect(classifierCalls).toBe(1);
    await expect(beforeAgentStartHandler?.({ prompt: EXPERT_DECISION_GUIDANCE }, unavailableClassifier)).resolves.toEqual({});
    expect(classifierCalls).toBe(1);
    await expect(beforeAgentStartHandler?.({ prompt: "Review the architecture" }, unavailableClassifier)).resolves.toEqual({});
    expect(classifierCalls).toBe(2);
    expect(parsePromptClassification("ordinary")).toBe("ordinary");
    expect(parsePromptClassification("expert\n")).toBe("expert");
    expect(parsePromptClassification("maybe")).toBeUndefined();
    expect(classifierOutputNeedsExpertGuidance("ordinary")).toBeFalse();
    expect(classifierOutputNeedsExpertGuidance("expert")).toBeTrue();
    expect(classifierOutputNeedsExpertGuidance(undefined)).toBeFalse();
    expect(expertRenderer?.({}, {}, { fg: (color, text) => `<${color}>${text}</${color}>` })).toEqual(
      new TestText("<accent>◆</accent> <dim>Expert lens</dim>", 0, 0),
    );
    const goal = registered.get("goal");
    const engOrch = registered.get("eng_orch");
    expect(goal).toBeDefined();
    expect(engOrch).toBeDefined();
    if (!goal || !engOrch) throw new Error("Eng Mode tools were not registered");
    expect(goal).toMatchObject({ strict: true, loadMode: "essential" });
    expect(tokenBudgetMinimum).toBe(MINIMUM_GOAL_TOKEN_BUDGET);
    const signal = new AbortController().signal;
    const onUpdate = () => {};
    const invokeTool = async (params: Record<string, unknown>, options: unknown) => ({ params, options });
    await expect(goal.execute("call-1", { op: "get" }, signal, onUpdate, { invokeTool })).resolves.toEqual({
      params: { op: "get" },
      options: { signal, onUpdate },
    });
    await expect(goal.execute("call-default", { op: "create", objective: "ship" }, undefined, undefined, { invokeTool })).resolves.toEqual({
      params: { op: "create", objective: "ship", token_budget: MINIMUM_GOAL_TOKEN_BUDGET },
      options: {},
    });
    await expect(goal.execute("call-low", { op: "create", objective: "ship", token_budget: 42 }, undefined, undefined, { invokeTool })).resolves.toEqual({
      params: { op: "create", objective: "ship", token_budget: MINIMUM_GOAL_TOKEN_BUDGET },
      options: {},
    });
    await expect(goal.execute("call-high", { op: "create", objective: "ship", token_budget: 600_000_000 }, undefined, undefined, { invokeTool })).resolves.toEqual({
      params: { op: "create", objective: "ship", token_budget: 600_000_000 },
      options: {},
    });
    await expect(goal.execute("call-2", { op: "get" }, signal, onUpdate, {})).rejects.toThrow(
      "OMP's native goal tool is unavailable.",
    );

    const output = await engOrch.execute("call-3", {
      action: "contracts",
      repositoryRoot,
      mode: "code-producing",
    });
    expect(output).toMatchObject({ details: { decision: "proceed" } });
  });

});
