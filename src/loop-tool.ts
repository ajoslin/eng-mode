import type { ExtensionAPI, ToolContext } from "./extension-types.ts";

type LoopLimit =
  | { readonly kind: "iterations"; readonly initial: number; readonly remaining: number }
  | { readonly kind: "duration"; readonly durationMs: number; readonly deadlineMs: number };

interface LoopMode {
  readonly sessionManager: { getSessionId(): string };
  loopModeEnabled: boolean;
  loopModePaused: boolean;
  loopPrompt: string | undefined;
  loopLimit: LoopLimit | undefined;
  init(options?: unknown): Promise<void>;
  stop(): void;
  handleLoopCommand(args?: string): Promise<string | undefined>;
  setLoopPrompt(prompt: string): void;
  pauseLoop(): void;
  disableLoopMode(message?: string): void;
}
interface LoopPrototype {
  init(this: LoopMode, options?: unknown): Promise<void>;
  stop(this: LoopMode): void;
  handleLoopCommand(this: LoopMode, args?: string): Promise<string | undefined>;
  setLoopPrompt(this: LoopMode, prompt: string): void;
  pauseLoop(this: LoopMode): void;
  disableLoopMode(this: LoopMode, message?: string): void;
}

interface LoopRegistry {
  readonly modes: Set<LoopMode>;
}

const LOOP_REGISTRY = Symbol.for("@eng/eng-mode/loop-registry");

function loopPrototype(value: unknown): LoopPrototype | undefined {
  if (typeof value !== "function") return undefined;
  const prototype: unknown = Reflect.get(value, "prototype");
  if (!isLoopPrototype(prototype)) return undefined;
  return prototype;
}

function isLoopPrototype(value: unknown): value is LoopPrototype {
  if (value === null || typeof value !== "object") return false;
  return ["init", "stop", "handleLoopCommand", "setLoopPrompt", "pauseLoop", "disableLoopMode"]
    .every((method) => typeof Reflect.get(value, method) === "function");
}

function bindLoopModes(value: unknown): LoopRegistry | undefined {
  const prototype = loopPrototype(value);
  if (!prototype) return undefined;
  const existing = Reflect.get(prototype, LOOP_REGISTRY);
  if (isLoopRegistry(existing)) return existing;
  const registry: LoopRegistry = { modes: new Set() };
  const originalInit = prototype.init;
  const originalStop = prototype.stop;
  prototype.init = async function (options?: unknown): Promise<void> {
    await originalInit.call(this, options);
    registry.modes.add(this);
  };
  prototype.stop = function (): void {
    registry.modes.delete(this);
    originalStop.call(this);
  };
  Reflect.set(prototype, LOOP_REGISTRY, registry);
  return registry;
}

function isLoopRegistry(value: unknown): value is LoopRegistry {
  if (value === null || typeof value !== "object") return false;
  return Reflect.get(value, "modes") instanceof Set;
}

function sessionId(context: ToolContext | undefined): string {
  const id = context?.sessionManager?.getSessionId?.();
  if (!id) throw new Error("Loop is unavailable in this session.");
  return id;
}

function resolveMode(registry: LoopRegistry | undefined, context: ToolContext | undefined): LoopMode {
  if (!registry) throw new Error("Loop is unavailable.");
  const id = sessionId(context);
  const matches = [...registry.modes].filter((mode) => mode.sessionManager.getSessionId() === id);
  if (matches.length === 0) throw new Error("Loop is unavailable in this session.");
  if (matches.length > 1) throw new Error(`Multiple loops own session ${id}.`);
  return matches[0]!;
}

function requiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function publicState(mode: LoopMode): Record<string, unknown> {
  if (!mode.loopModeEnabled) return { available: true, enabled: false };
  const state = mode.loopModePaused ? "paused" : mode.loopPrompt ? "running" : "waiting";
  let limit: Record<string, unknown> | null = null;
  if (mode.loopLimit?.kind === "iterations") {
    limit = { kind: "iterations", initial: mode.loopLimit.initial, remaining: mode.loopLimit.remaining };
  } else if (mode.loopLimit?.kind === "duration") {
    limit = { kind: "duration", duration_ms: mode.loopLimit.durationMs, deadline_ms: mode.loopLimit.deadlineMs };
  }
  return { available: true, enabled: true, state, prompt: mode.loopPrompt ?? null, limit };
}

function output(details: Record<string, unknown>, isError = false): Record<string, unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
    ...(isError ? { isError: true } : {}),
  };
}

export function registerLoopTool(pi: ExtensionAPI): void {
  const registry = bindLoopModes(pi.pi.InteractiveMode);
  const z = pi.zod;
  pi.registerTool({
    name: "loop",
    label: "Loop",
    description: "Control repeated continuation.",
    parameters: z.object({
      op: z.enum(["start", "status", "pause", "resume", "stop"]),
      prompt: z.string().optional(),
      limit: z.string().optional(),
    }),
    strict: true,
    loadMode: "essential",
    async execute(_toolCallId, input, _signal, _onUpdate, context) {
      try {
        const mode = resolveMode(registry, context);
        const op = input["op"];
        switch (op) {
          case "start": {
            if (mode.loopModeEnabled) {
              throw new Error("Loop is already active; inspect or stop it before starting another loop.");
            }
            const prompt = requiredString(input, "prompt");
            const limit = requiredString(input, "limit");
            const returnedPrompt = await mode.handleLoopCommand(limit);
            if (returnedPrompt !== undefined || !mode.loopModeEnabled) {
              if (mode.loopModeEnabled) mode.disableLoopMode("Invalid bounded loop limit.");
              throw new Error(`Loop rejected limit: ${limit}`);
            }
            mode.setLoopPrompt(prompt);
            break;
          }
          case "pause":
            if (!mode.loopModeEnabled) throw new Error("Loop is not active.");
            if (!mode.loopModePaused) mode.pauseLoop();
            break;
          case "resume":
            if (!mode.loopModeEnabled || !mode.loopModePaused) throw new Error("Loop is not paused.");
            mode.setLoopPrompt(requiredString(input, "prompt"));
            break;
          case "stop":
            mode.disableLoopMode("Loop stopped.");
            break;
          case "status":
            break;
          default:
            throw new Error("op must be start, status, pause, resume, or stop");
        }
        return output(publicState(mode));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return output({ available: false, error: message }, true);
      }
    },
  });
}
