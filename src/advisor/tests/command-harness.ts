import path from "node:path";
import { tmpdir } from "node:os";
import type { Model } from "@oh-my-pi/pi-ai";
import type { AutocompleteItem } from "@oh-my-pi/pi-tui";
import { zod, type ExtensionContext, type SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { registerEngAdvisor, type AdvisorExtensionAPI } from "../index";

export function selectionCommands(allowFindings = false) {
  let handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  let completions: ((prefix: string) => AutocompleteItem[] | null) | undefined;
  const notices: Array<{message: string; level: string | undefined}> = [];
  const callbacks: Array<() => Promise<void>> = [];
  const persisted: string[] = [];
  const writes: Array<{name: string; data: unknown}> = [];
  const sent: unknown[] = [];
  const entries: SessionEntry[] = [];
  const events = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
  const available = {primary: true, fallback: true, duplicate: false};
  const model = (id: string) => ({
    id, provider: `test-${id}`, name: id, api: "openai-responses", baseUrl: "https://example.invalid",
    reasoning: true, thinking: {efforts: ["low", "medium", "max"]}, input: ["text"],
    contextWindow: 8192, maxTokens: 1024, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
  } as unknown as Model);
  registerEngAdvisor({
    registerCommand: (_name: string, command: {handler: typeof handler; getArgumentCompletions?: typeof completions}) => {
      handler = command.handler;completions = command.getArgumentCompletions;
    },
    registerMessageRenderer: () => {}, on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => events.set(name, handler), zod,
    pi: {getAgentDir: () => path.join(tmpdir(), "eng-advisor-selection-no-profile")},
    appendEntry: (name: string, data: unknown) => {
      persisted.push(name);
      writes.push({name, data: structuredClone(data)});
      entries.push({type: "custom", id: `saved-${writes.length}`, parentId: null, timestamp: new Date().toISOString(), customType: name, data: structuredClone(data)} as SessionEntry);
    },
    sendMessage: (message: unknown) => {if (!allowFindings) throw new Error("No findings expected");sent.push(structuredClone(message));},
  } as unknown as AdvisorExtensionAPI);
  const ctx = {
    cwd: path.resolve(import.meta.dir, "../.."),
    ui: {notify: (message: string, level?: string) => notices.push({message, level})},
    setTimeout: (fn: () => Promise<void>) => callbacks.push(fn),
    sessionManager: {getBranch: () => entries, getSessionId: () => "selection-test"},
    models: {resolve: (selector: string) => {
      if (selector === "@advisor") return available.primary ? model("primary") : undefined;
      if (selector === "@advisor_fallback") return available.fallback ? model(available.duplicate ? "primary" : "fallback") : undefined;
      return undefined;
    }},
    modelRegistry: {resolver: () => {throw new Error("No provider requests expected");}},
  } as unknown as ExtensionContext;
  return {
    run: (args: string) => handler(args, ctx), notices, callbacks, available, persisted, entries, writes, sent,
    complete: (prefix: string) => completions?.(prefix) ?? null,
    emit: (name: string, event: unknown) => events.get(name)?.(event, ctx),
    flush: async () => {while (callbacks.length) await callbacks.shift()!();},
  };
}
