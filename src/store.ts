import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  access,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";

const UNIT_HEADER = "id\ttrack\tstate\tbranch\tpr\tsha\tbrief";
const LEDGER_HEADER = "pr\tsha\tverdict\tevidence\tverifier\tts";
const LOCK_FILE = ".orch.lock";
const CLAIM_OWNER_FILE = "spawner";

export type Verdict =
  | "live-ui-verified"
  | "unit-test-verified"
  | "type-check-only"
  | "verifier-blocked"
  | "verifier-failed";

export interface Unit {
  readonly id: string;
  readonly track: string;
  readonly state: string;
  readonly branch: string;
  readonly pr: string;
  readonly sha: string;
  readonly brief: string;
}

export interface LedgerEntry {
  readonly pr: string;
  readonly sha: string;
  readonly verdict: Verdict;
  readonly evidence: string;
  readonly verifier: string;
  readonly ts: string;
}

export interface InboxPointer {
  readonly ts: string;
  readonly spawner: string;
  readonly agent: string;
  readonly unit: string;
  readonly status: string;
  readonly report: string;
}

export interface InboxPushResult {
  readonly pointer: InboxPointer;
  readonly filename: string;
}

export interface InboxClaim {
  readonly id: string;
  readonly spawner: string;
  readonly pointers: readonly InboxPointer[];
}

export interface InboxReclaimResult {
  readonly claims: readonly string[];
  readonly pointers: readonly InboxPointer[];
}

export interface OpenGate {
  readonly kind: "open";
  readonly id: string;
  readonly question: string;
  readonly options: string;
  readonly defaultAnswer: string;
}

export interface ResolvedGate {
  readonly kind: "resolved";
  readonly id: string;
  readonly question: string;
  readonly options: string;
  readonly defaultAnswer: string;
  readonly answer: string;
}

export type Gate = OpenGate | ResolvedGate;

export type FrontierPrState = "OPEN" | "MERGED" | "CLOSED";

export interface FrontierPr {
  readonly pr: number;
  readonly branches: string;
  readonly sha: string;
  readonly state: FrontierPrState;
}

export interface Frontier {
  readonly generation: number;
  readonly prs: readonly FrontierPr[];
  readonly lowestUnmerged: number | null;
}

export interface StandingLine {
  readonly number: number;
  readonly line: string;
}

export type Counts = Readonly<Record<string, number>>;

export interface StatusSummary {
  readonly unitStates: Counts;
  readonly ledgerVerdicts: Counts;
  readonly frontierGeneration: number;
  readonly openGateIds: readonly string[];
}

export interface StatusReport {
  readonly units: readonly Unit[];
  readonly ledger: readonly LedgerEntry[];
  readonly frontier: Frontier;
  readonly gates: readonly Gate[];
  readonly summary: StatusSummary;
  readonly changed: string;
}

export interface AddUnitParams {
  readonly id: string;
  readonly track: string;
  readonly brief?: string;
}

export interface SetUnitParams {
  readonly id: string;
  readonly state: string;
  readonly branch?: string;
  readonly pr?: number;
  readonly sha?: string;
}

export interface ListUnitsParams {
  readonly state?: string;
  readonly track?: string;
}

export interface RecordLedgerParams {
  readonly pr: number;
  readonly sha: string;
  readonly verdict: Verdict;
  readonly evidence: string;
  readonly verifier?: string;
}

export interface CheckLedgerParams {
  readonly pr: number;
  readonly sha: string;
}

export interface PushInboxParams {
  readonly spawner: string;
  readonly agent: string;
  readonly unit: string;
  readonly status: string;
  readonly report?: string;
}

export interface ClaimInboxParams {
  readonly spawner: string;
}

export interface AckInboxParams {
  readonly spawner: string;
  readonly claim: string;
}

export interface ReclaimInboxParams {
  readonly spawner: string;
  readonly claim?: string;
}
export interface InitStoreParams {
  readonly spawner: string;
}

export interface ParkGateParams {
  readonly id: string;
  readonly question: string;
  readonly options: string;
  readonly defaultAnswer: string;
}

export interface ResolveGateParams {
  readonly id: string;
  readonly answer: string;
}

export interface SetFrontierParams {
  readonly repo: string;
  readonly prs?: readonly number[];
}

export interface AddStandingParams {
  readonly line: string;
}

export interface OpenStoreOptions {
  readonly force?: boolean;
  readonly onLockStolen?: (holder: string) => void;
  readonly onStaleLock?: (holder: string) => void;
}

