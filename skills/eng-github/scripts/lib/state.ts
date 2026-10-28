import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EngGithubError } from "./errors.ts";

const LOCK_STALE_MS = 10_000;
const LOCK_TIMEOUT_MS = 20_000;
const LOCK_SPIN_MS = 5;
const spinCell = new Int32Array(new SharedArrayBuffer(4));
export const ETAG_MAX_ENTRIES = 512;
export const ETAG_MAX_BYTES = 256 * 1024 * 1024;

export interface QuotaSnapshot {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
  readonly cost: number;
}

export interface CredentialState {
  readonly pauseUntil?: number;
  readonly pauseReason?: string;
  readonly backoffMs?: number;
  readonly pauseSeq?: number;
  readonly graphql?: QuotaSnapshot;
  readonly core?: QuotaSnapshot;
  readonly lastMutationAt?: number;
}

export function stateRoot(): string {
  const base = process.env.ENG_GITHUB_STATE_DIR ?? join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "eng-github");
  mkdirSync(base, { recursive: true, mode: 0o700 });
  return base;
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, path);
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lockIsStale(lockPath: string): boolean {
  try {
    if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) return true;
    const pid = Number(readFileSync(lockPath, "utf8"));
    return Number.isInteger(pid) && pid > 0 && !alive(pid);
  } catch {
    return false;
  }
}

function acquire(lockPath: string): void {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      try {
        writeSync(fd, String(process.pid));
      } finally {
        closeSync(fd);
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (lockIsStale(lockPath)) {
      try {
        unlinkSync(lockPath);
      } catch {}
      continue;
    }
    if (Date.now() > deadline) throw new EngGithubError("failure", `Timed out waiting for state lock ${lockPath}`);
    Atomics.wait(spinCell, 0, 0, LOCK_SPIN_MS);
  }
}

export class StateStore {
  private readonly path: string;
  private readonly lockPath: string;
  private readonly etagDir: string;

  constructor(fingerprint: string, root = stateRoot()) {
    const key = digest(fingerprint).slice(0, 32);
    this.path = join(root, `${key}.json`);
    this.lockPath = `${this.path}.lock`;
    this.etagDir = join(root, "etag", key);
  }

  read(): CredentialState {
    return readJson<CredentialState>(this.path) ?? {};
  }

  update(change: (current: CredentialState) => CredentialState): CredentialState {
    acquire(this.lockPath);
    try {
      const current = this.read();
      const next = change(current);
      if (next !== current) writeAtomic(this.path, JSON.stringify(next));
      return next;
    } finally {
      try {
        unlinkSync(this.lockPath);
      } catch {}
    }
  }

  readEtag(url: string): { etag: string; body: string; link?: string } | undefined {
    return readJson(join(this.etagDir, `${digest(url)}.json`));
  }

  touchEtag(url: string, now = new Date()): void {
    try {
      utimesSync(join(this.etagDir, `${digest(url)}.json`), now, now);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }

  writeEtag(url: string, etag: string, body: string, link: string | null): void {
    mkdirSync(this.etagDir, { recursive: true, mode: 0o700 });
    writeAtomic(join(this.etagDir, `${digest(url)}.json`), JSON.stringify({ etag, body, ...(link === null ? {} : { link }) }));
    const entries = readdirSync(this.etagDir).flatMap((name) => {
      if (!name.endsWith(".json")) return [];
      const path = join(this.etagDir, name);
      try {
        const stat = statSync(path);
        return [{ path, size: stat.size, mtime: stat.mtimeMs }];
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
        throw error;
      }
    }).sort((a, b) => a.mtime - b.mtime);
    let bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    let count = entries.length;
    for (const entry of entries) {
      if (count <= ETAG_MAX_ENTRIES && bytes <= ETAG_MAX_BYTES) break;
      try {
        unlinkSync(entry.path);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      count--;
      bytes -= entry.size;
    }
  }

  dropEtag(url: string): void {
    try {
      unlinkSync(join(this.etagDir, `${digest(url)}.json`));
    } catch {}
  }
}
