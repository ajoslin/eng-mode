import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NotFoundError,
  type OpenStoreOptions,
  openStore,
  parseVerdict,
  type Store,
  UserError,
} from "./store.ts";

const directories: string[] = [];
const handles: Store[] = [];
const gitBin = Bun.which("git") ?? "git";
let pathLock: Promise<void> = Promise.resolve();

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orch-test-"));
  directories.push(directory);
  return directory;
}

function useStore(directory: string, options?: OpenStoreOptions): Store {
  const store = openStore(directory, options);
  handles.push(store);
  return store;
}

async function initializedStore(): Promise<{
  readonly directory: string;
  readonly store: Store;
}> {
  const directory = await makeDirectory();
  const store = useStore(directory);
  await store.init({ spawner: "test-session" });
  return { directory, store };
}

function git({
  args,
  repo,
}: {
  args: readonly string[];
  repo: string;
}): string {
  const result = Bun.spawnSync([gitBin, "-C", repo, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString()}`
    );
  }
  return result.stdout.toString().trim();
}

async function makeGitStack(directory: string): Promise<{
  readonly repo: string;
  readonly mergedSha: string;
  readonly closedSha: string;
  readonly openSha: string;
}> {
  const repo = join(directory, "repo");
  await mkdir(repo);
  git({ repo, args: ["init", "--initial-branch=main"] });
  git({ repo, args: ["config", "user.name", "Orch Test"] });
  git({ repo, args: ["config", "user.email", "orch@example.com"] });
  git({ repo, args: ["config", "commit.gpgsign", "false"] });
  git({ repo, args: ["config", "core.fsmonitor", "false"] });
  await writeFile(join(repo, "main.txt"), "main\n");
  git({ repo, args: ["add", "."] });
  git({ repo, args: ["commit", "-m", "main"] });

  const branches = ["stack/merged", "stack/closed", "stack/open"];
  for (const [index, branch] of branches.entries()) {
    git({ repo, args: ["checkout", "-b", branch] });
    await writeFile(join(repo, `stack-${index}.txt`), `${branch}\n`);
    git({ repo, args: ["add", "."] });
    git({ repo, args: ["commit", "-m", branch] });
  }

  return {
    repo,
    mergedSha: git({ repo, args: ["rev-parse", "stack/merged"] }),
    closedSha: git({ repo, args: ["rev-parse", "stack/closed"] }),
    openSha: git({ repo, args: ["rev-parse", "stack/open"] }),
  };
}

const defaultGtInfo: Readonly<Record<string, string>> = {
  "stack/merged": "stack/merged\nPR #10 (Merged) merged change\n",
  "stack/closed": "stack/closed\nPR #13 (Closed) closed change\n",
  "stack/open": "stack/open\nPR #11 (Needs approvals) open change\n",
};

const defaultGtLog = `◯ main
◯ stack/merged
◯ stack/closed
◉ stack/open (current)
`;

async function withFakeGt<T>({
  auth = "ok",
  directory,
  info = defaultGtInfo,
  log = defaultGtLog,
  operation,
}: {
  auth?: "ok" | "fail";
  directory: string;
  info?: Readonly<Record<string, string>>;
  log?: string;
  operation: () => Promise<T>;
}): Promise<T> {
  const bin = join(directory, "bin");
  const logPath = join(directory, "gt-log.txt");
  await mkdir(bin, { recursive: true });
  await writeFile(logPath, log);
  const infoCases: string[] = [];
  for (const [branch, output] of Object.entries(info)) {
    const infoPath = join(
      directory,
      `gt-info-${branch.replaceAll("/", "_")}.txt`
    );
    await writeFile(infoPath, output);
    infoCases.push(`  "--no-interactive info ${branch}")
    cat "${infoPath}"
    ;;`);
  }
  const gt = join(bin, "gt");
  await writeFile(
    gt,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$(pwd -P)" != "${realpathSync(join(directory, "repo"))}" ]; then
  printf 'gt ran outside the fixture repo: %s\\n' "$(pwd -P)" >&2
  exit 2
fi
case "$*" in
  "--no-interactive auth")
    ${auth === "ok" ? "exit 0" : 'printf "not authenticated\\n" >&2; exit 1'}
    ;;
  "--no-interactive log short --stack --reverse")
    cat "${logPath}"
    ;;
${infoCases.join("\n")}
  *)
    printf 'unexpected gt arguments: %s\\n' "$*" >&2
    exit 2
    ;;
esac
`
  );
  await chmod(gt, 0o755);
  return await withPathPrefix({ bin, operation, replace: false });
}