export interface Store {
  readonly units: {
    readonly add: (params: AddUnitParams) => Promise<Unit>;
    readonly set: (params: SetUnitParams) => Promise<Unit>;
    readonly get: (id: string) => Promise<Unit>;
    readonly list: (params?: ListUnitsParams) => Promise<readonly Unit[]>;
    readonly counts: () => Promise<Counts>;
  };
  readonly ledger: {
    readonly record: (params: RecordLedgerParams) => Promise<LedgerEntry>;
    readonly check: (params: CheckLedgerParams) => Promise<LedgerEntry>;
    readonly summary: () => Promise<Counts>;
  };
  readonly inbox: {
    readonly push: (params: PushInboxParams) => Promise<InboxPushResult>;
    readonly claim: (params: ClaimInboxParams) => Promise<InboxClaim | null>;
    readonly ack: (params: AckInboxParams) => Promise<InboxClaim>;
    readonly reclaim: (params: ReclaimInboxParams) => Promise<InboxReclaimResult>;
    readonly peek: () => Promise<readonly InboxPointer[]>;
    readonly count: () => Promise<number>;
  };
  readonly gates: {
    readonly park: (params: ParkGateParams) => Promise<OpenGate>;
    readonly list: () => Promise<readonly OpenGate[]>;
    readonly resolve: (params: ResolveGateParams) => Promise<ResolvedGate>;
  };
  readonly frontier: {
    readonly set: (params: SetFrontierParams) => Promise<Frontier>;
    readonly show: () => Promise<Frontier>;
  };
  readonly standing: {
    readonly show: () => Promise<readonly StandingLine[]>;
    readonly add: (params: AddStandingParams) => Promise<StandingLine>;
  };
  readonly status: {
    readonly render: () => Promise<StatusReport>;
  };
  readonly init: (params: InitStoreParams) => Promise<{ readonly store: string }>;
  readonly close: () => Promise<void>;
}

export interface NotFoundOutput {
  readonly compact: string;
  readonly json: object;
}

export class UserError extends Error {}
export class UsageError extends UserError {}
export class NotFoundError extends UserError {
  public constructor(
    message: string,
    public readonly output?: NotFoundOutput,
  ) {
    super(message);
  }
}

const errnoSchema = z.object({ code: z.string() });

function errorCode(cause: Error): string | null {
  const parsed = errnoSchema.safeParse(cause);
  return parsed.success ? parsed.data.code : null;
}

function errorMessage(cause: Error): string {
  return cause.message;
}

function verdictOrNull(value: string): Verdict | null {
  switch (value) {
    case "live-ui-verified":
    case "unit-test-verified":
    case "type-check-only":
    case "verifier-blocked":
    case "verifier-failed":
      return value;
    default:
      return null;
  }
}

export function parseVerdict(value: string): Verdict {
  const verdict = verdictOrNull(value);
  if (verdict === null) {
    throw new UserError(
      "verdict must be live-ui-verified, unit-test-verified, type-check-only, verifier-blocked, or verifier-failed",
    );
  }
  return verdict;
}

function cleanCell(value: string): string {
  const cleaned = value.replace(/[\t\n\r]/g, " ");
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

function requiredCell(value: string, label: string): string {
  const cleaned = cleanCell(value);
  if (cleaned.trim().length === 0) {
    throw new UserError(`${label} must not be empty`);
  }
  return cleaned;
}

function requiredLine(value: string, label: string): string {
  const cleaned = value.replace(/[\n\r]/g, " ").trim();
  if (cleaned.length === 0) {
    throw new UserError(`${label} must not be empty`);
  }
  return cleaned;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new UserError(`${label} must be a positive integer`);
  }
  return value;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeIfMissing(path: string, contents: string): Promise<void> {
  if (!(await exists(path))) {
    await atomicWrite(path, contents);
  }
}

async function requiredFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    if (errorCode(error) === "ENOENT") {
      throw new UserError(`store is not initialized at ${dirname(path)}; run orch init`);
    }
    throw error;
  }
}

function holderIsDead(holder: string): boolean {
  const pid = Number.parseInt(holder, 10);
  if (!Number.isSafeInteger(pid) || pid <= 0 || String(pid) !== holder) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return errorCode(error) === "ESRCH";
  }
}

async function acquireLock(store: string, options: OpenStoreOptions): Promise<() => Promise<void>> {
  const path = join(store, LOCK_FILE);
  const pid = String(process.pid);
  const create = async (): Promise<void> => {
    const handle = await open(path, "wx");
    await handle.writeFile(`${pid}\n`);
    await handle.close();
  };

  const takeOver = async (): Promise<void> => {
    await unlink(path);
    try {
      await create();
    } catch (retryError) {
      if (!(retryError instanceof Error)) {
        throw retryError;
      }
      if (errorCode(retryError) === "EEXIST") {
        const retryHolder = (await readFile(path, "utf8")).trim() || "unknown";
        throw new UserError(`store lock held by pid ${retryHolder}`);
      }
      throw retryError;
    }
  };

  try {
    await create();
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    if (errorCode(error) !== "EEXIST") {
      throw error;
    }
    let holder = "unknown";
    try {
      holder = (await readFile(path, "utf8")).trim() || "unknown";
    } catch {
      holder = "unknown";
    }
    if (holderIsDead(holder)) {
      options.onStaleLock?.(holder);
      await takeOver();
    } else if (options.force) {
      options.onLockStolen?.(holder);
      await takeOver();
    } else {
      throw new UserError(`store lock held by pid ${holder}`);
    }
  }

  return async (): Promise<void> => {
    try {
      if ((await readFile(path, "utf8")).trim() === pid) {
        await unlink(path);
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }
    }
  };
}

async function readTsv(
  path: string,
  header: string,
  width: number,
): Promise<readonly (readonly string[])[]> {
  const lines = (await requiredFile(path)).replace(/\r/g, "").split("\n");
  if (lines.shift() !== header) {
    throw new UserError(`${basename(path)} has an invalid header`);
  }
  return lines
    .filter((value) => value.length > 0)
    .map((value) => {
      const cells = value.split("\t");
      if (cells.length !== width) {
        throw new UserError(`${basename(path)} has a malformed row`);
      }
      return cells;
    });
}

