import type { CustomMessagePayload, ExtensionAPI, ExtensionContext, Model, ToolContext, ToolResultEvent } from "./extension-types.ts";

export const CHEAP_MODEL_ROLE = "@eng_mode_easy";
export const EXPERT_MODEL_ROLE = "@panel_fable";

export const ESCALATION_STEER_TYPE = "eng-mode-escalation-steer";
export const ESCALATION_STEER_MESSAGE: CustomMessagePayload = {
  customType: ESCALATION_STEER_TYPE,
  content:
    "Two attempts at the same outcome failed. Call `escalate`, or state in one sentence what the next attempt will learn that the last two did not.",
  display: true,
  attribution: "agent",
};

/**
 * Expert-tier tool calls before the handoff steer. Every Boja-scale run
 * reached a grounded brief by roughly call 20 and kept reading past 60; the
 * steer asks for the decision, it does not make it.
 */
const EXPLORATION_STEER_THRESHOLD = 30;
export const HANDOFF_STEER_TYPE = "eng-mode-handoff-steer";
export const HANDOFF_STEER_MESSAGE: CustomMessagePayload = {
  customType: HANDOFF_STEER_TYPE,
  content: `${EXPLORATION_STEER_THRESHOLD} tool calls on the expert tier without a decision. Call \`handoff\` with the brief as it stands, state which exception applies and edit, or name in one sentence the single fact the brief still needs and read only for that.`,
  display: true,
  attribution: "agent",
};

/** Model-facing criteria. The classifier verdict is a mechanical trigger and is not listed here. */
export const ESCALATION_CRITERIA = [
  "the scope is vague or contested",
  "the change crosses subsystems",
  "the change touches concurrency or shared mutable state",
  "the algorithm is subtle",
  "a second attempt at the same outcome failed and you cannot name what the next attempt would learn that the last did not",
] as const;

const CRITERIA_SENTENCE = `any of: ${ESCALATION_CRITERIA.join("; ")}`;

const GATE_FAILURE_THRESHOLD = 2;
const EDIT_TOOLS = new Set(["edit", "write"]);
const GATE_COMMAND = /\b(bun test|bun run check|tsgo|pytest|cargo test|go test|npm test|vitest|jest)\b/;
/** OMP's default `compaction.keepRecentTokens`; below it `compact()` has nothing to summarize and fails. */
const COMPACTION_KEEP_RECENT_TOKENS = 20_000;
/**
 * Handoff keeps the full transcript below this so the execution model inherits
 * the exploration verbatim; above it the cold first prompt on the other
 * provider costs more than the summary loses.
 */
const HANDOFF_COMPACT_ABOVE_TOKENS = 80_000;
const ABORT_POLL_MS = 25;

type Tier = "cheap" | "expert";

/**
 * The session starts on the expert tier, may hand off to the cheap tier once,
 * and the cheap tier may escalate back. After an escalation the expert tier is
 * terminal: `escalated` blocks a second hand-off so the two models never
 * ping-pong a task.
 */
interface EscalationState {
  tier: Tier;
  escalated: boolean;
  gateFailures: number;
  steered: boolean;
  expertCalls: number;
  decided: boolean;
}

interface TierSpec {
  readonly role: string;
  readonly thinking: "low" | "medium";
}

const TIERS: Record<Tier, TierSpec> = {
  cheap: { role: CHEAP_MODEL_ROLE, thinking: "medium" },
  expert: { role: EXPERT_MODEL_ROLE, thinking: "low" },
};

export function isGateCommand(command: string): boolean {
  return GATE_COMMAND.test(command);
}

function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

/** Bash reports a non-zero exit through `details.exitCode`; the event's `isError` only covers thrown tools. */
function bashFailed(result: ToolResultEvent): boolean {
  return result.isError || (typeof result.details?.exitCode === "number" && result.details.exitCode !== 0);
}

export function buildHandoffFocus(reason: string, evidence: string): string {
  return [
    "This session is being handed to a stronger model because the current tier judged the task beyond it.",
    `Why: ${reason}`,
    `Tried and failed: ${evidence}`,
    "Preserve the original task statement, every constraint the user set, the current state of the working tree, which hypotheses were rejected and why, and the exact next step.",
  ].join("\n");
}

export function buildEscalationBrief(reason: string, evidence: string): string {
  return [
    "You are the expert tier. The previous model escalated this session to you.",
    `Reason: ${reason}`,
    `Evidence: ${evidence}`,
    "Continue the original task from the handoff summary above. Do not repeat the failed attempts; re-examine their shared premise first.",
  ].join("\n");
}

