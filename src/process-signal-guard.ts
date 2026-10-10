import type { ExtensionAPI, ToolCallEventResult } from "./extension-types.ts";

export const PROCESS_SIGNAL_BLOCK_REASON =
  "Blocked: pattern-based process signalling can terminate unrelated or production processes. Never use pkill, killall, or pgrep-derived kill targets. Use only an owned recorded PID or your own process group, recorded when you spawned it.";

type Call = { readonly toolName: string; readonly input: Record<string, unknown> };
const executable = /(?:^|[\s;|&(){}])(?:[^\s'";|&(){}]*\/)?(pkill|killall)(?=$|[\s;|&(){}])/;
const pgrep = /(?:^|[\s;|&(){}])(?:[^\s'";|&(){}]*\/)?pgrep(?=$|[\s;|&(){}])/;
const kill = /(?:^|[\s;|&(){}])(?:[^\s'";|&(){}]*\/)?kill(?=$|[\s;|&(){}])/;

function shellBlocked(command: string): boolean {
  const nested: string[] = [];
  const quotedExecutable = /(?:^|[;|&\n()]|\b(?:sudo|exec|command|builtin|nohup|xargs)\s+)\s*(['"])(?:[^'"\s]*\/)?(?:pkill|killall)\1(?=$|\s)/;
  if (quotedExecutable.test(command)) return true;
  const masked = command.replace(/\\\n/g, " ").replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, (literal) => {
    const body = literal.slice(1, -1);
    if (literal.startsWith('"')) {
      for (const substitution of body.matchAll(/\$\(([^)]*)\)|`([^`]*)`/g)) nested.push(substitution[1] ?? substitution[2] ?? "");
    }
    return " __quoted__ ";
  });
  for (const substitution of masked.matchAll(/`([^`]*)`/g)) nested.push(substitution[1] ?? "");
  if (executable.test(masked)) return true;
  // Preserve data flow across substitutions, assignments and pipelines.
  const withSubstitutions = masked + " " + nested.join(" ");
  if (pgrep.test(withSubstitutions) && kill.test(withSubstitutions)) return true;
  for (const signal of masked.matchAll(/(?:^|[\s;|&()])(?:[^\s]*\/)?kill\s+([^;|&\n]*)/g)) {
    const words = (signal[1] ?? "").trim().split(/\s+/);
    let index = 0;
    if (words[index] === "-s" || words[index] === "-n") index += 2;
    else if (/^-(?:[A-Za-z]+|[1-9]\d*)$/.test(words[index] ?? "")) index++;
    if (words[index] === "--") index++;
    const targets = words.slice(index);
    if (targets.length === 0 || targets.some((target) => !/^[1-9]\d*$/.test(target))) return true;
  }
  for (const wrapper of command.matchAll(/(?:^|[\s;|&()])(?:[^\s]*\/)?(?:bash|sh|zsh|dash|fish)\s+(?:-\w+\s+)*-\w*c\s+(['"])([\s\S]*?)\1/g)) {
    if (shellBlocked(wrapper[2] ?? "")) return true;
  }
  for (const wrapper of command.matchAll(/(?:^|[\s;|&()])eval\s+(['"])([\s\S]*?)\1/g)) {
    if (shellBlocked(wrapper[2] ?? "")) return true;
  }
  for (const wrapper of command.matchAll(/(?:^|[\s;|&()])(?:[^\s]*\/)?(?:python\d*(?:\.\d+)?|bun|node)\s+(?:-\w+\s+)*-(?:c|e|eval)\s+(['"])([\s\S]*?)\1/g)) {
    if (evalBlocked(wrapper[2] ?? "")) return true;
  }
  return nested.some((script) => shellBlocked(script));
}

function evalBlocked(code: string): boolean {
  for (const signal of code.matchAll(/\b(?:process|os)\.kill\s*\(\s*([^,)]+)/g)) {
    if (!/^[1-9]\d*$/.test((signal[1] ?? "").trim())) return true;
  }
  for (const match of code.matchAll(/(?:\bBun\.)?\$`([\s\S]*?)`|^\s*!(.+)$/gm)) {
    if (shellBlocked(match[1] ?? match[2] ?? "")) return true;
  }
  for (const match of code.matchAll(/\b(?:spawnSync|spawn|execFileSync|execFile|execSync|exec|subprocess\.\w+|os\.system|os\.popen)\s*\(([^\n]*)/g)) {
    const strings = [...(match[1] ?? "").matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)].map((literal) => literal[1] ?? literal[2] ?? literal[3] ?? "");
    if (strings.some((value) => shellBlocked(value)) || shellBlocked(strings.join(" "))) return true;
  }
  return false;
}

export function blocksProcessSignal(event: Call): boolean {
  if (event.toolName === "bash" || event.toolName === "functions.bash") return typeof event.input.command === "string" && shellBlocked(event.input.command);
  if (event.toolName === "eval" || event.toolName === "functions.eval") return typeof event.input.code === "string" && evalBlocked(event.input.code);
  if (event.toolName === "multi_tool_use.parallel" || event.toolName === "parallel") {
    const calls = event.input.tool_uses;
    return Array.isArray(calls) && calls.some((call: unknown) => {
      if (typeof call !== "object" || call === null || !("recipient_name" in call) || !("parameters" in call)) return false;
      return typeof call.recipient_name === "string" && isInput(call.parameters) && blocksProcessSignal({ toolName: call.recipient_name, input: call.parameters });
    });
  }
  return false;
}

function isInput(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerProcessSignalGuard(pi: Pick<ExtensionAPI, "on">): void {
  pi.on("tool_call", (event): ToolCallEventResult | void => {
    if (typeof event !== "object" || event === null || !("toolName" in event) || !("input" in event)) return;
    if (typeof event.toolName === "string" && isInput(event.input) && blocksProcessSignal({ toolName: event.toolName, input: event.input })) {
      return { block: true, reason: PROCESS_SIGNAL_BLOCK_REASON };
    }
  });
}