async function writeTsv(
  path: string,
  header: string,
  rows: readonly (readonly string[])[],
): Promise<void> {
  const body = rows.map((row) => row.map(cleanCell).join("\t")).join("\n");
  await atomicWrite(path, `${header}\n${body}${body.length > 0 ? "\n" : ""}`);
}

async function readUnits(store: string): Promise<readonly Unit[]> {
  return (await readTsv(join(store, "units.tsv"), UNIT_HEADER, 7)).map((row) => ({
    id: row[0] ?? "",
    track: row[1] ?? "",
    state: row[2] ?? "",
    branch: row[3] ?? "",
    pr: row[4] ?? "",
    sha: row[5] ?? "",
    brief: row[6] ?? "",
  }));
}

function unitCells(unit: Unit): readonly string[] {
  return [unit.id, unit.track, unit.state, unit.branch, unit.pr, unit.sha, unit.brief];
}

async function saveUnits(store: string, rows: readonly Unit[]): Promise<void> {
  await writeTsv(join(store, "units.tsv"), UNIT_HEADER, rows.map(unitCells));
}

async function readLedger(store: string): Promise<readonly LedgerEntry[]> {
  return (await readTsv(join(store, "ledger.tsv"), LEDGER_HEADER, 6)).map((row) => {
    const rawVerdict = row[2] ?? "";
    const verdict = verdictOrNull(rawVerdict);
    if (verdict === null) {
      throw new UserError(`ledger.tsv has invalid verdict ${rawVerdict}`);
    }
    return {
      pr: row[0] ?? "",
      sha: row[1] ?? "",
      verdict,
      evidence: row[3] ?? "",
      verifier: row[4] ?? "",
      ts: row[5] ?? "",
    };
  });
}

function ledgerCells(row: LedgerEntry): readonly string[] {
  return [row.pr, row.sha, row.verdict, row.evidence, row.verifier, row.ts];
}

async function saveLedger(store: string, rows: readonly LedgerEntry[]): Promise<void> {
  await writeTsv(join(store, "ledger.tsv"), LEDGER_HEADER, rows.map(ledgerCells));
}

function pointerCells(pointer: InboxPointer): readonly string[] {
  return [pointer.ts, pointer.spawner, pointer.agent, pointer.unit, pointer.status, pointer.report];
}

interface InboxEntry {
  readonly filename: string;
  readonly pointer: InboxPointer;
}

async function readPointerEntries(directory: string): Promise<readonly InboxEntry[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    if (errorCode(error) === "ENOENT") {
      throw new UserError(`store is not initialized at ${dirname(directory)}; run orch init`);
    }
    throw error;
  }
  const result: InboxEntry[] = [];
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsv"))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of files) {
    const raw = (await readFile(join(directory, entry.name), "utf8")).replace(/\r?\n$/, "");
    const row = raw.split("\t");
    if (/[\r\n]/.test(raw) || row.length !== 6) {
      throw new UserError(`inbox pointer ${entry.name} is malformed`);
    }
    result.push({
      filename: entry.name,
      pointer: {
        ts: row[0] ?? "",
        spawner: row[1] ?? "",
        agent: row[2] ?? "",
        unit: row[3] ?? "",
        status: row[4] ?? "",
        report: row[5] ?? "",
      },
    });
  }
  return result;
}

async function readPointers(directory: string): Promise<readonly InboxPointer[]> {
  return (await readPointerEntries(directory)).map((entry) => entry.pointer);
}

function requiredClaimId(value: string): string {
  const claim = requiredCell(value, "claim id");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(claim) || claim === "." || claim === "..") {
    throw new UserError("claim id is invalid");
  }
  return claim;
}

async function readClaimSpawner(directory: string): Promise<string> {
  const raw = await requiredFile(join(directory, CLAIM_OWNER_FILE));
  return requiredCell(raw.replace(/\r?\n$/, ""), "claim spawner");
}

async function migrateLegacyPointers(directory: string, spawnerValue: string): Promise<void> {
  const spawner = requiredCell(spawnerValue, "spawner");
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsv"))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const raw = (await readFile(path, "utf8")).replace(/\r?\n$/, "");
    const row = raw.split("\t");
    if (/[\r\n]/.test(raw) || (row.length !== 5 && row.length !== 6)) {
      throw new UserError(`inbox pointer ${entry.name} is malformed`);
    }
    if (row.length === 5) {
      await atomicWrite(
        path,
        `${[row[0] ?? "", spawner, ...row.slice(1)].map(cleanCell).join("\t")}\n`,
      );
    }
  }
}

function renderGates(rows: readonly Gate[]): string {
  if (rows.length === 0) {
    return "";
  }
  const blocks = rows.map((gate) => {
    const answer = gate.kind === "resolved" ? `\n- Answer: ${gate.answer}` : "";
    return `## ${gate.id}

- Status: ${gate.kind}
- Question: ${gate.question}
- Options: ${gate.options}
- Default: ${gate.defaultAnswer}${answer}`;
  });
  return `# Gates\n\n${blocks.join("\n\n")}\n`;
}

