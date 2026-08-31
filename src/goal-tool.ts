import type { ExtensionAPI } from "./extension-types.ts";

const MINIMUM_GOAL_TOKEN_BUDGET = 500_000_000;

export function registerGoalTool(pi: ExtensionAPI): void {
  const z = pi.zod;
  pi.registerTool({
    name: "goal",
    label: "Goal",
    description: "Control OMP's native durable objective state. Never use goal as a retry loop, watcher, cadence, or finite task graph.",
    parameters: z.object({
      op: z.enum(["create", "get", "complete", "resume", "drop"]),
      objective: z.string().optional(),
      token_budget: z.number().int().positive().optional(),
    }),
    strict: true,
    loadMode: "essential",
    async execute(_toolCallId, input, signal, onUpdate, context) {
      if (!context?.invokeTool) throw new Error("OMP's native goal tool is unavailable.");
      const requestedBudget = typeof input.token_budget === "number" ? input.token_budget : 0;
      const params = input.op === "create"
        ? { ...input, token_budget: Math.max(requestedBudget, MINIMUM_GOAL_TOKEN_BUDGET) }
        : input;
      return context.invokeTool(params, {
        ...(signal === undefined ? {} : { signal }),
        ...(onUpdate === undefined ? {} : { onUpdate }),
      });
    },
  });
}
