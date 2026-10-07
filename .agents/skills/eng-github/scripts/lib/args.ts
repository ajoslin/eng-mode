import { UsageError } from "./errors.ts";

export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, readonly string[]>;
}

export function parseArgs(argv: readonly string[], booleans: readonly string[] = []): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    let value: string;
    if (eq !== -1) value = arg.slice(eq + 1);
    else if (booleans.includes(name)) value = "true";
    else {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new UsageError(`--${name} needs a value`);
      value = next;
      index++;
    }
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }
  return { positionals, flags };
}

export function flag(args: ParsedArgs, name: string): string | undefined {
  const values = args.flags.get(name);
  return values?.[values.length - 1];
}

export function flags(args: ParsedArgs, name: string): readonly string[] {
  return args.flags.get(name) ?? [];
}

export function bool(args: ParsedArgs, name: string): boolean {
  return flag(args, name) === "true";
}

export function required(args: ParsedArgs, name: string): string {
  const value = flag(args, name);
  if (value === undefined || value === "") throw new UsageError(`--${name} is required`);
  return value;
}

export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], name: string, fallback: T): T {
  if (value === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value)) throw new UsageError(`--${name} must be one of ${allowed.join(", ")}`);
  return value as T;
}

export function positiveInt(value: string | undefined, name: string, fallback: number, min = 1): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) throw new UsageError(`--${name} must be an integer >= ${min}`);
  return parsed;
}

export function headPairs(value: string): ReadonlyMap<number, string> {
  const pairs = new Map<number, string>();
  for (const entry of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const [pr, sha] = entry.split("=");
    const number = Number(pr?.replace(/^#/, ""));
    if (!Number.isInteger(number) || number <= 0 || !sha || !/^[0-9a-f]{7,40}$/i.test(sha)) throw new UsageError(`--heads entry must be PR=SHA: ${entry}`);
    pairs.set(number, sha.toLowerCase());
  }
  if (pairs.size === 0) throw new UsageError("--heads needs at least one PR=SHA");
  return pairs;
}
