import { describe, expect, it } from "bun:test";
import { cp, mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hostedByT3Code } from "../skills/eng-github/scripts/lib/t3-host.ts";

const packageRoot = resolve(import.meta.dir, "..");

describe("T3 Code hosting", () => {
  it.each([undefined, "", "0", "true", "1"])("recognizes only the host sentinel %s", (value) => {
    expect(hostedByT3Code(value === undefined ? {} : { T3CODE_OMP_SESSION: value })).toBe(value === "1");
  });

  it.each([undefined, "1"])("preserves raw gh and shim behavior for host %s", async (host) => {
    const root = await mkdtemp(join(tmpdir(), "eng-mode-t3-host-"));
    try {
      const installed = join(root, "node_modules", "eng-mode");
      await mkdir(installed, { recursive: true });
      for (const dir of ["src", "skills"]) await cp(join(packageRoot, dir), join(installed, dir), { recursive: true });
      await symlink(join(packageRoot, "node_modules"), join(root, "node_modules", "eng-mode", "node_modules"), "dir");
      await Bun.write(join(root, "probe.ts"), `
import engModeExtension from ${JSON.stringify(join(installed, "src", "extension.ts"))};
const handlers = [];
const chain = new Proxy({}, { get: () => () => chain });
engModeExtension({
  pi: { Text: class {}, InteractiveMode: class {} },
  zod: new Proxy({}, { get: () => () => chain }),
  on: (event, handler) => { if (event === "tool_call") handlers.push(handler); },
  registerMessageRenderer() {}, registerCommand() {}, registerTool() {},
}, { classifyExpert: async () => ({ kind: "error" }) });
const results = await Promise.all(handlers.map(handler => handler({ type: "tool_call", toolCallId: "1", toolName: "bash", input: { command: "gh pr list" } }, { cwd: ${JSON.stringify(root)}, hasUI: false })));
console.log(JSON.stringify({ blocked: results.some(result => result?.block === true) }));
`);
      const env: NodeJS.ProcessEnv = { ...process.env, HOME: root };
      delete env.T3CODE_OMP_SESSION;
      if (host !== undefined) env.T3CODE_OMP_SESSION = host;
      const child = Bun.spawn([process.execPath, join(root, "probe.ts")], { env, stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      expect(await child.exited, stderr).toBe(0);
      expect(JSON.parse(stdout)).toEqual({ blocked: host !== "1" });
      const shim = Bun.file(join(root, ".local", "bin", "eng-github"));
      expect(await shim.exists()).toBe(host !== "1");
      if (host !== "1") expect(await shim.text()).toContain("# eng-mode: eng-github shim");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([{ args: [] }, { args: ["--help"] }, { args: ["snapshot", "owner/repo#1"] }])("refuses the CLI inside T3 before command handling: %j", async ({ args }) => {
    const child = Bun.spawn([process.execPath, join(packageRoot, "skills/eng-github/scripts/eng-github.ts"), ...args], {
      env: { ...process.env, T3CODE_OMP_SESSION: "1", GH_TOKEN: "", GITHUB_TOKEN: "" },
      stdout: "pipe", stderr: "pipe",
    });
    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("disabled inside T3 Code");
    for (const tool of ["t3__link_pull_request", "t3__watch_pull_request", "t3__list_thread_pull_requests"]) expect(stderr).toContain(tool);
    expect(stderr).toContain("gh");
  });
});
