import { afterEach, expect, test, spyOn } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mutationCommands } from "../skills/eng-github/scripts/commands/mutate.ts";
import { parseArgs } from "../skills/eng-github/scripts/lib/args.ts";
import { GitHubClient, apiRoot } from "../skills/eng-github/scripts/lib/client.ts";
import { StateStore } from "../skills/eng-github/scripts/lib/state.ts";
import { applyOwnerMarker, formatOwnerMarker, parseOwnerMarker, resolveOwner, registerOwner, type OwnerDeps } from "../skills/eng-github/scripts/lib/owner.ts";
import type { Credential } from "../skills/eng-github/scripts/lib/credentials.ts";
import * as ownerModule from "../skills/eng-github/scripts/lib/owner.ts";
import { run } from "../skills/eng-github/scripts/lib/process.ts";

const owner = { host: "mac", session: "root", parent: null, pane: "w:p", project: "eng-mode" };
const marker = "<!-- omp-owner: host=mac session=root parent= pane=w:p project=eng-mode -->";
const dirs: string[] = [];
const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function directory() {
  const dir = mkdtempSync(join(tmpdir(), "pr-owner-"));
  dirs.push(dir);
  return dir;
}
function deps(env: Record<string, string | undefined> = {}): OwnerDeps {
  return { env, hostname: () => "mac.local", processTree: async () => [], herdrPane: async () => null, gitToplevel: async () => "/src/.rifts/eng-mode/branch", repo: "ajoslin/eng-mode" };
}

test("owner markers have a stable wire format and replace all older markers", () => {
  expect(formatOwnerMarker(owner)).toBe(marker);
  expect(formatOwnerMarker({ ...owner, session: "r o\not" })).toBe(marker);
  expect(applyOwnerMarker("Body", owner)).toBe(`Body\n\n${marker}\n`);
  expect(applyOwnerMarker(`Body\n\n${marker}\n`, owner)).toBe(`Body\n\n${marker}\n`);
  expect(applyOwnerMarker(`Body\n\n${marker}\n\n<!-- omp-owner: host=old session=old parent= pane= project= -->`, owner)).toBe(`Body\n\n${marker}\n`);
  expect(parseOwnerMarker(marker)).toEqual(owner);
  expect(parseOwnerMarker(`${marker}\n<!-- omp-owner: host=linux session=child parent=root pane= project=x unknown=y -->`)).toEqual({ host: "linux", session: "child", parent: "root", pane: null, project: "x" });
});

test("environment identifies root and child sessions and overrides host", async () => {
  expect(await resolveOwner(deps({ OMP_SESSION_ID: "root", HERDR_PANE_ID: "w:p" }))).toEqual(owner);
  expect(await resolveOwner(deps({ OMP_SESSION_ID: "child", OMP_PARENT_SESSION_ID: "root", FLEET_WATCH_HOST: "remote" }))).toEqual({ host: "remote", session: "child", parent: "root", pane: null, project: "eng-mode" });
});

test("topmost omp supplies the pane for the root session fallback", async () => {
  const input = deps();
  input.processTree = async () => [ { pid: 2, command: "/bin/omp", env: { HERDR_PANE_ID: "inner" } }, { pid: 1, command: "/usr/bin/omp", env: { HERDR_PANE_ID: "w:p" } } ];
  input.herdrPane = async (pane) => ({ result: { pane: { agent_session: { value: `/sessions/2026-10-14_${pane === "w:p" ? "root" : "wrong"}.jsonl` } } } });
  expect(await resolveOwner(input)).toEqual(owner);
  expect(await resolveOwner(deps())).toBeNull();
  input.env = { OMP_SESSION_ID: "root" };
  input.gitToplevel = async () => "/src/checkout";
  expect(await resolveOwner(input)).toEqual({ ...owner, pane: null });
});