async function readGates(store: string): Promise<readonly Gate[]> {
  const raw = (await requiredFile(join(store, "gates.md"))).replace(/\r/g, "").trim();
  if (raw.length === 0) {
    return [];
  }
  const prefix = "# Gates\n\n## ";
  if (!raw.startsWith(prefix)) {
    throw new UserError("gates.md has an invalid heading");
  }
  const result: Gate[] = [];
  for (const block of raw.slice(prefix.length).split("\n\n## ")) {
    const lines = block.split("\n").filter((value) => value.length > 0);
    const id = lines.shift() ?? "";
    const fields = new Map<string, string>();
    for (const value of lines) {
      const match = /^- ([^:]+): (.*)$/.exec(value);
      if (match === null) {
        throw new UserError(`gates.md has a malformed gate ${id}`);
      }
      fields.set(match[1] ?? "", match[2] ?? "");
    }
    const status = fields.get("Status");
    const question = fields.get("Question");
    const options = fields.get("Options");
    const defaultAnswer = fields.get("Default");
    if (
      id.length === 0 ||
      question === undefined ||
      options === undefined ||
      defaultAnswer === undefined
    ) {
      throw new UserError(`gates.md has a malformed gate ${id}`);
    }
    if (status === "open") {
      result.push({ kind: "open", id, question, options, defaultAnswer });
    } else if (status === "resolved" && fields.has("Answer")) {
      result.push({
        kind: "resolved",
        id,
        question,
        options,
        defaultAnswer,
        answer: fields.get("Answer") ?? "",
      });
    } else {
      throw new UserError(`gates.md has invalid status ${status ?? ""}`);
    }
  }
  if (new Set(result.map((gate) => gate.id)).size !== result.length) {
    throw new UserError("gates.md has duplicate gate ids");
  }
  return result;
}

const frontierPrSchema = z.object({
  pr: z.number().int().positive(),
  branches: z.string().min(1),
  sha: z.string().min(1),
  state: z.enum(["OPEN", "MERGED", "CLOSED"]),
});
const frontierSchema = z.object({
  generation: z.number().int().nonnegative(),
  prs: z.array(frontierPrSchema),
  lowestUnmerged: z.number().int().nullable(),
});
const emptyObjectSchema = z.object({}).strict();
const countsSchema = z.record(z.string(), z.number().int().nonnegative());
const statusSummarySchema = z.object({
  unitStates: countsSchema,
  ledgerVerdicts: countsSchema,
  frontierGeneration: z.number(),
  openGateIds: z.array(z.string()),
});
const OPEN_GT_PR_STATUSES = new Set([
  "Trunk branch locked",
  "Changes requested",
  "Waiting on PRs in this stack to merge",
  "Waiting on downstack merge state",
  "Draft",
  "Required checks failed",
  "Undergoing failure detection",
  "Merge queue failed on current head commit",
  "Handed off to merge queue...",
  "Waiting on downstack",
  "Merge conflicts",
  "Needs reviewers",
  "Needs approvals",
  "Needs restack",
  "Queued to merge...",
  "Ready to merge",
  "Ready to merge as stack",
  "Rebasing...",
  "Waiting on CI...",
  "Stale, needs rebase onto trunk",
  "Unresolved comments",
  "Waiting on required CI",
  "Waiting to merge...",
]);

function parseFrontier(raw: string): Frontier {
  let decoded: z.input<typeof frontierSchema> | Record<string, never>;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new UserError("frontier.json is not valid JSON");
  }
  if (emptyObjectSchema.safeParse(decoded).success) {
    return { generation: 0, prs: [], lowestUnmerged: null };
  }
  const parsed = frontierSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new UserError("frontier.json has an invalid shape");
  }
  return parsed.data;
}

async function readFrontier(store: string): Promise<Frontier> {
  return parseFrontier(await requiredFile(join(store, "frontier.json")));
}

async function readStanding(store: string): Promise<readonly StandingLine[]> {
  const raw = (await requiredFile(join(store, "preferences.md"))).replace(/\r/g, "");
  if (raw.trim().length === 0) {
    return [];
  }
  const result: StandingLine[] = [];
  for (const value of raw.split("\n").filter((item) => item.length > 0)) {
    const match = /^([1-9]\d*)\. (.+)$/.exec(value);
    const number = Number(match?.[1] ?? 0);
    if (match === null || number !== result.length + 1) {
      throw new UserError("preferences.md has malformed numbering");
    }
    result.push({ number, line: match[2] ?? "" });
  }
  return result;
}

