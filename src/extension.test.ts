import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import engModeExtension, {
  classifierOutputNeedsExpertGuidance,
  executeEngOrch,
  EXPERT_DECISION_GUIDANCE,
  parsePromptClassification,
} from "./extension.ts";

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
): Promise<void> {
  const directory = join(repository, ".omp", "skills", name);
  await mkdir(directory, { recursive: true });
  const provider = name === "project-standards" && forgeProvider !== undefined
    ? `forge-provider: ${forgeProvider}\n`
    : "";
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\n${provider}description: test\n---\nconfigured\n`);
}

describe("eng_orch executable entrypoint", () => {
  type RegisteredTool = Parameters<Parameters<typeof engModeExtension>[0]["registerTool"]>[0];
  it("returns the repository contract decision with the default forge provider", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    const result = await executeEngOrch({ action: "contracts", repositoryRoot, mode: "code-producing" });
    expect(result).toMatchObject({
      decision: "proceed",
      mode: "code-producing",
      forgeProvider: "github-graphite",
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
      expectedPath: join(malformedRepository, ".omp", "skills", "project-standards", "SKILL.md"),
    });
  });

  it("keeps an explicit sentinel distinct from missing and unreadable contracts", async () => {
    const repositoryRoot = await root();
    const standardsDirectory = join(repositoryRoot, ".omp", "skills", "project-standards");
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

  it("registers goal, loop, and eng_orch from one entrypoint", async () => {
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
    const commands = new Map<string, unknown>();
    const renderers = new Map<string, unknown>();
    const chain = {
      optional: () => chain,
      int: () => chain,
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
        registerMessageRenderer: (customType: string, renderer: unknown) => {
          renderers.set(customType, renderer);
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
        registerCommand: (name: string, command: unknown) => commands.set(name, command),
        appendEntry: () => {},
        sendMessage: () => {},
        registerTool: (tool: RegisteredTool) => registered.set(tool.name, tool),
      } as unknown as Parameters<typeof engModeExtension>[0]);
      expect(realpathSync(join(repositoryRoot, ".agents", "skills", "how"))).toBe(
        realpathSync(join(import.meta.dir, "..", "skills", "how")),
      );
      expect(existsSync(join(homeDir, ".agents"))).toBeFalse();
    });
    expect([...registered.keys()]).toEqual(["goal", "loop", "eng_orch"]);
    expect(commands.has("eng-advisor")).toBeTrue();
    expect(renderers.has("dev.ajoslin.eng-advisor.finding")).toBeTrue();
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
    const signal = new AbortController().signal;
    const onUpdate = () => {};
    const invokeTool = async (params: Record<string, unknown>, options: unknown) => ({ params, options });
    await expect(goal.execute("call-1", { op: "get" }, signal, onUpdate, { invokeTool })).resolves.toEqual({
      params: { op: "get" },
      options: { signal, onUpdate },
    });
    await expect(goal.execute("call-default", { op: "create", objective: "ship" }, undefined, undefined, { invokeTool })).resolves.toEqual({
      params: { op: "create", objective: "ship", token_budget: 500_000_000 },
      options: {},
    });
    await expect(goal.execute("call-low", { op: "create", objective: "ship", token_budget: 42 }, undefined, undefined, { invokeTool })).resolves.toEqual({
      params: { op: "create", objective: "ship", token_budget: 500_000_000 },
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

  it("still registers tools when the agent-skills overlay cannot write the repo dest", async () => {
    const repositoryRoot = await root();
    await mkdir(join(repositoryRoot, ".git"));
    await mkdir(join(repositoryRoot, ".agents"));
    await writeFile(join(repositoryRoot, ".agents", "skills"), "not a directory\n");
    const previousCwd = process.cwd();
    process.chdir(repositoryRoot);
    const registered = new Map<string, string>();
    const chain = {
      optional: () => chain,
      int: () => chain,
      positive: () => chain,
      nonnegative: () => chain,
    };
    try {
      engModeExtension({
        pi: {
          Text: class {
            constructor(readonly text: string, readonly paddingX: number, readonly paddingY: number) {}
          },
        },
        registerMessageRenderer: () => {},
        registerCommand: () => {},
        appendEntry: () => {},
        sendMessage: () => {},
        zod: {
          object: () => ({}),
          enum: () => chain,
          string: () => chain,
          number: () => chain,
          boolean: () => chain,
          array: () => chain,
        },
        on: () => {},
        registerTool: (tool: RegisteredTool) => registered.set(tool.name, tool.name),
      } as unknown as Parameters<typeof engModeExtension>[0]);
    } finally {
      process.chdir(previousCwd);
    }
    expect([...registered.keys()]).toEqual(["goal", "loop", "eng_orch"]);
  });
});