async function withMissingGt<T>({
  directory,
  operation,
}: {
  directory: string;
  operation: () => Promise<T>;
}): Promise<T> {
  const bin = join(directory, "bin");
  await mkdir(bin, { recursive: true });
  return await withPathPrefix({ bin, operation, replace: true });
}

async function withPathPrefix<T>({
  bin,
  operation,
  replace,
}: {
  bin: string;
  operation: () => Promise<T>;
  replace: boolean;
}): Promise<T> {
  let release!: () => void;
  const previous = pathLock;
  pathLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const originalPath = process.env.PATH;
  process.env.PATH = replace ? bin : `${bin}:${originalPath ?? ""}`;
  try {
    return await operation();
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    release();
  }
}

afterEach(async () => {
  for (const store of handles.splice(0).reverse()) {
    await store.close();
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Store", () => {
  it("initializes an idempotent plain-file store and releases its lock", async () => {
    const directory = await makeDirectory();
    const store = useStore(directory);

    expect(await store.init({ spawner: "session-a" })).toEqual({
      store: directory,
    });
    const firstUnits = await readFile(join(directory, "units.tsv"), "utf8");
    const firstLedger = await readFile(join(directory, "ledger.tsv"), "utf8");

    await writeFile(
      join(directory, "inbox", "legacy.tsv"),
      "now\tagent\tu1\tdone\treport\n"
    );
    expect(await store.init({ spawner: "session-b" })).toEqual({
      store: directory,
    });
    expect(await store.inbox.peek()).toEqual([
      {
        ts: "now",
        spawner: "session-b",
        agent: "agent",
        unit: "u1",
        status: "done",
        report: "report",
      },
    ]);
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(
      firstUnits
    );
    expect(await readFile(join(directory, "ledger.tsv"), "utf8")).toBe(
      firstLedger
    );
    expect((await readdir(directory)).sort()).toEqual([
      ".orch.lock",
      "frontier.json",
      "gates.md",
      "inbox",
      "inbox-claimed",
      "ledger.tsv",
      "preferences.md",
      "units.tsv",
    ]);

    await store.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("composes unit add, set, get, list, and counts", async () => {
    const { store } = await initializedStore();

    expect(
      await store.units.add({
        id: "u1",
        track: "build",
        brief: "briefs/u1.md",
      })
    ).toMatchObject({ id: "u1", state: "pending" });
    expect(
      await store.units.add({ id: "=SUM(A1)", track: "+build" })
    ).toMatchObject({
      id: "'=SUM(A1)",
      track: "'+build",
    });

    const updated = await store.units.set({
      id: "u1",
      state: "done",
      branch: "poteto/u1",
      pr: 184530,
      sha: "abc123",
    });
    expect(updated).toEqual({
      id: "u1",
      track: "build",
      state: "done",
      branch: "poteto/u1",
      pr: "184530",
      sha: "abc123",
      brief: "briefs/u1.md",
    });
    expect(await store.units.get("u1")).toEqual(updated);
    expect(await store.units.list({ state: "done", track: "build" })).toEqual([
      updated,
    ]);
    expect(await store.units.counts()).toEqual({ done: 1, pending: 1 });
    await expect(store.units.add({ id: "u1", track: "build" })).rejects.toThrow(
      "unit u1 already exists"
    );
    await expect(
      store.units.set({ id: "missing", state: "done" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("counts prototype-named states and renders stable status deltas", async () => {
    const { store } = await initializedStore();
    await store.status.render();
    for (const { id, state } of [{ id: "a", state: "constructor" }, { id: "b", state: "__proto__" }, { id: "c", state: "toString" }, { id: "d", state: "constructor" }]) {
      await store.units.add({ id, track: "build" });
      await store.units.set({ id, state });
    }
    expect(await store.units.counts()).toEqual({ constructor: 2, ["__proto__"]: 1, toString: 1 });
    const first = await store.status.render();
    expect(first.summary.unitStates).toEqual({ constructor: 2, ["__proto__"]: 1, toString: 1 });
    expect(first.changed).toBe("units __proto__ 0->1; units constructor 0->2; units toString 0->1");
    expect((await store.status.render()).changed).toBe("no derived changes");
    await store.units.set({ id: "b", state: "constructor" });
    expect((await store.status.render()).changed).toBe("units __proto__ 1->0; units constructor 2->3");
  });

  it("records, replaces, checks, and summarizes typed ledger verdicts", async () => {
    const { store } = await initializedStore();

    try {
      await store.ledger.check({ pr: 184530, sha: "abc123" });
      throw new Error("expected ledger check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      if (error instanceof NotFoundError) {
        expect(error.output).toEqual({
          compact: "NOT-VERIFIED",
          json: {
            pr: "184530",
            sha: "abc123",
            verdict: "NOT-VERIFIED",
          },
        });
      }
    }
    expect(() => parseVerdict("looks-good")).toThrow("verdict must be");

    const recorded = await store.ledger.record({
      pr: 184530,
      sha: "abc123",
      verdict: "unit-test-verified",
      evidence: "reports/verify.md",
      verifier: "sol",
    });
    expect(await store.ledger.check({ pr: 184530, sha: "abc123" })).toEqual(
      recorded
    );
    expect(await store.ledger.summary()).toEqual({
      "unit-test-verified": 1,
    });

    await store.ledger.record({
      pr: 184530,
      sha: "abc123",
      verdict: "live-ui-verified",
      evidence: "reports/live.md",
    });
    expect(await store.ledger.summary()).toEqual({
      "live-ui-verified": 1,
    });
  });

  it("claims, reclaims after restart, and acknowledges only one coordinator's pointers", async () => {
    const { directory, store } = await initializedStore();

    const first = await store.inbox.push({
      spawner: "session-a",
      agent: "worker-1",
      unit: "u1",
      status: "done",
      report: "reports/u1.md",
    });
    expect(first.pointer).toMatchObject({
      spawner: "session-a",
      unit: "u1",
      status: "done",
    });
    expect(first.filename).toEndWith(".tsv");
    await store.inbox.push({
      spawner: "session-b",
      agent: "worker-2",
      unit: "u2",
      status: "failed",
    });

    const claim = await store.inbox.claim({ spawner: "session-a" });
    expect(claim).not.toBeNull();
    if (claim === null) {
      throw new Error("expected session-a claim");
    }
    expect(claim.pointers.map((pointer) => pointer.unit)).toEqual(["u1"]);
    expect(await store.inbox.peek()).toHaveLength(1);
    expect(await readdir(join(directory, "inbox-claimed", claim.id))).toContain(
      first.filename
    );

    await store.close();
    const recovered = useStore(directory);
    expect(await recovered.inbox.reclaim({ spawner: "session-a" })).toEqual({
      claims: [claim.id],
      pointers: claim.pointers,
      skipped: [],
    });
    expect(await recovered.inbox.count()).toBe(2);

    const retry = await recovered.inbox.claim({ spawner: "session-a" });
    expect(retry).not.toBeNull();
    if (retry === null) {
      throw new Error("expected reclaimed session-a pointer");
    }
    await expect(
      recovered.inbox.ack({ spawner: "session-b", claim: retry.id })
    ).rejects.toThrow(`claim ${retry.id} belongs to another spawner`);
    expect(
      (await recovered.inbox.ack({ spawner: "session-a", claim: retry.id }))
        .pointers
    ).toEqual(retry.pointers);
    expect(await recovered.inbox.peek()).toHaveLength(1);
    expect(await readdir(join(directory, "inbox-claimed"))).toEqual([]);
  });

  it("recovers owned claims past empty, malformed, and unidentified interrupted claims", async () => {
    const { directory, store } = await initializedStore();
    const root = join(directory, "inbox-claimed");
    await mkdir(join(root, "000-empty"));
    await mkdir(join(root, "001-unowned"));
    await writeFile(join(root, "001-unowned", "unknown.tsv"), "unidentified\n");
    await mkdir(join(root, "002-malformed"));
    await writeFile(join(root, "002-malformed", "spawner"), "session-a\n");
    await writeFile(join(root, "002-malformed", "bad.tsv"), "bad\n");
    await mkdir(join(root, "003-invalid-owner"));
    await writeFile(join(root, "003-invalid-owner", "spawner"), "session-a\t\n");
    await store.inbox.push({ spawner: "session-a", agent: "worker", unit: "u1", status: "done" });
    const claim = await store.inbox.claim({ spawner: "session-a" });
    if (claim === null) throw new Error("expected claim");
    await store.close();
    const recovered = useStore(directory);
    expect((await recovered.inbox.reclaim({ spawner: "session-a" })).pointers.map((pointer) => pointer.unit)).toEqual(["u1"]);
    expect((await readdir(root)).sort()).toEqual(["001-unowned", "002-malformed", "003-invalid-owner"]);
    expect(await readFile(join(root, "001-unowned", "unknown.tsv"), "utf8")).toBe("unidentified\n");
    await expect(recovered.inbox.reclaim({ spawner: "session-a", claim: "001-unowned" })).rejects.toBeInstanceOf(UserError);
    const repeated = await recovered.inbox.reclaim({ spawner: "session-a" });
    expect(repeated.claims).toEqual([]);
    expect(repeated.pointers).toEqual([]);
    expect(repeated.skipped).toEqual([
      { id: "001-unowned", reason: "claim has no valid spawner file" },
      { id: "002-malformed", reason: "inbox pointer bad.tsv is malformed" },
      { id: "003-invalid-owner", reason: "claim spawner is malformed" },
    ]);
    const replay = await recovered.inbox.claim({ spawner: "session-a" });
    if (replay === null) throw new Error("expected replay");
    expect((await recovered.inbox.ack({ spawner: "session-a", claim: replay.id })).pointers.map((pointer) => pointer.unit)).toEqual(["u1"]);
  });

  it("replays a claim interrupted between pointer moves without losing queued work", async () => {
    const { directory, store } = await initializedStore();
    const first = await store.inbox.push({ spawner: "session-a", agent: "worker", unit: "first", status: "done" });
    await store.inbox.push({ spawner: "session-a", agent: "worker", unit: "second", status: "done" });
    const partial = join(directory, "inbox-claimed", "partial");
    await mkdir(partial);
    await writeFile(join(partial, "spawner"), "session-a\n");
    await rename(join(directory, "inbox", first.filename), join(partial, first.filename));
    await store.close();
    const recovered = useStore(directory);
    expect((await recovered.inbox.reclaim({ spawner: "session-a" })).pointers.map((pointer) => pointer.unit)).toEqual(["first"]);
    expect((await recovered.inbox.peek()).map((pointer) => pointer.unit).sort()).toEqual(["first", "second"]);
    const claim = await recovered.inbox.claim({ spawner: "session-a" });
    if (claim === null) throw new Error("expected replay");
    expect((await recovered.inbox.ack({ spawner: "session-a", claim: claim.id })).pointers.map((pointer) => pointer.unit).sort()).toEqual(["first", "second"]);
  });

  it("never acknowledges or reclaims foreign pointers under a mismatched claim owner", async () => {
    const { directory, store } = await initializedStore();
    await store.inbox.push({ spawner: "session-b", agent: "worker", unit: "foreign", status: "done" });
    const claim = await store.inbox.claim({ spawner: "session-b" });
    if (claim === null) throw new Error("expected claim");
    const owner = join(directory, "inbox-claimed", claim.id, "spawner");
    await expect(store.inbox.reclaim({ spawner: "session-a", claim: claim.id })).rejects.toBeInstanceOf(UserError);
    await writeFile(owner, "session-a\n");
    await expect(store.inbox.ack({ spawner: "session-a", claim: claim.id })).rejects.toBeInstanceOf(UserError);
    await expect(store.inbox.reclaim({ spawner: "session-a", claim: claim.id })).rejects.toBeInstanceOf(UserError);
    expect(await store.inbox.reclaim({ spawner: "session-a" })).toEqual({ claims: [], pointers: [], skipped: [{ id: claim.id, reason: `claim ${claim.id} contains another spawner's pointers` }] });
    await writeFile(owner, "session-b\n");
    expect((await store.inbox.reclaim({ spawner: "session-b" })).pointers.map((pointer) => pointer.unit)).toEqual(["foreign"]);
  });

  it("recovers a dead owner without allowing competing stale recoverers to write", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const exited = Bun.spawn(["true"]);
    await exited.exited;
    const lock = join(directory, ".orch.lock");
    await mkdir(lock);
    await writeFile(join(lock, `${exited.pid}-${randomUUID()}`), "");
    const contenders = Array.from({ length: 10 }, () => useStore(directory));
    const results = await Promise.allSettled(
      contenders.map((candidate, index) =>
        candidate.units.add({ id: `u${index}`, track: "build" })
      )
    );
    const winners = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [index] : []
    );
    expect(winners).toHaveLength(1);
    expect(await useStore(directory).units.list()).toEqual([
      expect.objectContaining({ id: `u${winners[0]}` }),
    ]);
    for (const [index, candidate] of contenders.entries()) {
      if (!winners.includes(index)) await candidate.close();
    }
    await expect(
      useStore(directory).units.add({ id: "blocked", track: "build" })
    ).rejects.toThrow("store lock held");
  });

  it("rejects live takeover and keeps ownership when a rejected handle closes", async () => {
    const { directory, store } = await initializedStore();
    const legacyOptions = { force: true, onStaleLock: () => {} };
    const second = useStore(directory, legacyOptions);
    await expect(
      second.units.add({ id: "blocked", track: "build" })
    ).rejects.toThrow(`store lock held by pid ${process.pid}`);
    await second.close();
    await store.units.add({ id: "owner", track: "build" });
    await expect(
      useStore(directory).units.add({ id: "third", track: "build" })
    ).rejects.toThrow("store lock held");
    expect(await store.units.list()).toEqual([
      expect.objectContaining({ id: "owner" }),
    ]);
  });

  it("fails closed on legacy and unknown locks", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const lock = join(directory, ".orch.lock");
    await writeFile(lock, "99999999\n");
    await expect(
      useStore(directory).units.add({ id: "legacy", track: "build" })
    ).rejects.toThrow("stop all writers");
    await rm(lock);
    await mkdir(lock);
    await writeFile(join(lock, "unknown"), "");
    await expect(
      useStore(directory).units.add({ id: "unknown", track: "build" })
    ).rejects.toThrow("unknown ownership");
  });

  it("rejects writes after ownership is lost without deleting the replacement lock", async () => {
    const { directory, store } = await initializedStore();
    await rm(join(directory, ".orch.lock"), { recursive: true });
    const replacement = useStore(directory);
    await replacement.units.add({ id: "replacement", track: "build" });
    await expect(
      store.units.add({ id: "old", track: "build" })
    ).rejects.toThrow("ownership lost");
    await store.close();
    await expect(
      useStore(directory).units.add({ id: "third", track: "build" })
    ).rejects.toThrow("store lock held");
    expect(await replacement.units.list()).toEqual([
      expect.objectContaining({ id: "replacement" }),
    ]);
  });

  it("persists every acknowledged concurrent update and drains accepted writes on close", async () => {
    const directory = await makeDirectory();
    const store = useStore(directory);
    const initialized = store.init({ spawner: "test-session" });
    const additions = Array.from({ length: 10 }, (_, index) =>
      store.units.add({ id: `u${index}`, track: "build" })
    );
    const failed = store.units.add({ id: "u0", track: "build" });
    const failure = expect(failed).rejects.toThrow("already exists");
    const standing = Array.from({ length: 10 }, (_, index) =>
      store.standing.add({ line: `order ${index}` })
    );
    const closing = store.close();
    await expect(
      store.units.add({ id: "late", track: "build" })
    ).rejects.toThrow("store is closed");
    await Promise.all([
      initialized,
      ...additions,
      failure,
      ...standing,
      closing,
      store.close(),
    ]);
    const reopened = useStore(directory);
    expect((await reopened.units.list()).map((row) => row.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `u${index}`)
    );
    expect(await reopened.standing.show()).toEqual(
      Array.from({ length: 10 }, (_, index) => ({
        number: index + 1,
        line: `order ${index}`,
      }))
    );
    await reopened.units.add({ id: "after-close", track: "build" });
  });

  it("parks gates, stores standing orders, and renders status", async () => {
    const { directory, store } = await initializedStore();
    await store.units.add({ id: "u1", track: "build" });
    expect(
      await store.gates.park({
        id: "release",
        question: "Ship now?",
        options: "ship,wait",
        defaultAnswer: "wait",
      })
    ).toMatchObject({ kind: "open", id: "release" });
    expect(await store.standing.add({ line: "Never force push." })).toEqual({
      number: 1,
      line: "Never force push.",
    });

    const first = await store.status.render();
    expect(first.changed).toBe("first render");
    expect(first.summary.openGateIds).toEqual(["release"]);
    expect(await readFile(join(directory, "status.md"), "utf8")).toContain(
      "| release | open | Ship now? |"
    );
    expect((await store.status.render()).changed).toBe("no derived changes");

    expect(
      await store.gates.resolve({ id: "release", answer: "ship" })
    ).toMatchObject({
      kind: "resolved",
      answer: "ship",
    });
    expect((await store.status.render()).changed).toBe("open gates 1->0");
    expect(await store.gates.list()).toEqual([]);
    expect(await store.standing.show()).toEqual([
      { number: 1, line: "Never force push." },
    ]);
  });

  it("resolves the ordered Graphite frontier and validates an optional pin", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGt({
      directory,
      operation: async () => {
        expect(await store.frontier.set({ repo: stack.repo })).toEqual({
          generation: 1,
          prs: [
            {
              pr: 10,
              branches: "stack/merged",
              sha: stack.mergedSha,
              state: "MERGED",
            },
            {
              pr: 13,
              branches: "stack/closed",
              sha: stack.closedSha,
              state: "CLOSED",
            },
            {
              pr: 11,
              branches: "stack/open",
              sha: stack.openSha,
              state: "OPEN",
            },
          ],
          lowestUnmerged: 11,
        });
        expect(
          (
            await store.frontier.set({
              repo: stack.repo,
              prs: [10, 13, 11],
            })
          ).generation
        ).toBe(2);
        expect((await store.frontier.show()).generation).toBe(2);
        await expect(
          store.frontier.set({
            repo: stack.repo,
            prs: [10, 11, 12],
          })
        ).rejects.toThrow(
          "frontier pin mismatch: missing from gt: 12; extra in gt: 13"
        );
        await expect(
          store.frontier.set({
            repo: stack.repo,
            prs: [13, 10, 11],
          })
        ).rejects.toThrow(
          "frontier pin mismatch: order differs: expected 13,10,11; gt 10,13,11"
        );
        await expect(
          store.frontier.set({
            repo: stack.repo,
            prs: [10, 10],
          })
        ).rejects.toThrow("--prs must not contain duplicates");
      },
    });
  });

  it("rejects missing gt", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withMissingGt({
      directory,
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gt is missing or unauthenticated"
        );
      },
    });
  });

  it("rejects unauthenticated gt", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGt({
      auth: "fail",
      directory,
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gt is missing or unauthenticated"
        );
      },
    });
  });

  it("rejects unparseable Graphite output loudly", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGt({
      directory,
      log: "◯ main\nthis line is not Graphite output\n",
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          'gt log short output has an unparseable line 2: "this line is not Graphite output"'
        );
      },
    });
  });

  it("rejects a stack branch with no PR", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGt({
      directory,
      info: {
        "stack/merged": "stack/merged\nno pull request\n",
        "stack/closed": defaultGtInfo["stack/closed"] ?? "",
        "stack/open": defaultGtInfo["stack/open"] ?? "",
      },
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gt info output branch stack/merged has no pull request"
        );
      },
    });
  });

  it("rejects an unknown Graphite PR state", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGt({
      directory,
      info: {
        "stack/merged": defaultGtInfo["stack/merged"] ?? "",
        "stack/closed": defaultGtInfo["stack/closed"] ?? "",
        "stack/open": "stack/open\nPR #11 (Mystery status) open change\n",
      },
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gt info output has an unknown PR state for branch stack/open: Mystery status"
        );
      },
    });
  });

  it("rejects malformed TSV, verdict, frontier, and inbox data", async () => {
    const { directory, store } = await initializedStore();

    await writeFile(join(directory, "units.tsv"), "wrong\n");
    await expect(store.units.list()).rejects.toThrow(
      "units.tsv has an invalid header"
    );
    await writeFile(
      join(directory, "units.tsv"),
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nshort\trow\n"
    );
    await expect(store.units.list()).rejects.toThrow(
      "units.tsv has a malformed row"
    );

    await writeFile(
      join(directory, "ledger.tsv"),
      "pr\tsha\tverdict\tevidence\tverifier\tts\n1\tsha\tinvalid\treport\tme\tnow\n"
    );
    await expect(store.ledger.summary()).rejects.toThrow(
      "ledger.tsv has invalid verdict invalid"
    );

    await writeFile(join(directory, "frontier.json"), '{"generation":"1"}\n');
    await expect(store.frontier.show()).rejects.toThrow(
      "frontier.json has an invalid shape"
    );

    await writeFile(join(directory, "inbox", "bad.tsv"), "too\tshort\n");
    await expect(store.inbox.peek()).rejects.toThrow(
      "inbox pointer bad.tsv is malformed"
    );
  });

  it("rejects ambiguous persisted keys without overwriting their evidence", async () => {
    const { directory, store } = await initializedStore();
    const units = "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nu1\tbuild\tpending\t\t\t\t\nu1\tbuild\tdone\t\t\t\t\n";
    await writeFile(join(directory, "units.tsv"), units);
    await expect(store.units.set({ id: "u1", state: "active" })).rejects.toBeInstanceOf(UserError);
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(units);
    const ledger = "pr\tsha\tverdict\tevidence\tverifier\tts\n1\ts\tunit-test-verified\told\tv\tnow\n1\ts\tverifier-failed\tnew\tv\tnow\n";
    await writeFile(join(directory, "ledger.tsv"), ledger);
    await expect(store.ledger.check({ pr: 1, sha: "s" })).rejects.toBeInstanceOf(UserError);
    await expect(store.ledger.record({ pr: 1, sha: "s", verdict: "live-ui-verified", evidence: "replacement" })).rejects.toBeInstanceOf(UserError);
    expect(await readFile(join(directory, "ledger.tsv"), "utf8")).toBe(ledger);
  });

  it("rejects a frontier whose lowest unmerged PR contradicts its ordered PRs", async () => {
    const { directory, store } = await initializedStore();
    await writeFile(join(directory, "frontier.json"), JSON.stringify({ generation: 1, prs: [{ pr: 1, branches: "branch", sha: "s", state: "OPEN" }], lowestUnmerged: 9 }));
    await expect(store.frontier.show()).rejects.toBeInstanceOf(UserError);
    await writeFile(join(directory, "frontier.json"), JSON.stringify({ generation: 1, prs: [{ pr: 1, branches: "branch", sha: "s", state: "OPEN" }], lowestUnmerged: 1 }));
    expect((await store.frontier.show()).lowestUnmerged).toBe(1);
  });

  it("rejects operations after close", async () => {
    const { store } = await initializedStore();
    await store.close();
    await expect(store.units.list()).rejects.toThrow("store is closed");
    await expect(store.status.render()).rejects.toBeInstanceOf(UserError);
  });
});
