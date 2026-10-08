import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "./extension-types.ts";

export const RAW_GITHUB_BLOCK_REASON =
  "Blocked: Eng Mode routes all GitHub work through the eng-github skill. Read skill://eng-github and run `eng-github COMMAND` instead (snapshot, watch, threads, ci, comment, reply, resolve, merge, stack, api, graphql). Raw gh, gh api, gh stack, pr-cockpit, curl to api.github.com, OMP's github tool, and pr:// or issue:// reads are not allowed. `gh auth login|status|token` stays available.";

const ALLOWED_GH_SUBCOMMANDS = new Set(["auth", "--version", "version", "help", "--help"]);
const PREFIX_WORDS = new Set(["sudo", "exec", "command", "builtin", "time", "nice", "nohup", "env", "xargs", "timeout", "caffeinate", "do", "then", "else", "if", "elif", "while", "until", "!"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "fish"]);
const HTTP_CLIENTS = new Set(["curl", "wget", "http", "https", "xh"]);
const GITHUB_API_HOST = /\b(?:api|uploads)\.github\.com\b/;
const QUOTED = /'[^']*'|"(?:\\.|[^"\\])*"/g;

function basename(word: string): string {
  return word.slice(word.lastIndexOf("/") + 1);
}

function stripHeredocs(command: string): string {
  return command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, (match) => match.slice(0, match.indexOf("\n")));
}

interface Segment {
  readonly words: readonly string[];
}

function substitutions(text: string): string[] {
  const found: string[] = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
    } else if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end === -1) break;
      found.push(text.slice(index + 1, end));
      index = end;
    } else if (text.startsWith("$(", index)) {
      let depth = 1;
      let end = index + 2;
      for (; end < text.length && depth > 0; end++) {
        if (text[end] === "(") depth++;
        else if (text[end] === ")") depth--;
      }
      found.push(text.slice(index + 2, depth === 0 ? end - 1 : end));
      index = end - 1;
    }
  }
  return found;
}

function parse(command: string): Segment[] {
  const literals: string[] = [];
  const nested: string[] = [];
  const masked = stripHeredocs(command)
    .replace(/\\\n/g, " ")
    .replace(QUOTED, (literal) => {
      const body = literal.slice(1, -1);
      if (literal.startsWith('"')) nested.push(...substitutions(body));
      literals.push(body);
      return `\u0000${literals.length - 1}\u0000`;
    });
  const segments = masked
    .split(/\$\(|`|\|\||&&|[;|&\n(){}]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => ({
      words: (part.match(/\S+/g) ?? []).map((word) => word.replace(/\u0000(\d+)\u0000/g, (_, index: string) => literals[Number(index)] ?? "")),
    }));
  return [...segments, ...nested.flatMap(parse)];
}

function commandWords(all: readonly string[]): readonly string[] {
  let index = 0;
  while (index < all.length) {
    const word = all[index]!;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      index++;
      continue;
    }
    const name = basename(word);
    if (!PREFIX_WORDS.has(name)) break;
    index++;
    while (index < all.length && all[index]!.startsWith("-")) index++;
    if (name === "timeout" && index < all.length && /^\d/.test(all[index]!)) index++;
  }
  return all.slice(index);
}

function rawGithubWords(all: readonly string[], depth: number): boolean {
  const [head, ...rest] = commandWords(all);
  if (head === undefined) return false;
  const name = basename(head);
  if (name === "gh") {
    const sub = rest.find((word) => !word.startsWith("-") || ALLOWED_GH_SUBCOMMANDS.has(word));
    return sub === undefined || !ALLOWED_GH_SUBCOMMANDS.has(sub);
  }
  if (name === "pr-cockpit") return true;
  if (HTTP_CLIENTS.has(name)) return rest.some((word) => GITHUB_API_HOST.test(word));
  if (depth < 3 && SHELLS.has(name)) {
    const script = rest[rest.findIndex((word) => /^-\w*c$/.test(word)) + 1];
    return script !== undefined && rest.some((word) => /^-\w*c$/.test(word)) && shellUsesRawGithub(script, depth + 1);
  }
  if (depth < 3 && name === "eval") return shellUsesRawGithub(rest.join(" "), depth + 1);
  return false;
}

export function shellUsesRawGithub(command: string, depth = 0): boolean {
  return parse(command).some((segment) => rawGithubWords(segment.words, depth));
}

const CALL_OPENER =
  /\b(?:fetch|requests\.\w+|urlopen|httpx\.\w+|spawnSync|spawn|execFileSync|execFile|execSync|exec|subprocess\.\w+|os\.system|os\.popen)\s*\(/g;
const SHELL_TEMPLATE = /(?:\bBun\.)?\$`((?:\\.|[^`\\])*)`/g;

function callArguments(code: string, start: number): string {
  let depth = 1;
  let index = start;
  for (; index < code.length && depth > 0; index++) {
    const char = code[index];
    if (char === "'" || char === '"' || char === "`") {
      const literal = new RegExp(`${char}(?:\\\\.|[^${char}\\\\])*${char}`, "y");
      literal.lastIndex = index;
      const match = literal.exec(code);
      if (match) index += match[0].length - 1;
    } else if (char === "(") depth++;
    else if (char === ")") depth--;
  }
  return code.slice(start, index);
}

function literalsUseRawGithub(literals: readonly string[]): boolean {
  return literals.some((literal, index) => {
    if (GITHUB_API_HOST.test(literal)) return true;
    if (literal === "gh") {
      const next = literals[index + 1];
      return next === undefined || !ALLOWED_GH_SUBCOMMANDS.has(next);
    }
    if (literal === "pr-cockpit") return true;
    return shellUsesRawGithub(literal);
  });
}

export function evalUsesRawGithub(code: string): boolean {
  for (const line of code.split("\n")) {
    const bang = /^\s*!(.+)$/.exec(line);
    if (bang?.[1] !== undefined && shellUsesRawGithub(bang[1])) return true;
  }
  for (const match of code.matchAll(SHELL_TEMPLATE)) {
    const script = match[1] ?? "";
    if (GITHUB_API_HOST.test(script) || shellUsesRawGithub(script)) return true;
  }
  for (const match of code.matchAll(CALL_OPENER)) {
    const args = callArguments(code, match.index + match[0].length);
    const literals = [...args.matchAll(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g)].map((literal) => literal[0].slice(1, -1));
    if (literalsUseRawGithub(literals)) return true;
  }
  return false;
}

function pathIsRawGithub(path: unknown): boolean {
  return typeof path === "string" && /^(?:xd:\/\/github\b|pr:\/\/|issue:\/\/)/.test(path.trim());
}

export function blocksRawGithub(event: ToolCallEvent): boolean {
  const { toolName, input } = event;
  switch (toolName) {
    case "bash":
      return typeof input.command === "string" && shellUsesRawGithub(input.command);
    case "eval":
      return typeof input.code === "string" && evalUsesRawGithub(input.code);
    case "github":
      return true;
    case "read":
    case "write":
    case "grep":
    case "glob":
      return pathIsRawGithub(input.path);
    default:
      return false;
  }
}

export function registerGhGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", (event): ToolCallEventResult | void => {
    if (blocksRawGithub(event as ToolCallEvent)) return { block: true, reason: RAW_GITHUB_BLOCK_REASON };
  });
}
