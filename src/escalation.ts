import type { CustomMessagePayload, ExtensionAPI, ExtensionContext, Model, ToolContext, ToolResultEvent } from "./extension-types.ts";

export const CHEAP_MODEL_ROLE = "@eng_mode_easy";
export const EXPERT_MODEL_ROLE = "@panel_fable";
const ENG_MODE_PROMPT = /^\s*\/eng-mode(?=\s|$)/;
const LEADING_EASY = /^\s*\/easy[ \t]+/;
const TRAILING_EASY = /[ \t]+\/easy[ \t]*$/;

export function stripEasyModifier(prompt: string): string | undefined {
  const withoutLeadingEasy = prompt.replace(LEADING_EASY, "");
  if (withoutLeadingEasy !== prompt) return ENG_MODE_PROMPT.test(withoutLeadingEasy) ? withoutLeadingEasy : undefined;
  if (!ENG_MODE_PROMPT.test(prompt) || !TRAILING_EASY.test(prompt)) return undefined;
  return prompt.replace(TRAILING_EASY, "");
}

export const ESCALATION_STEER_TYPE = "eng-mode-escalation-steer";
export const ESCALATION_STEER_MESSAGE: CustomMessagePayload = {
  customType: ESCALATION_STEER_TYPE,
  content:
    "Two attempts at the same outcome failed. Call `escalate`, or state in one sentence what the next attempt will learn that the last two did not.",
  display: true,
  attribution: "agent",
};

/**
 * Reasons the cheap tier gives when it is stuck. They describe why an attempt
 * failed; none of them is a trigger on its own. The `escalate` tool refuses
 * until the session shows stuckness mechanically: a gate-failure streak or the
 * attempt floor.
 */
export const ESCALATION_CRITERIA = [
  "the scope is vague or contested",
  "the change crosses subsystems",
  "the change touches concurrency or shared mutable state",
  "the algorithm is subtle",
  "a second attempt at the same outcome failed and you cannot name what the next attempt would learn that the last did not",
] as const;

const CRITERIA_SENTENCE = `one of: ${ESCALATION_CRITERIA.join("; ")}`;

const GATE_FAILURE_THRESHOLD = 2;
/**
 * The Sol run that escalated too soon (romp-dac2c9) had made 17 calls, 3 of
 * them idle waits, with the focused tests green. Forty calls is more than a
 * read-edit-test cycle on every file a typical brief names.
 */
const CHEAP_ATTEMPT_FLOOR = 40;
const ESCALATION_UNLOCK_SENTENCE = `\`escalate\` is refused until either ${GATE_FAILURE_THRESHOLD} consecutive gate runs (tests, typecheck, \`bun run check\`) fail, or you have made ${CHEAP_ATTEMPT_FLOOR} tool calls on this tier`;

/**
 * Expert-tier tool calls before the exploration check. Every Boja-scale run
 * reached a grounded brief by roughly call 20 and kept reading past 60.
 */
const EXPLORATION_STEER_THRESHOLD = 30;
export const EXPLORATION_STEER_TYPE = "eng-mode-exploration-steer";
export const EXPLORATION_STEER_MESSAGE: CustomMessagePayload = {
  customType: EXPLORATION_STEER_TYPE,
  content:
    "Decide now whether the remaining work is easy enough for a cheaper model. If you can name the files, the change, and how to verify it, call `handoff`. The cheaper model reads the same repository, inherits this conversation, and can escalate back once. Keep executing only if you cannot yet name those three things.",
  display: true,
  attribution: "agent",
};

const EDIT_TOOL: Record<string, true> = { edit: true, write: true };
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
type RoutingPolicy = "dynamic" | "easy-pinned";

/**
 * The session starts on the expert tier, may hand off to the cheap tier once,
 * and the cheap tier may escalate back. After an escalation the expert tier is
 * terminal: `escalated` blocks a second hand-off so the two models never
 * ping-pong a task.
 *
 * `cheapCalls` and `gateFailures` gate `escalate`: the cheap tier escalates only
 * after the attempt floor or two consecutive gate failures, never on the brief's
 * criteria alone.
 */
