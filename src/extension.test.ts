import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import engModeExtension, {
  classifierOutputNeedsExpertGuidance,
  expertGuidanceCooldownElapsed,
  executeEngOrch,
  EXPERT_DECISION_GUIDANCE,
  EXPERT_GUIDANCE_CLASSIFIER_PROMPT,
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

async function contract(repository: string, name: "project-standards" | "verify-project"): Promise<void> {
  const directory = join(repository, ".omp", "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\nconfigured\n`);
}

describe("eng_orch executable entrypoint", () => {
  it("returns the repository contract decision", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    const result = await executeEngOrch({ action: "contracts", repositoryRoot, mode: "code-producing" });
    expect(result).toMatchObject({ decision: "proceed", mode: "code-producing" });
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

  it("registers goal and eng_orch from one entrypoint", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    type RegisteredTool = Parameters<Parameters<typeof engModeExtension>[0]["registerTool"]>[0];
    type BeforeAgentStartHandler = (
      event: { prompt: string },
      context: {
        models: { resolve(spec: "@tiny"): undefined };
        modelRegistry: { getApiKey(model: never): Promise<undefined> };
      },
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
    const chain = { optional: () => chain, int: () => chain, positive: () => chain };
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
      models: { resolve: (_spec: "@tiny") => { classifierCalls += 1; return undefined; } },
      modelRegistry: { getApiKey: async (_model: never) => undefined },
    };
    class TestText {
      constructor(readonly text: string, readonly paddingX: number, readonly paddingY: number) {}
    }
    engModeExtension({
      pi: { Text: TestText },
      registerMessageRenderer: (_customType, renderer) => { expertRenderer = renderer; },
      zod,
      on: (event, handler) => {
        if (event === "before_agent_start") beforeAgentStartHandler = handler as BeforeAgentStartHandler;
      },
      registerTool: (tool) => registered.set(tool.name, tool),
    });
    expect([...registered.keys()]).toEqual(["goal", "eng_orch"]);
    await expect(beforeAgentStartHandler?.({ prompt: "Design this system" }, unavailableClassifier)).resolves.toEqual({});
    expect(classifierCalls).toBe(0);
    await expect(beforeAgentStartHandler?.({ prompt: "Review the architecture" }, unavailableClassifier)).resolves.toEqual({});
    expect(classifierCalls).toBe(1);
    expect(parsePromptClassification("ordinary")).toBe("ordinary");
    expect(parsePromptClassification("expert\n")).toBe("expert");
    expect(parsePromptClassification("maybe")).toBeUndefined();
    expect(classifierOutputNeedsExpertGuidance("ordinary")).toBeFalse();
    expect(classifierOutputNeedsExpertGuidance("expert")).toBeTrue();
    expect(classifierOutputNeedsExpertGuidance(undefined)).toBeFalse();
    expect(expertGuidanceCooldownElapsed(false, 0, false)).toBeTrue();
    expect(expertGuidanceCooldownElapsed(true, 49_999, false)).toBeFalse();
    expect(expertGuidanceCooldownElapsed(true, 50_000, false)).toBeTrue();
    expect(expertGuidanceCooldownElapsed(true, 0, true)).toBeTrue();
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
});
