import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ajModeExtension, { executeAjOrch } from "./extension.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "aj-mode-extension-"));
  roots.push(value);
  return value;
}

async function contract(repository: string, name: "project-standards" | "verify-project"): Promise<void> {
  const directory = join(repository, ".omp", "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\nconfigured\n`);
}

describe("aj_orch executable entrypoint", () => {
  it("returns the repository contract decision", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    const result = await executeAjOrch({ action: "contracts", repositoryRoot, mode: "code-producing" });
    expect(result).toMatchObject({ decision: "proceed", mode: "code-producing" });
  });


  it("initializes and reads a durable store through actions", async () => {
    const store = join(await root(), "store");
    expect(await executeAjOrch({ action: "init", store, spawner: "session" })).toEqual({ store });
    expect(await executeAjOrch({ action: "unit_add", store, id: "unit-1", track: "core" })).toMatchObject({ id: "unit-1", track: "core" });
    expect(await executeAjOrch({ action: "unit_counts", store })).toEqual({ pending: 1 });
  });

  it("registers goal and aj_orch from one entrypoint", async () => {
    const repositoryRoot = await root();
    await contract(repositoryRoot, "project-standards");
    await contract(repositoryRoot, "verify-project");
    type RegisteredTool = Parameters<Parameters<typeof ajModeExtension>[0]["registerTool"]>[0];
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
    ajModeExtension({
      zod,
      registerTool: (tool) => registered.set(tool.name, tool),
    });

    expect([...registered.keys()]).toEqual(["goal", "aj_orch"]);
    const goal = registered.get("goal");
    const ajOrch = registered.get("aj_orch");
    expect(goal).toBeDefined();
    expect(ajOrch).toBeDefined();
    if (!goal || !ajOrch) throw new Error("AJ Mode tools were not registered");
    expect(goal).toMatchObject({ strict: true, loadMode: "essential" });
    const signal = new AbortController().signal;
    const onUpdate = () => {};
    const invokeTool = async (params: Record<string, unknown>, options: unknown) => ({ params, options });
    await expect(goal.execute("call-1", { op: "get" }, signal, onUpdate, { invokeTool })).resolves.toEqual({
      params: { op: "get" },
      options: { signal, onUpdate },
    });
    await expect(goal.execute("call-2", { op: "get" }, signal, onUpdate, {})).rejects.toThrow(
      "OMP's native goal tool is unavailable.",
    );

    const output = await ajOrch.execute("call-3", {
      action: "contracts",
      repositoryRoot,
      mode: "code-producing",
    });
    expect(output).toMatchObject({ details: { decision: "proceed" } });
  });
});