interface FailedAttempt {
  readonly command: string;
  readonly errorExcerpt: string;
}
interface EscalationState {
  tier: Tier;
  policy: RoutingPolicy;
  escalated: boolean;
  gateFailures: number;
  steered: boolean;
  expertCalls: number;
  cheapCalls: number;
  failedAttempt: FailedAttempt | undefined;
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

function failedAttempt(result: ToolResultEvent): FailedAttempt | undefined {
  if (result.toolName !== "bash" || !bashFailed(result)) return undefined;
  const command = result.input.command;
  if (typeof command !== "string") return undefined;
  const renderedLines = result.content
    ?.filter((item) => item.type === "text")
    .flatMap((item) => item.text.split("\n"))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const exitCode = result.details?.exitCode;
  return {
    command,
    errorExcerpt: renderedLines?.at(-1) ?? `exit code ${typeof exitCode === "number" ? exitCode : "unknown"}`,
  };
}

function evidenceMatchesAttempt(evidence: string, attempt: FailedAttempt): boolean {
  return evidence.includes(attempt.command) && evidence.includes(attempt.errorExcerpt);
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
    "Execute the brief from the handoff summary above and finish it: edit, run the gates, and fix what fails. Do not escalate for topic, scope, or a desire for expert review; the expert tier already weighed those before handoff.",
    `${ESCALATION_UNLOCK_SENTENCE}. Even when unlocked, escalate only when a real attempt failed and you cannot name what the next attempt would learn. Evidence must quote the failed command and one rendered failure line.`,
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

function initialState(tier: Tier): EscalationState {
  return {
    tier,
    policy: "dynamic",
    escalated: false,
    gateFailures: 0,
    steered: false,
    expertCalls: 0,
    cheapCalls: 0,
    failedAttempt: undefined,
    decided: false,
  };
}

export function registerEscalation(pi: ExtensionAPI): void {
  let state = initialState("expert");

  for (const [type, label] of [
    [ESCALATION_STEER_TYPE, "Escalation check"],
    [EXPLORATION_STEER_TYPE, "Exploration check"],
  ] as const) {
    pi.registerMessageRenderer(type, (_message, _options, theme) => new pi.pi.Text(`${theme.fg("accent", "◆")} ${theme.fg("dim", label)}`, 0, 0));
  }

  const resetSessionState = (_event: unknown, context: ExtensionContext): void => {
    state = initialState(tierOf(context.models, context.models.current?.()) ?? "expert");
  };
  pi.on("session_start", resetSessionState);
  pi.on("session_switch", resetSessionState);

  pi.on("input", async (event, context) => {
    const easyPrompt = stripEasyModifier(event.text);
    if (easyPrompt !== undefined) {
      if (!(await selectTier(pi, context, "cheap"))) return { handled: true };
      state.policy = "easy-pinned";
      state.tier = "cheap";
      return { text: easyPrompt };
    }
    if (state.policy === "easy-pinned") {
      if (!(await selectTier(pi, context, "cheap"))) return { handled: true };
      return;
    }
    if (state.tier !== "expert" || !ENG_MODE_PROMPT.test(event.text)) return;
    if (!(await selectTier(pi, context, "expert"))) return { handled: true };
  });

  if (pi.registerCommand && pi.setModel && pi.setThinkingLevel && pi.sendUserMessage) {
    const sendUserMessage = pi.sendUserMessage.bind(pi);
    pi.registerCommand("easy", {
      description: "Pin this session to Eng Mode's GPT 5.6 Sol execution tier.",
      async handler(args, context): Promise<void> {
        if (!(await selectTier(pi, context, "cheap"))) return;
        state.policy = "easy-pinned";
        state.tier = "cheap";
        const prompt = args.trim();
        if (prompt.length === 0) {
          context.ui.notify("Easy mode selected for this session.", "info");
          return;
        }
        sendUserMessage(`/eng-mode ${prompt}`);
      },
    });
  }

  pi.on("tool_result", (event) => {
    const result = event as ToolResultEvent;
    if (state.policy === "easy-pinned") return;
    if (state.tier === "expert") return onExpertToolResult(result);
    if (result.toolName !== "escalate") state.cheapCalls += 1;
    const attempt = failedAttempt(result);
    if (attempt) state.failedAttempt = attempt;
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
    if (EDIT_TOOL[result.toolName] && !(typeof path === "string" && path.startsWith("xd://"))) {
      state.decided = true;
      return;
    }
    state.expertCalls += 1;
    if (state.expertCalls !== EXPLORATION_STEER_THRESHOLD) return;
    pi.sendMessage?.(EXPLORATION_STEER_MESSAGE, { deliverAs: "steer" });
  }

  /**
   * The switch runs after this tool call returns, because both `compact()` and
   * `abort()` end the live turn, and running either inline would end the turn
   * that is executing the tool. Compaction, when it runs, goes first and on the
   * model whose provider cache already holds the transcript, so the next model's
   * first request carries only the summary and the kept tail.
   */
  function scheduleSwitch(
    context: ToolContext,
    to: Tier,
    prompt: string,
    focus: string,
    compactAbove: number,
    onSelected?: () => void,
  ): void {
    if (!context.models || !context.ui || !pi.sendUserMessage) throw new Error("Tier switching requires a session context.");
    const switchContext: SwitchContext = { ...context, models: context.models, ui: context.ui };
    const from = state.tier;
    state.tier = to;
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
      state.gateFailures = 0;
      state.steered = false;
      state.failedAttempt = undefined;
      state.cheapCalls = 0;
      onSelected?.();
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
    description: `Hand this session to the expert model, which finishes the task. Compacts the conversation into a handoff first. ${ESCALATION_UNLOCK_SENTENCE}; a refused call changes nothing. After it unlocks, call it only when a real command failed and you cannot name what the next attempt would learn.`,
    parameters: z.object({
      reason: z.string().describe("Why the cheap tier is stuck after a real failed attempt."),
      evidence: z.string().describe("The exact failed command and one rendered failure line. The expert tier starts from this evidence."),
    }),
    strict: true,
    loadMode: "essential",
    async execute(_toolCallId, input, _signal, _onUpdate, context) {
      if (state.tier === "expert") return textResult("already on the expert tier");
      if (state.policy === "easy-pinned") return textResult("refused: this session is pinned to the execution tier by /easy");
      if (state.gateFailures < GATE_FAILURE_THRESHOLD && state.cheapCalls < CHEAP_ATTEMPT_FLOOR) {
        return textResult(
          `refused: not stuck yet (${state.cheapCalls} of ${CHEAP_ATTEMPT_FLOOR} tool calls, ${state.gateFailures} of ${GATE_FAILURE_THRESHOLD} consecutive gate failures). Keep executing the brief: edit, run the gates, fix what fails.`,
        );
      }
      if (!context) throw new Error("Tier switching requires a session context.");
      const reason = typeof input.reason === "string" ? input.reason : "";
      const evidence = typeof input.evidence === "string" ? input.evidence : "";
      if (!state.failedAttempt || !evidenceMatchesAttempt(evidence, state.failedAttempt)) {
        return textResult("refused: evidence must quote the most recent failed command and one rendered failure line");
      }
      scheduleSwitch(
        context,
        "expert",
        buildEscalationBrief(reason, evidence),
        buildHandoffFocus(reason, evidence),
        COMPACTION_KEEP_RECENT_TOKENS,
        () => {
          state.escalated = true;
        },
      );
      return textResult("Escalating to the expert model. This turn ends; a fresh turn continues on the new model.");
    },
  });

  pi.registerTool({
    name: "handoff",
    label: "Handoff",
    description: "Hand execution to the cheaper model, which reads the same repository and inherits this conversation (summarized only when large). It can escalate back once; refused after that.",
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