test("resolution deadline aborts discovery and handles a later pane rejection", async () => {
  const input = deps({ HERDR_PANE_ID: "w:p" });
  const pane = Promise.withResolvers<unknown>();
  let signal: AbortSignal | undefined;
  input.herdrPane = async (_pane, receivedSignal) => { signal = receivedSignal; return pane.promise; };
  let expire: () => void = () => { throw new Error("deadline was not scheduled"); };
  const schedule = globalThis.setTimeout;
  const timer = spyOn(globalThis, "setTimeout").mockImplementation(Object.assign((...args: Parameters<typeof setTimeout>) => {
    expire = () => args[0]();
    return schedule(() => {}, 60_000);
  }, { __promisify__: schedule.__promisify__ }));
  const unhandled: unknown[] = [];
  const listener = (error: unknown) => { unhandled.push(error); };
  process.on("unhandledRejection", listener);
  try {
    const resolution = resolveOwner(input);
    const result = resolution.catch((error: unknown) => String(error));
    expire();
    expect(await result).toBe("Error: owner resolution timed out");
    expect(signal?.aborted).toBe(true);
    pane.reject(new Error("late pane timeout"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(unhandled).toEqual([]);
  } finally {
    timer.mockRestore();
    process.off("unhandledRejection", listener);
  }
});

test("git lookup failure retains the known owner with the repository project", async () => {
  const input = deps({ OMP_SESSION_ID: "root", HERDR_PANE_ID: "w:p" });
  input.gitToplevel = async () => { throw new Error("git timed out"); };
  expect(await resolveOwner(input)).toEqual({ host: "mac", session: "root", parent: null, pane: "w:p", project: "eng-mode" });
});

test("aborting a subprocess rejects with the resolution deadline instead of its own timeout", async () => {
  const controller = new AbortController();
  const subprocess = run([process.execPath, "-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)"], { signal: controller.signal, timeoutMs: 10_000 });
  const result = subprocess.catch((error: unknown) => String(error));
  controller.abort(new Error("owner resolution timed out"));
  expect(await result).toBe("Error: owner resolution timed out");
});

const pr = { stack: null, id: "n", url: "https://github.com/ajoslin/eng-mode/pull/7", number: 7, title: "Title", state: "OPEN", isDraft: false, headRefName: "feature", headRefOid: "abc123", baseRefName: "main", baseRefOid: "base", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", labels: { nodes: [] }, autoMergeRequest: null, baseRef: null, commits: { nodes: [] }, reviewThreads: { nodes: [] }, latestReviews: { nodes: [] }, comments: { nodes: [] } };

async function mutation(kind: "pr create" | "pr edit", binary: string, bodyText = "Body") {
  const dir = directory();
  const body = join(dir, "body.txt");
  writeFileSync(body, bodyText);
  process.env.OMP_SESSION_ID = "root";
  delete process.env.OMP_PARENT_SESSION_ID;
  process.env.HERDR_PANE_ID = "w:p";
  process.env.FLEET_WATCH_HOST = "mac";
  process.env.FLEET_WATCH_BIN = binary;
  const requests: { method: string; body: unknown }[] = [];
  globalThis.fetch = Object.assign(async (input: string | URL | Request, init: RequestInit = {}) => {
    if (String(input).endsWith("/graphql")) return Response.json({ data: { p0: { pullRequest: pr } } });
    requests.push({ method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null });
    return Response.json(init.method === "POST" ? { number: 7 } : { body: `Old\n\n${marker}\n` });
  }, { preconnect: realFetch.preconnect });
  const credential: Credential = { host: "github.com", token: "test", source: "ENG_GITHUB_TOKEN", fingerprint: "owner-test" };
  const client = new GitHubClient(credential, new StateStore("owner-test", dir), apiRoot("github.com"), { now: () => Date.now(), sleep: async () => {} });
  const args = parseArgs(kind === "pr create" ? ["--base", "main", "--head", "feature", "--title", "Title", "--body-file", body] : ["ajoslin/eng-mode#7", "--body-file", body]);
  const command = mutationCommands[kind];
  if (!command) throw new Error("missing mutation");
  const result = await command.run({ client, args, cwd: import.meta.dir + "/.." });
  return { result, requests };
}

test("create writes one marker and registers the snapshot head with fleet-watch", async () => {
  const dir = directory();
  const binary = join(dir, "fleet-watch");
  const output = join(dir, "argv");
  writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' "$@" > '${output}'\n`);
  chmodSync(binary, 0o755);
  const { result, requests } = await mutation("pr create", binary);
  expect(requests).toEqual([{ method: "POST", body: { base: "main", head: "feature", title: "Title", body: `Body\n\n${marker}\n`, draft: false } }]);
  expect(result).toMatchObject({ number: 7, headRef: "feature", headSha: "abc123" });
  expect(readFileSync(output, "utf8")).toBe("pr\nregister-owner\n--repo\najoslin/eng-mode\n--number\n7\n--head-ref\nfeature\n--head-sha\nabc123\n--session\nroot\n--pane\nw:p\n--host\nmac\n--project\neng-mode\n");
});

for (const failure of ["missing", "nonzero"]) test(`create returns snapshot when registration is ${failure}`, async () => {
  const binary = join(directory(), "fleet-watch");
  if (failure === "nonzero") { writeFileSync(binary, "#!/bin/sh\nexit 1\n"); chmodSync(binary, 0o755); }
  const warnings: string[] = [];
  const stderr = spyOn(process.stderr, "write").mockImplementation((text) => { warnings.push(String(text)); return true; });
  try {
    const { result } = await mutation("pr create", binary);
    expect(result).toMatchObject({ number: 7, headSha: "abc123" });
    expect(warnings.length).toBe(1);
    expect(warnings[0]?.startsWith("eng-github: warning: fleet-watch owner registration failed: ")).toBe(true);
  } finally { stderr.mockRestore(); }
});

test("body edits preserve the existing owner once", async () => {
  const { result, requests } = await mutation("pr edit", "/does/not/exist");
  expect(requests).toEqual([{ method: "GET", body: null }, { method: "PATCH", body: { body: `Body\n\n${marker}\n` } }]);
  expect(result).toMatchObject({ number: 7, headSha: "abc123" });
});

test("registration has a ten second timeout and preserves optional routing fields", async () => {
  const calls: unknown[] = [];
  const warnings: unknown[] = [];
  await registerOwner({ owner: { ...owner, parent: "parent" }, repo: "a/b", number: 9, headRef: "branch", headSha: "sha" }, {
    env: { FLEET_WATCH_BIN: "custom" },
    run: async (argv, options) => { calls.push([argv, options]); throw new Error("timeout"); },
    warn: (error) => { warnings.push(String(error)); },
  });
  expect(calls).toEqual([[["custom", "pr", "register-owner", "--repo", "a/b", "--number", "9", "--head-ref", "branch", "--head-sha", "sha", "--session", "root", "--parent", "parent", "--pane", "w:p", "--host", "mac", "--project", "eng-mode"], { timeoutMs: 10000 }]]);
  expect(warnings).toEqual(["Error: timeout"]);
});

test("body edits with an explicit owner do not fetch the previous body", async () => {
  const { result, requests } = await mutation("pr edit", "/does/not/exist", `New\n\n${marker}\n`);
  expect(requests).toEqual([{ method: "PATCH", body: { body: `New\n\n${marker}\n` } }]);
  expect(result).toMatchObject({ number: 7, headSha: "abc123" });
});

test("incomplete owner examples and unrelated comments survive marker application", () => {
  const body = "Example\n```html\n<!-- omp-owner: host=example session=sample\n```\n\n<!-- note -->";
  expect(parseOwnerMarker(body)).toBeNull();
  expect(applyOwnerMarker(body, owner)).toBe(`${body}\n\n${marker}\n`);
});

test("owner values cannot terminate or corrupt their comment", () => {
  const input = { ...owner, project: "team>tools", parent: "a-<->b" };
  const expected = "Body\n\n<!-- omp-owner: host=mac session=root parent=ab pane=w:p project=teamtools -->\n";
  expect(applyOwnerMarker("Body", input)).toBe(expected);
  expect(parseOwnerMarker(expected)).toEqual({ ...owner, project: "teamtools", parent: "ab" });
  expect(applyOwnerMarker(expected, input)).toBe(expected);
});

test("create posts without a marker when git owner discovery never resolves", async () => {
  const input = deps({ OMP_SESSION_ID: "root" });
  input.gitToplevel = () => Promise.withResolvers<string | undefined>().promise;
  input.timeoutMs = 10;
  const discovery = spyOn(ownerModule, "ownerDeps").mockReturnValue(input);
  const warnings: string[] = [];
  const stderr = spyOn(process.stderr, "write").mockImplementation((text) => { warnings.push(String(text)); return true; });
  try {
    const { result, requests } = await mutation("pr create", "/does/not/exist");
    expect(requests).toEqual([{ method: "POST", body: { base: "main", head: "feature", title: "Title", body: "Body", draft: false } }]);
    expect(result).toMatchObject({ number: 7, headSha: "abc123" });
    expect(warnings).toEqual(["eng-github: warning: fleet-watch owner registration failed: owner resolution timed out\n"]);
  } finally { discovery.mockRestore(); stderr.mockRestore(); }
});

test("registration deadline stops waiting for inherited stdout pipes", async () => {
  const binary = join(directory(), "fleet-watch");
  writeFileSync(binary, "#!/bin/sh\nsleep 30 &\nwait\n");
  chmodSync(binary, 0o755);
  const warnings: string[] = [];
  const started = performance.now();
  await registerOwner({ owner, repo: "a/b", number: 9, headRef: "branch", headSha: "sha" }, {
    env: { FLEET_WATCH_BIN: binary }, run,
    warn: (error) => { warnings.push(String(error)); },
  }, 500);
  expect(warnings).toEqual(["Error: process timed out after 500ms"]);
  expect(performance.now() - started).toBeLessThan(2_000);
});
