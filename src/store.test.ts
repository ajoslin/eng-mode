import { afterEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

function git({ args, repo }: { args: readonly string[]; repo: string }): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
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

async function withFakeGh<T>({
  directory,
  operation,
  viewJson,
}: {
  directory: string;
  operation: (outputPath: string) => Promise<T>;
  viewJson: string;
}): Promise<T> {
  const bin = join(directory, "bin");
  const outputPath = join(directory, "gh-view.json");
  await mkdir(bin);
  await writeFile(outputPath, viewJson);
  const gh = join(bin, "gh");
  await writeFile(
    gh,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$(pwd -P)" != "${realpathSync(join(directory, "repo"))}" ]; then
  printf 'gh ran outside the fixture repo: %s\\n' "$(pwd -P)" >&2
  exit 2
fi
case "$*" in
  "stack view --json")
    cat "${outputPath}"
    ;;
  *)
    printf 'unexpected gh arguments: %s\\n' "$*" >&2
    exit 2
    ;;
esac
`,
  );
  await chmod(gh, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath ?? ""}`;
  try {
    return await operation(outputPath);
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
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

    expect(await store.init({ spawner: "session-a" })).toEqual({ store: directory });
    const firstUnits = await readFile(join(directory, "units.tsv"), "utf8");
    const firstLedger = await readFile(join(directory, "ledger.tsv"), "utf8");

    await writeFile(join(directory, "inbox", "legacy.tsv"), "now\tagent\tu1\tdone\treport\n");
    expect(await store.init({ spawner: "session-b" })).toEqual({ store: directory });
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
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(firstUnits);
    expect(await readFile(join(directory, "ledger.tsv"), "utf8")).toBe(firstLedger);
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
      }),
    ).toMatchObject({ id: "u1", state: "pending" });
    expect(await store.units.add({ id: "=SUM(A1)", track: "+build" })).toMatchObject({
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
    expect(await store.units.list({ state: "done", track: "build" })).toEqual([updated]);
    expect(await store.units.counts()).toEqual({ done: 1, pending: 1 });
    await expect(store.units.add({ id: "u1", track: "build" })).rejects.toThrow(
      "unit u1 already exists",
    );
    await expect(store.units.set({ id: "missing", state: "done" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
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
    expect(await store.ledger.check({ pr: 184530, sha: "abc123" })).toEqual(recorded);
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
    expect(await readdir(join(directory, "inbox-claimed", claim.id))).toContain(first.filename);

    await store.close();
    const recovered = useStore(directory);
    expect(await recovered.inbox.reclaim({ spawner: "session-a" })).toEqual({
      claims: [claim.id],
      pointers: claim.pointers,
    });
    expect(await recovered.inbox.count()).toBe(2);

    const retry = await recovered.inbox.claim({ spawner: "session-a" });
    expect(retry).not.toBeNull();
    if (retry === null) {
      throw new Error("expected reclaimed session-a pointer");
    }
    await expect(recovered.inbox.ack({ spawner: "session-b", claim: retry.id })).rejects.toThrow(
      `claim ${retry.id} belongs to another spawner`,
    );
    expect((await recovered.inbox.ack({ spawner: "session-a", claim: retry.id })).pointers).toEqual(
      retry.pointers,
    );
    expect(await recovered.inbox.peek()).toHaveLength(1);
    expect(await readdir(join(directory, "inbox-claimed"))).toEqual([]);
  });

  it("replaces a stale lock whose holder pid is dead", async () => {
    const { directory } = await initializedStore();
    const exited = Bun.spawn(["true"]);
    await exited.exited;
    await writeFile(join(directory, ".orch.lock"), `${exited.pid}\n`);

    const stale: string[] = [];
    const recovered = useStore(directory, {
      onStaleLock: (holder) => stale.push(holder),
    });
    expect(await recovered.units.add({ id: "u1", track: "build" })).toMatchObject({ id: "u1" });
    expect(stale).toEqual([String(exited.pid)]);
    await recovered.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("blocks a writer and steals the pid lock only with force", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    await writeFile(join(directory, ".orch.lock"), `${process.pid}\n`);

    const blocked = useStore(directory);
    await expect(blocked.units.add({ id: "u1", track: "build" })).rejects.toThrow(
      `store lock held by pid ${process.pid}`,
    );

    const stolen: string[] = [];
    const forced = useStore(directory, {
      force: true,
      onLockStolen: (holder) => stolen.push(holder),
    });
    expect(await forced.units.add({ id: "u1", track: "build" })).toMatchObject({ id: "u1" });
    expect(stolen).toEqual([String(process.pid)]);
    await forced.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
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
      }),
    ).toMatchObject({ kind: "open", id: "release" });
    expect(await store.standing.add({ line: "Never force push." })).toEqual({
      number: 1,
      line: "Never force push.",
    });

    const first = await store.status.render();
    expect(first.changed).toBe("first render");
    expect(first.summary.openGateIds).toEqual(["release"]);
    expect(await readFile(join(directory, "status.md"), "utf8")).toContain(
      "| release | open | Ship now? |",
    );
    expect((await store.status.render()).changed).toBe("no derived changes");

    expect(await store.gates.resolve({ id: "release", answer: "ship" })).toMatchObject({
      kind: "resolved",
      answer: "ship",
    });
    expect((await store.status.render()).changed).toBe("open gates 1->0");
    expect(await store.gates.list()).toEqual([]);
    expect(await store.standing.show()).toEqual([{ number: 1, line: "Never force push." }]);
  });

  it("resolves the ordered gh-stack frontier and validates an optional pin", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);
    const viewJson = JSON.stringify({
      trunk: "main",
      currentBranch: "stack/open",
      branches: [
        {
          name: "stack/merged",
          head: stack.mergedSha,
          pr: { number: 10, state: "MERGED" },
          isMerged: true,
        },
        {
          name: "stack/closed",
          head: stack.closedSha,
          pr: { number: 13, state: "QUEUED" },
          isQueued: true,
        },
        {
          name: "stack/open",
          head: stack.openSha,
          pr: { number: 11, state: "OPEN" },
        },
      ],
    });

    await withFakeGh({
      directory,
      viewJson,
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
              state: "OPEN",
            },
            {
              pr: 11,
              branches: "stack/open",
              sha: stack.openSha,
              state: "OPEN",
            },
          ],
          lowestUnmerged: 13,
        });
        expect(
          (
            await store.frontier.set({
              repo: stack.repo,
              prs: [10, 13, 11],
            })
          ).generation,
        ).toBe(2);
        expect((await store.frontier.show()).generation).toBe(2);
        await expect(
          store.frontier.set({
            repo: stack.repo,
            prs: [10, 11, 12],
          }),
        ).rejects.toThrow(
          "frontier pin mismatch: missing from gh stack: 12; extra in gh stack: 13",
        );
        await expect(
          store.frontier.set({
            repo: stack.repo,
            prs: [13, 10, 11],
          }),
        ).rejects.toThrow(
          "frontier pin mismatch: order differs: expected 13,10,11; gh stack 10,13,11",
        );
        await expect(
          store.frontier.set({
            repo: stack.repo,
            prs: [10, 10],
          }),
        ).rejects.toThrow("--prs must not contain duplicates");
      },
    });
  });

  it("rejects unparseable gh stack output loudly", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGh({
      directory,
      viewJson: "this is not json",
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gh stack view --json output is not JSON",
        );
      },
    });
  });

  it("rejects gh stack JSON with an invalid shape", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGh({
      directory,
      viewJson: JSON.stringify({ trunk: "main" }),
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gh stack view --json has an invalid shape",
        );
      },
    });
  });

  it("rejects a stack branch with no PR", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGh({
      directory,
      viewJson: JSON.stringify({
        trunk: "main",
        branches: [{ name: "stack/open" }],
      }),
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gh stack view --json branch stack/open has no pull request",
        );
      },
    });
  });

  it("rejects a stack branch with no usable head SHA", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGh({
      directory,
      viewJson: JSON.stringify({
        trunk: "main",
        branches: [
          {
            name: "stack/open",
            pr: { number: 11, state: "OPEN" },
          },
        ],
      }),
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gh stack view --json branch stack/open has no usable head SHA",
        );
      },
    });
  });

  it("rejects contradictory PR state and isMerged", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeGh({
      directory,
      viewJson: JSON.stringify({
        trunk: "main",
        branches: [
          {
            name: "stack/open",
            pr: { number: 11, state: "OPEN" },
            isMerged: true,
          },
        ],
      }),
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "gh stack view --json branch stack/open has contradictory merge flags",
        );
      },
    });
  });

  it("rejects malformed TSV, verdict, frontier, and inbox data", async () => {
    const { directory, store } = await initializedStore();

    await writeFile(join(directory, "units.tsv"), "wrong\n");
    await expect(store.units.list()).rejects.toThrow("units.tsv has an invalid header");
    await writeFile(
      join(directory, "units.tsv"),
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nshort\trow\n",
    );
    await expect(store.units.list()).rejects.toThrow("units.tsv has a malformed row");

    await writeFile(
      join(directory, "ledger.tsv"),
      "pr\tsha\tverdict\tevidence\tverifier\tts\n1\tsha\tinvalid\treport\tme\tnow\n",
    );
    await expect(store.ledger.summary()).rejects.toThrow("ledger.tsv has invalid verdict invalid");

    await writeFile(join(directory, "frontier.json"), '{"generation":"1"}\n');
    await expect(store.frontier.show()).rejects.toThrow("frontier.json has an invalid shape");

    await writeFile(join(directory, "inbox", "bad.tsv"), "too\tshort\n");
    await expect(store.inbox.peek()).rejects.toThrow("inbox pointer bad.tsv is malformed");
  });

  it("rejects operations after close", async () => {
    const { store } = await initializedStore();
    await store.close();
    await expect(store.units.list()).rejects.toThrow("store is closed");
    await expect(store.status.render()).rejects.toBeInstanceOf(UserError);
  });
});