function countValues(values: readonly string[]): Counts {
  const result: Record<string, number> = {};
  for (const value of values) {
    result[value] = (result[value] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function summarize(
  unitRows: readonly Unit[],
  ledgerRows: readonly LedgerEntry[],
  currentFrontier: Frontier,
  gateRows: readonly Gate[],
): StatusSummary {
  return {
    unitStates: countValues(unitRows.map((unit) => unit.state)),
    ledgerVerdicts: countValues(ledgerRows.map((row) => row.verdict)),
    frontierGeneration: currentFrontier.generation,
    openGateIds: gateRows
      .filter((gate): gate is OpenGate => gate.kind === "open")
      .map((gate) => gate.id)
      .sort(),
  };
}

function previousSummary(raw: string): StatusSummary | null {
  const match = /<!-- orch-summary (.+) -->/.exec(raw);
  if (match === null) {
    return null;
  }
  try {
    return statusSummarySchema.parse(JSON.parse(match[1] ?? ""));
  } catch {
    return null;
  }
}

function changed(before: StatusSummary | null, after: StatusSummary): string {
  if (before === null) {
    return "first render";
  }
  const result: string[] = [];
  const groups: readonly {
    readonly label: string;
    readonly oldCounts: Counts;
    readonly newCounts: Counts;
  }[] = [
    {
      label: "units",
      oldCounts: before.unitStates,
      newCounts: after.unitStates,
    },
    {
      label: "ledger",
      oldCounts: before.ledgerVerdicts,
      newCounts: after.ledgerVerdicts,
    },
  ];
  for (const { label, oldCounts, newCounts } of groups) {
    const names = [...new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)])].sort();
    for (const name of names) {
      const oldCount = oldCounts[name] ?? 0;
      const newCount = newCounts[name] ?? 0;
      if (oldCount !== newCount) {
        result.push(`${label} ${name} ${oldCount}->${newCount}`);
      }
    }
  }
  if (before.frontierGeneration !== after.frontierGeneration) {
    result.push(`frontier generation ${before.frontierGeneration}->${after.frontierGeneration}`);
  }
  if (before.openGateIds.join("\0") !== after.openGateIds.join("\0")) {
    result.push(`open gates ${before.openGateIds.length}->${after.openGateIds.length}`);
  }
  return result.length === 0 ? "no derived changes" : result.join("; ");
}

function markdown(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) {
    return "(none)";
  }
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdown).join(" | ")} |`),
  ].join("\n");
}

function statusMarkdown(
  unitRows: readonly Unit[],
  ledgerRows: readonly LedgerEntry[],
  currentFrontier: Frontier,
  gateRows: readonly Gate[],
  currentSummary: StatusSummary,
): string {
  return `# Orchestrate status

Generated: ${new Date().toISOString()}

## Units

States: ${countLine(currentSummary.unitStates)}

${table(["ID", "Track", "State", "Branch", "PR", "SHA", "Brief"], unitRows.map(unitCells))}

## Verification ledger

Verdicts: ${countLine(currentSummary.ledgerVerdicts)}

${table(["PR", "SHA", "Verdict", "Evidence", "Verifier", "Timestamp"], ledgerRows.map(ledgerCells))}

## Frontier

Generation: ${currentFrontier.generation}
Lowest unmerged: ${currentFrontier.lowestUnmerged ?? "none"}

${table(
  ["Branch", "PR", "SHA", "State"],
  currentFrontier.prs.map((row) => [row.branches, String(row.pr), row.sha, row.state]),
)}

## Gates

${table(
  ["ID", "Status", "Question", "Options", "Default", "Answer"],
  gateRows.map((gate) => [
    gate.id,
    gate.kind,
    gate.question,
    gate.options,
    gate.defaultAnswer,
    gate.kind === "resolved" ? gate.answer : "",
  ]),
)}

