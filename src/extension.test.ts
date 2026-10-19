import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import engModeExtension, {
  classifierOutputNeedsExpertGuidance,
  executeEngOrch,
  EXPERT_DECISION_GUIDANCE,
} from "./extension.ts";
import { MINIMUM_GOAL_TOKEN_BUDGET } from "./goal-tool.ts";
import type { OperationClassifier } from "./typesafe.ts";
import type { ExtensionEventContext } from "./extension-types.ts";

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
  skillsRoot = ".agents",
): Promise<void> {
  const directory = join(repository, skillsRoot, "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\nconfigured\n`);
}

describe("eng_orch executable entrypoint", () => {
  type RegisteredTool = Parameters<Parameters<typeof engModeExtension>[0]["registerTool"]>[0];
  it("returns the repository contract decision", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    const result = await executeEngOrch({ action: "contracts", repositoryRoot, mode: "code-producing" });
    expect(result).toMatchObject({
      decision: "proceed",
      mode: "code-producing",
    });
  });

  it("defaults repositoryRoot to the session cwd for contracts and the store", async () => {
    await withRepo(async (repositoryRoot) => {
      await contract(repositoryRoot, "project-standards");
      await contract(repositoryRoot, "verify-project");
      const result = await executeEngOrch({ action: "contracts", mode: "code-producing" }) as {
        decision: string;
        repositoryRoot: string;
      };
      expect(result.decision).toBe("proceed");
      expect(realpathSync(result.repositoryRoot)).toBe(realpathSync(repositoryRoot));
      const initialized = await executeEngOrch({ action: "init", spawner: "session" }) as { store: string };
      expect(realpathSync(initialized.store)).toBe(realpathSync(join(repositoryRoot, ".omp", "eng-orch")));
    });
  });


  it("prefers canonical project skills and falls back to legacy OMP skills", async () => {
    const canonicalRepository = await root();
    await contract(canonicalRepository, "project-standards");
    await contract(canonicalRepository, "verify-project");
    await contract(canonicalRepository, "project-standards", ".omp");
    await contract(canonicalRepository, "verify-project", ".omp");

    const canonical = await executeEngOrch({ action: "contracts", repositoryRoot: canonicalRepository });
    expect(canonical).toMatchObject({
      decision: "proceed",
      contracts: [
        { expectedPath: join(canonicalRepository, ".agents", "skills", "project-standards", "SKILL.md") },
        { expectedPath: join(canonicalRepository, ".agents", "skills", "verify-project", "SKILL.md") },
      ],
    });

    const legacyRepository = await root();
    await contract(legacyRepository, "project-standards", ".omp");
    await contract(legacyRepository, "verify-project", ".omp");
    const legacy = await executeEngOrch({ action: "contracts", repositoryRoot: legacyRepository });
    expect(legacy).toMatchObject({
      decision: "proceed",
      contracts: [
        { expectedPath: join(legacyRepository, ".omp", "skills", "project-standards", "SKILL.md") },
        { expectedPath: join(legacyRepository, ".omp", "skills", "verify-project", "SKILL.md") },
      ],
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

  it("registers goal, loop, and eng_orch from one entrypoint", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    type BeforeAgentStartHandler = (event: { prompt: string }, context: ExtensionEventContext) => Promise<{
      message?: {
        customType: string;
        content: string;
        display: boolean;
        attribution: "user" | "agent";
      };
    }>;
    const beforeAgentStartHandlers: BeforeAgentStartHandler[] = [];
    let expertRenderer: ((_message: unknown, _options: unknown, theme: { fg(color: "accent" | "dim", text: string): string }) => unknown) | undefined;
    const registered = new Map<string, RegisteredTool>();
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
    const fakeClassifier: OperationClassifier = {
      classifyDanger: async () => ({ kind: "error" }),
      classifyExpert: async (prompt: string) => ({
        kind: "classified",
        lens: prompt.includes("architecture") ? "expert" : "ordinary",
      }),
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
          if (customType === "eng-mode-expert-decision-guidance") {
            expertRenderer = renderer as typeof expertRenderer;
          }
        },
        zod,
        on: (event: string, handler: unknown) => {
          if (event === "before_agent_start") {
            beforeAgentStartHandlers.push(handler as BeforeAgentStartHandler);
          }
        },
        registerCommand: (name: string, options: { handler: (args: string, context: unknown) => Promise<void> }) => {
          registeredCommands[name] = options.handler;
        },
        registerTool: (tool: RegisteredTool) => registered.set(tool.name, tool),
      } as unknown as Parameters<typeof engModeExtension>[0], fakeClassifier);
      expect([...registered.keys()]).toEqual(["goal", "loop", "eng_orch"]);
      expect(Object.keys(registeredCommands)).toEqual([]);
      expect(existsSync(join(homeDir, ".agents"))).toBeFalse();
      expect(existsSync(join(repositoryRoot, ".agents"))).toBeFalse();
    });
    expect(registered.get("loop")).toMatchObject({ strict: true, loadMode: "essential" });
    const eventContext: ExtensionEventContext = { hasUI: false, cwd: repositoryRoot, ui: { confirm: async () => false } };
    const expertResult = await Promise.all(beforeAgentStartHandlers.map((handler) => handler({ prompt: "Review the architecture" }, eventContext)));
    const beforeAgentStartHandler = beforeAgentStartHandlers[expertResult.findIndex((result) => result.message?.customType === "eng-mode-expert-decision-guidance")];
    expect(beforeAgentStartHandler).toBeDefined();
    const skillMessages = async (prompt: string) => (await Promise.all(beforeAgentStartHandlers.map((handler) => handler({ prompt }, eventContext)))).flatMap((result) => result.message?.customType === "eng-mode-skill-invocation" ? [result.message] : []);
    const messages = await skillMessages("/no-comments src/");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ customType: "eng-mode-skill-invocation", display: false, attribution: "user" });
    expect(messages[0]?.content.startsWith('[IMPORTANT: User invoked the "no-comments" skill; follow its instructions. Full skill below.]')).toBeTrue();
    expect(messages[0]?.content).toContain("Spawn Comment Sicko");
    expect(messages[0]?.content.endsWith("User: src/")).toBeTrue();
    const bareMessages = await skillMessages("/no-comments");
    expect(bareMessages).toHaveLength(1);
    expect(bareMessages[0]?.content).not.toContain("\nUser:");
    const restatement = await skillMessages("/in-your-own-words fix the flaky login test");
    expect(restatement).toHaveLength(1);
    expect(restatement[0]?.content.startsWith('[IMPORTANT: User invoked the "in-your-own-words" skill; follow its instructions. Full skill below.]')).toBeTrue();
    expect(restatement[0]?.content).toContain("Restate in your own words what you think the user's goals are and what problem they're trying to solve.");
    expect(restatement[0]?.content.endsWith("User: fix the flaky login test")).toBeTrue();
    const sharpen = await skillMessages("/sharpen");
    expect(sharpen).toHaveLength(1);
    expect(sharpen[0]?.content).toContain("Don't hand back a rewritten prompt.");
    expect(sharpen[0]?.content).not.toContain("\nUser:");
    for (const prompt of ["/skill:no-comments", "/not-a-skill x", "please run /no-comments"]) {
      expect(await skillMessages(prompt)).toEqual([]);
    }
    await expect(beforeAgentStartHandler?.({ prompt: "Explore these files and report findings" }, eventContext)).resolves.toEqual({});
    await expect(beforeAgentStartHandler?.({ prompt: "Review the architecture" }, eventContext)).resolves.toEqual({
      message: {
        customType: "eng-mode-expert-decision-guidance",
        content: EXPERT_DECISION_GUIDANCE,
        display: true,
        attribution: "agent",
      },
    });
    await expect(beforeAgentStartHandler?.({ prompt: EXPERT_DECISION_GUIDANCE }, eventContext)).resolves.toEqual({});
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
    expect(engOrch).toMatchObject({ strict: true, loadMode: "essential" });
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