export function buildDelegationFocus(brief: string): string {
  return [
    "This session is being handed to a cheaper model for execution after the expert tier planned the work.",
    `Brief: ${brief}`,
    "Preserve the original task statement, every constraint the user set, the plan, the exact files and symbols involved, the acceptance criteria, and everything already learned about the codebase.",
  ].join("\n");
}

export function buildDelegationBrief(brief: string): string {
  return [
    "You are the execution tier. The expert tier planned this work and handed it to you.",
    `Brief: ${brief}`,
    `Execute the brief from the handoff summary above. Call \`escalate\` as soon as ${CRITERIA_SENTENCE}.`,
  ].join("\n");
}

async function selectTier(
  pi: ExtensionAPI,
  context: Pick<ExtensionContext, "models" | "ui">,
  tier: Tier,
): Promise<boolean> {
  if (!pi.setModel || !pi.setThinkingLevel) return false;
  const { role, thinking } = TIERS[tier];
  const model = context.models.resolve(role);
  if (!model) {
    context.ui.notify(`Model role ${role} is not configured.`, "error");
    return false;
  }
  if (!(await pi.setModel(model))) {
    context.ui.notify(`Model role ${role} is unavailable.`, "error");
    return false;
  }
  pi.setThinkingLevel(thinking);
  return true;
}

type SwitchContext = ToolContext & Pick<ExtensionContext, "models" | "ui">;

/** Which tier the session model belongs to, when it is one of the two tier roles. */
function tierOf(models: ExtensionContext["models"], current: Model | undefined): Tier | undefined {
  if (!current) return undefined;
  for (const tier of ["cheap", "expert"] as const) {
    const model = models.resolve(TIERS[tier].role);
    if (model && model.provider === current.provider && model.id === current.id) return tier;
  }
  return undefined;
}

