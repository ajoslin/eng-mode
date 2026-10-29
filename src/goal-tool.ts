import type { ExtensionAPI } from "./extension-types.ts";

export function registerGoalTool(pi: ExtensionAPI): void {
  const z = pi.zod;
  pi.registerTool({
    name: "goal",
    label: "Goal",
    description: "Control OMP's native durable objective state. Never use goal as a retry loop, watcher, cadence, or finite task graph.",
    parameters: z.object({
      op: z.enum(["create", "get", "complete", "resume", "drop"]),
      objective: z.string().optional(),
    }),
    strict: true,
    loadMode: "essential",
    async execute(_toolCallId, input, signal, onUpdate, context) {
      if (!context?.invokeTool) throw new Error("OMP's native goal tool is unavailable.");
      const params = input.objective === undefined ? { op: input.op } : { op: input.op, objective: input.objective };
      return context.invokeTool(params, {
        ...(signal === undefined ? {} : { signal }),
        ...(onUpdate === undefined ? {} : { onUpdate }),
      });
    },
  });
}