<!-- orch-summary ${JSON.stringify(currentSummary)} -->
`;
}

function countLine(value: Counts): string {
  const entries = Object.entries(value);
  return entries.length === 0
    ? "none"
    : entries.map(([name, count]) => `${name}=${count}`).join(", ");
}

interface GtPullRequest {
  readonly pr: number;
  readonly state: FrontierPrState;
}

function runGt({
  args,
  repo,
}: {
  args: readonly string[];
  repo: string;
}): string {
  try {
    return execFileSync("gt", ["--no-interactive", ...args], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    if (args[0] === "auth") {
      throw new UserError(
        `gt is missing or unauthenticated: ${errorMessage(error)}. Install Graphite and run gt auth`,
      );
    }
    throw new UserError(`gt --no-interactive ${args.join(" ")} failed: ${errorMessage(error)}`);
  }
}

function parseGtPullRequest({
  branch,
  detail,
}: {
  branch: string;
  detail: string;
}): GtPullRequest {
  const match = /^(?:\[origin\] )?PR #([1-9]\d*)(?: \(([^)\r\n]+)\))?(?: .+)?$/.exec(detail);
  const pr = Number(match?.[1] ?? 0);
  if (match === null || !Number.isSafeInteger(pr)) {
    throw new UserError(`gt info output has an invalid PR row for branch ${branch}: ${detail}`);
  }
  const status = match[2];
  if (status === "Merged") {
    return { pr, state: "MERGED" };
  }
  if (status === "Closed") {
    return { pr, state: "CLOSED" };
  }
  if (status === undefined || OPEN_GT_PR_STATUSES.has(status)) {
    return { pr, state: "OPEN" };
  }
  throw new UserError(`gt info output has an unknown PR state for branch ${branch}: ${status}`);
}

function parseGtBranches(raw: string): readonly string[] {
  const branches: string[] = [];
  const lines = raw.replace(/\r/g, "").split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) {
      continue;
    }
    const branchMatch = /^(?:│ )*[◯◉] +([^\s]+)((?: \([^()\r\n]*\))*)$/.exec(line);
    if (branchMatch === null) {
      throw new UserError(
        `gt log short output has an unparseable line ${index + 1}: ${JSON.stringify(line)}`,
      );
    }
    const branch = branchMatch[1] ?? "";
    if (branches.includes(branch)) {
      throw new UserError(`gt log short output contains duplicate branch ${branch}`);
    }
    branches.push(branch);
  }
  const trunk = branches[0];
  if (trunk === undefined) {
    throw new UserError("gt log short output did not contain a stack");
  }
  return branches.slice(1);
}

function graphitePullRequest({
  branch,
  repo,
}: {
  branch: string;
  repo: string;
}): GtPullRequest {
  const raw = runGt({ args: ["info", branch], repo });
  const rows = raw
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.startsWith("PR #") || line.startsWith("[origin] PR #"));
  if (rows.length === 0) {
    throw new UserError(
      `gt info output branch ${branch} has no pull request; this clone's gt metadata may predate the submit, so resolve the frontier from the stacker's clone or after gt sync`,
    );
  }
  if (rows.length > 1) {
    throw new UserError(`gt info output contains multiple PRs for branch ${branch}`);
  }
  return parseGtPullRequest({ branch, detail: rows[0] ?? "" });
}

function branchSha({
  branch,
  repo,
}: {
  branch: string;
  repo: string;
}): string {
  let raw: string;
  try {
    raw = execFileSync("git", ["rev-parse", branch], {
      cwd: repo,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    throw new UserError(`git rev-parse ${branch} failed: ${errorMessage(error)}`);
  }
  const sha = raw.trim();
  if (!/^[0-9a-f]{40,64}$/i.test(sha)) {
    throw new UserError(`git rev-parse ${branch} returned an invalid SHA`);
  }
  return sha;
}

function resolveFrontier(repo: string): readonly FrontierPr[] {
  runGt({ args: ["auth"], repo });
  const raw = runGt({ args: ["log", "short", "--stack", "--reverse"], repo });
  const result = parseGtBranches(raw).map((branch) => {
    const pullRequest = graphitePullRequest({ branch, repo });
    return {
      pr: pullRequest.pr,
      state: pullRequest.state,
      branches: branch,
      sha: branchSha({ branch, repo }),
    };
  });
  if (result.length === 0) {
    throw new UserError("gt log short output did not contain a stack");
  }
  if (new Set(result.map((row) => row.pr)).size !== result.length) {
    throw new UserError("gt info output contains duplicate pull requests");
  }
  return result;
}

function validateFrontierPin({
  actual,
  expected,
}: {
  actual: readonly number[];
  expected: readonly number[];
}): void {
  if (actual.length === expected.length && actual.every((pr, index) => pr === expected[index])) {
    return;
  }
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((pr) => !actualSet.has(pr));
  const extra = actual.filter((pr) => !expectedSet.has(pr));
  const drift: string[] = [];
  if (missing.length > 0) {
    drift.push(`missing from gt: ${missing.join(",")}`);
  }
  if (extra.length > 0) {
    drift.push(`extra in gt: ${extra.join(",")}`);
  }
  if (missing.length === 0 && extra.length === 0) {
    drift.push(`order differs: expected ${expected.join(",")}; gt ${actual.join(",")}`);
  }
  throw new UserError(`frontier pin mismatch: ${drift.join("; ")}`);
}

export function openStore(directory: string, options: OpenStoreOptions = {}): Store {
  const store = resolve(directory);
  let closed = false;
  let releaseLock: (() => Promise<void>) | null = null;
  let lockRequest: Promise<void> | null = null;

  const ensureOpen = (): void => {
    if (closed) {
      throw new UserError("store is closed");
    }
  };

  const ensureLock = async (): Promise<void> => {
    ensureOpen();
    if (releaseLock !== null) {
      return;
    }
    if (lockRequest === null) {
      lockRequest = acquireLock(store, options).then((release) => {
        releaseLock = release;
      });
    }
    try {
      await lockRequest;
    } catch (error) {
      lockRequest = null;
      throw error;
    }
  };

  const beginWrite = async (): Promise<void> => {
    ensureOpen();
    if (!(await exists(store))) {
      throw new UserError(`store is not initialized at ${store}; run orch init`);
    }
    await ensureLock();
  };

  return {
    units: {
      add: async (params) => {
        await beginWrite();
        const row: Unit = {
          id: requiredCell(params.id, "unit id"),
          track: requiredCell(params.track, "track"),
          state: "pending",
          branch: "",
          pr: "",
          sha: "",
          brief: params.brief === undefined ? "" : requiredCell(params.brief, "brief"),
        };
        const rows = [...(await readUnits(store))];
        if (rows.some((unit) => unit.id === row.id)) {
          throw new UserError(`unit ${row.id} already exists`);
        }
        rows.push(row);
        await saveUnits(store, rows);
        return row;
      },
      set: async (params) => {
        await beginWrite();
        const id = requiredCell(params.id, "unit id");
        const state = requiredCell(params.state, "state");
        const rows = [...(await readUnits(store))];
        const index = rows.findIndex((unit) => unit.id === id);
        const old = rows[index];
        if (index < 0 || old === undefined) {
          throw new NotFoundError(`unit ${id} not found`);
        }
        const row: Unit = {
          ...old,
          state,
          branch: params.branch === undefined ? old.branch : requiredCell(params.branch, "branch"),
          pr: params.pr === undefined ? old.pr : String(positiveInteger(params.pr, "PR")),
          sha: params.sha === undefined ? old.sha : requiredCell(params.sha, "SHA"),
        };
        rows[index] = row;
        await saveUnits(store, rows);
        return row;
      },
      get: async (id) => {
        ensureOpen();
        const cleanId = requiredCell(id, "unit id");
        const row = (await readUnits(store)).find((unit) => unit.id === cleanId);
        if (row === undefined) {
          throw new NotFoundError(`unit ${cleanId} not found`);
        }
        return row;
      },
      list: async (params = {}) => {
        ensureOpen();
        const state = params.state === undefined ? undefined : requiredCell(params.state, "state");
        const track = params.track === undefined ? undefined : requiredCell(params.track, "track");
        return (await readUnits(store)).filter(
          (unit) =>
            (state === undefined || unit.state === state) &&
            (track === undefined || unit.track === track),
        );
      },
      counts: async () => {
        ensureOpen();
        return countValues((await readUnits(store)).map((unit) => unit.state));
      },
    },
    ledger: {
      record: async (params) => {
        await beginWrite();
        const verdict = parseVerdict(params.verdict);
        const row: LedgerEntry = {
          pr: String(positiveInteger(params.pr, "PR")),
          sha: requiredCell(params.sha, "SHA"),
          verdict,
          evidence: requiredCell(params.evidence, "evidence"),
          verifier: params.verifier === undefined ? "" : requiredCell(params.verifier, "verifier"),
          ts: new Date().toISOString(),
        };
        const rows = [...(await readLedger(store))];
        const index = rows.findIndex((old) => old.pr === row.pr && old.sha === row.sha);
        if (index < 0) {
          rows.push(row);
        } else {
          rows[index] = row;
        }
        await saveLedger(store, rows);
        return row;
      },
      check: async (params) => {
        ensureOpen();
        const pr = String(positiveInteger(params.pr, "PR"));
        const sha = requiredCell(params.sha, "SHA");
        const row = (await readLedger(store)).find((value) => value.pr === pr && value.sha === sha);
        if (row === undefined) {
          throw new NotFoundError("NOT-VERIFIED", {
            compact: "NOT-VERIFIED",
            json: { pr, sha, verdict: "NOT-VERIFIED" },
          });
        }
        return row;
      },
      summary: async () => {
        ensureOpen();
        return countValues((await readLedger(store)).map((row) => row.verdict));
      },
    },
    inbox: {
      push: async (params) => {
        await beginWrite();
        const pointer: InboxPointer = {
          ts: new Date().toISOString(),
          spawner: requiredCell(params.spawner, "spawner"),
          agent: requiredCell(params.agent, "agent"),
          unit: requiredCell(params.unit, "unit"),
          status: requiredCell(params.status, "status"),
          report: params.report === undefined ? "" : requiredCell(params.report, "report"),
        };
        const inbox = join(store, "inbox");
        if (!(await exists(inbox))) {
          throw new UserError(`store is not initialized at ${store}; run orch init`);
        }
        const timestamp = pointer.ts.replace(/[:.]/g, "-");
        const filename = `${timestamp}-${process.pid}-${randomUUID()}.tsv`;
        const contents = `${pointerCells(pointer).map(cleanCell).join("\t")}\n`;
        await atomicWrite(join(inbox, filename), contents);
        return { pointer, filename };
      },
      claim: async (params) => {
        await beginWrite();
        const spawner = requiredCell(params.spawner, "spawner");
        const inbox = join(store, "inbox");
        const entries = (await readPointerEntries(inbox)).filter(
          (entry) => entry.pointer.spawner === spawner,
        );
        if (entries.length === 0) {
          return null;
        }
        const id = randomUUID();
        const directory = join(store, "inbox-claimed", id);
        await mkdir(directory);
        await atomicWrite(join(directory, CLAIM_OWNER_FILE), `${spawner}\n`);
        for (const entry of entries) {
          await rename(join(inbox, entry.filename), join(directory, entry.filename));
        }
        return { id, spawner, pointers: entries.map((entry) => entry.pointer) };
      },
      ack: async (params) => {
        await beginWrite();
        const spawner = requiredCell(params.spawner, "spawner");
        const id = requiredClaimId(params.claim);
        const directory = join(store, "inbox-claimed", id);
        const owner = await readClaimSpawner(directory);
        if (owner !== spawner) {
          throw new UserError(`claim ${id} belongs to another spawner`);
        }
        const pointers = await readPointers(directory);
        await rm(directory, { recursive: true });
        return { id, spawner, pointers };
      },
      reclaim: async (params) => {
        await beginWrite();
        const spawner = requiredCell(params.spawner, "spawner");
        const root = join(store, "inbox-claimed");
        const ids =
          params.claim === undefined
            ? (await readdir(root, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .sort()
            : [requiredClaimId(params.claim)];
        const reclaimedClaims: string[] = [];
        const pointers: InboxPointer[] = [];
        for (const id of ids) {
          const directory = join(root, id);
          const owner = await readClaimSpawner(directory);
          if (owner !== spawner) {
            if (params.claim !== undefined) {
              throw new UserError(`claim ${id} belongs to another spawner`);
            }
            continue;
          }
          const entries = await readPointerEntries(directory);
          for (const entry of entries) {
            const destination = join(store, "inbox", entry.filename);
            if (await exists(destination)) {
              throw new UserError(
                `cannot reclaim claim ${id}: inbox already has ${entry.filename}`,
              );
            }
            await rename(join(directory, entry.filename), destination);
            pointers.push(entry.pointer);
          }
          await rm(directory, { recursive: true });
          reclaimedClaims.push(id);
        }
        return { claims: reclaimedClaims, pointers };
      },
      peek: async () => {
        ensureOpen();
        return readPointers(join(store, "inbox"));
      },
      count: async () => {
        ensureOpen();
        return (await readPointers(join(store, "inbox"))).length;
      },
    },
    gates: {
      park: async (params) => {
        await beginWrite();
        const gate: OpenGate = {
          kind: "open",
          id: requiredLine(params.id, "gate id"),
          question: requiredLine(params.question, "question"),
          options: requiredLine(params.options, "options"),
          defaultAnswer: requiredLine(params.defaultAnswer, "default"),
        };
        const rows = [...(await readGates(store))];
        const index = rows.findIndex((old) => old.id === gate.id);
        if (index < 0) {
          rows.push(gate);
        } else {
          rows[index] = gate;
        }
        await atomicWrite(join(store, "gates.md"), renderGates(rows));
        return gate;
      },
      list: async () => {
        ensureOpen();
        return (await readGates(store)).filter((gate): gate is OpenGate => gate.kind === "open");
      },
      resolve: async (params) => {
        await beginWrite();
        const id = requiredLine(params.id, "gate id");
        const rows = [...(await readGates(store))];
        const index = rows.findIndex((gate) => gate.id === id);
        const old = rows[index];
        if (index < 0 || old === undefined) {
          throw new NotFoundError(`gate ${id} not found`);
        }
        const gate: ResolvedGate = {
          kind: "resolved",
          id: old.id,
          question: old.question,
          options: old.options,
          defaultAnswer: old.defaultAnswer,
          answer: requiredLine(params.answer, "answer"),
        };
        rows[index] = gate;
        await atomicWrite(join(store, "gates.md"), renderGates(rows));
        return gate;
      },
    },
    frontier: {
      set: async (params) => {
        await beginWrite();
        const repo = resolve(requiredLine(params.repo, "repo directory"));
        const pin =
          params.prs === undefined ? undefined : params.prs.map((pr) => positiveInteger(pr, "PR"));
        if (pin !== undefined && new Set(pin).size !== pin.length) {
          throw new UserError("--prs must not contain duplicates");
        }
        const old = await readFrontier(store);
        const prs = resolveFrontier(repo);
        if (pin !== undefined) {
          validateFrontierPin({
            actual: prs.map((row) => row.pr),
            expected: pin,
          });
        }
        const value: Frontier = {
          generation: old.generation + 1,
          prs,
          lowestUnmerged: prs.find((row) => row.state === "OPEN")?.pr ?? null,
        };
        await atomicWrite(join(store, "frontier.json"), `${JSON.stringify(value, null, 2)}\n`);
        return value;
      },
      show: async () => {
        ensureOpen();
        return readFrontier(store);
      },
    },
    standing: {
      show: async () => {
        ensureOpen();
        return readStanding(store);
      },
      add: async (params) => {
        await beginWrite();
        const rows = [...(await readStanding(store))];
        const item: StandingLine = {
          number: rows.length + 1,
          line: requiredLine(params.line, "standing order"),
        };
        rows.push(item);
        await atomicWrite(
          join(store, "preferences.md"),
          `${rows.map((row) => `${row.number}. ${row.line}`).join("\n")}\n`,
        );
        return item;
      },
    },
    status: {
      render: async () => {
        await beginWrite();
        const unitRows = await readUnits(store);
        const ledgerRows = await readLedger(store);
        const currentFrontier = await readFrontier(store);
        const gateRows = await readGates(store);
        const currentSummary = summarize(unitRows, ledgerRows, currentFrontier, gateRows);
        const path = join(store, "status.md");
        const before = (await exists(path)) ? previousSummary(await readFile(path, "utf8")) : null;
        const change = changed(before, currentSummary);
        await atomicWrite(
          path,
          statusMarkdown(unitRows, ledgerRows, currentFrontier, gateRows, currentSummary),
        );
        return {
          units: unitRows,
          ledger: ledgerRows,
          frontier: currentFrontier,
          gates: gateRows,
          summary: currentSummary,
          changed: change,
        };
      },
    },
    init: async (params) => {
      ensureOpen();
      const spawner = requiredCell(params.spawner, "spawner");
      await mkdir(store, { recursive: true });
      await ensureLock();
      await writeIfMissing(join(store, "units.tsv"), `${UNIT_HEADER}\n`);
      await writeIfMissing(join(store, "ledger.tsv"), `${LEDGER_HEADER}\n`);
      await mkdir(join(store, "inbox"), { recursive: true });
      await mkdir(join(store, "inbox-claimed"), { recursive: true });
      await migrateLegacyPointers(join(store, "inbox"), spawner);
      await writeIfMissing(join(store, "gates.md"), "");
      await writeIfMissing(join(store, "preferences.md"), "");
      await writeIfMissing(join(store, "frontier.json"), "{}\n");
      return { store };
    },
    close: async () => {
      if (closed) {
        return;
      }
      if (lockRequest !== null) {
        try {
          await lockRequest;
        } catch {
          // A failed acquisition has no lock to release.
        }
      }
      const release = releaseLock;
      releaseLock = null;
      closed = true;
      if (release !== null) {
        await release();
      }
    },
  };
}

export { openStore as store };