export function registerEscalation(pi: ExtensionAPI): void {
  const state: EscalationState = { tier: "expert", escalated: false, gateFailures: 0, steered: false, expertCalls: 0, decided: false };

  for (const [type, label] of [
    [ESCALATION_STEER_TYPE, "Escalation check"],
    [HANDOFF_STEER_TYPE, "Handoff check"],
  ] as const) {
    pi.registerMessageRenderer(type, (_message, _options, theme) => new pi.pi.Text(`${theme.fg("accent", "◆")} ${theme.fg("dim", label)}`, 0, 0));
  }

  pi.on("session_start", (_event, context) => {
    state.tier = tierOf(context.models, context.models.current?.()) ?? "expert";
  });

  pi.on("input", async (event, context) => {
    if (state.tier !== "expert" || !event.text.includes("/eng-mode")) return;
    if (!(await selectTier(pi, context, "expert"))) return { handled: true };
  });

  pi.on("tool_result", (event) => {
    const result = event as ToolResultEvent;
    if (state.tier === "expert") return onExpertToolResult(result);
    if (result.toolName !== "bash") return;
    const command = result.input.command;
    if (typeof command !== "string" || !isGateCommand(command)) return;
    if (!bashFailed(result)) {
      state.gateFailures = 0;
      state.steered = false;
      return;
    }
    state.gateFailures += 1;
    if (state.gateFailures < GATE_FAILURE_THRESHOLD || state.steered) return;
    state.steered = true;
    pi.sendMessage?.(ESCALATION_STEER_MESSAGE, { deliverAs: "steer" });
  });

  /** An edit on the expert tier means an exception was taken; the steer has nothing left to ask. */
  function onExpertToolResult(result: ToolResultEvent): void {
    if (state.decided || state.escalated) return;
    const path = result.input.path;
    if (EDIT_TOOLS.has(result.toolName) && !(typeof path === "string" && path.startsWith("xd://"))) {
      state.decided = true;
      return;
    }
    state.expertCalls += 1;
    if (state.expertCalls !== EXPLORATION_STEER_THRESHOLD) return;
    pi.sendMessage?.(HANDOFF_STEER_MESSAGE, { deliverAs: "steer" });
  }

  /**
   * The switch runs after this tool call returns, because both `compact()` and
   * `abort()` end the live turn, and running either inline would end the turn
   * that is executing the tool. Compaction, when it runs, goes first and on the
   * model whose provider cache already holds the transcript, so the next model's
   * first request carries only the summary and the kept tail.
   */
  function scheduleSwitch(context: ToolContext, to: Tier, prompt: string, focus: string, compactAbove: number): void {
    if (!context.models || !context.ui || !pi.sendUserMessage) throw new Error("Tier switching requires a session context.");
    const switchContext: SwitchContext = { ...context, models: context.models, ui: context.ui };
    const from = state.tier;
    state.tier = to;
    state.gateFailures = 0;
    state.steered = false;
    const schedule = context.setTimeout ?? ((callback: () => unknown) => queueMicrotask(() => void callback()));
    schedule(async () => {
      const usage = switchContext.getContextUsage?.();
      if (switchContext.compact && (usage === undefined || usage.tokens > compactAbove)) {
        try {
          await switchContext.compact(focus);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("Nothing to compact") && !message.includes("Already compacted")) {
            switchContext.ui.notify(`Handoff compaction failed: ${message}`, "warning");
          }
        }
      } else if (switchContext.abort && switchContext.isIdle && !switchContext.isIdle()) {
        switchContext.abort();
        await waitForIdle(switchContext.isIdle, schedule);
      }
      if (!(await selectTier(pi, switchContext, to))) {
        state.tier = from;
        return;
      }
      pi.sendUserMessage?.(prompt);
    }, 0);
  }

  /** `ExtensionContext.abort()` returns before the agent loop settles; a prompt sent while it is still streaming would queue as a steer into the dying turn. */
  async function waitForIdle(isIdle: () => boolean, schedule: (callback: () => unknown, ms?: number) => unknown): Promise<void> {
    while (!isIdle()) {
      const { promise, resolve } = Promise.withResolvers<void>();
      schedule(resolve, ABORT_POLL_MS);
      await promise;
    }
  }

  const z = pi.zod;
  pi.registerTool({
    name: "escalate",
    label: "Escalate",
    description: `Hand this session to the expert model, which finishes the task. Compacts the conversation into a handoff first. Call it when ${CRITERIA_SENTENCE}. Not calling it and trying again is a choice; make it only when you can say what the next attempt will learn.`,
    parameters: z.object({
      reason: z.string().describe("Which criterion holds and why the cheap tier cannot finish this task."),
      evidence: z.string().describe("What was tried and what failed: the exact file, command, error, or observation. The expert tier starts from this."),
    }),
    strict: true,
    loadMode: "essential",
    async execute(_toolCallId, input, _signal, _onUpdate, context) {
      if (state.tier === "expert") return textResult("already on the expert tier");
      if (!context) throw new Error("Tier switching requires a session context.");
      const reason = typeof input.reason === "string" ? input.reason : "";
      const evidence = typeof input.evidence === "string" ? input.evidence : "";
      state.escalated = true;
      scheduleSwitch(context, "expert", buildEscalationBrief(reason, evidence), buildHandoffFocus(reason, evidence), COMPACTION_KEEP_RECENT_TOKENS);
      return textResult("Escalating to the expert model. This turn ends; a fresh turn continues on the new model.");
    },
  });

  pi.registerTool({
    name: "handoff",
    label: "Handoff",
    description: `Hand execution to the cheaper model. You plan; it edits. Call this once the brief names the entry files and symbols, the diagnosis or design decision, the constraints, and the observable acceptance check; line numbers and full traces are the execution model's job, since it reads the same repository and inherits this conversation (summarized only when large). It can escalate back once. Two exceptions, each stated in one sentence first: the whole change is one file and under roughly twenty lines; or ${CRITERIA_SENTENCE} for the remaining work. Refused after the execution model has escalated.`,
    parameters: z.object({
      brief: z.string().describe("The plan, the exact files and symbols to change, the constraints the user set, and the observable acceptance criteria. The execution model works from this."),
    }),
    strict: true,
    loadMode: "essential",
    async execute(_toolCallId, input, _signal, _onUpdate, context) {
      if (state.tier === "cheap") return textResult("already on the execution tier");
      if (state.escalated) return textResult("refused: the execution tier already escalated this task; finish it on the expert tier");
      if (!context) throw new Error("Tier switching requires a session context.");
      const brief = typeof input.brief === "string" ? input.brief : "";
      scheduleSwitch(context, "cheap", buildDelegationBrief(brief), buildDelegationFocus(brief), HANDOFF_COMPACT_ABOVE_TOKENS);
      return textResult("Handing off to the execution model. This turn ends; a fresh turn continues on the new model.");
    },
  });
}
