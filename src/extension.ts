import { completeSimple } from "@oh-my-pi/pi-ai";

interface OptionalSchema {
  optional(): unknown;
  int(): OptionalSchema;
  positive(): OptionalSchema;
}

interface SchemaBuilder {
  object(shape: Record<string, unknown>): unknown;
  enum<const Values extends readonly [string, ...string[]]>(values: Values): OptionalSchema;
  string(): OptionalSchema;
  number(): OptionalSchema;
  boolean(): OptionalSchema;
  array(value: unknown): OptionalSchema;
}
interface TextComponentConstructor {
  new(text: string, paddingX: number, paddingY: number): unknown;
}


interface ToolContext {
  invokeTool?: (
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal; onUpdate?: unknown },
  ) => Promise<unknown>;
}
interface CustomMessagePayload {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly attribution: "agent";
}

interface BeforeAgentStartEvent {
  readonly prompt: string;
}

interface PromptClassifierContext {
  readonly models: {
    resolve(spec: "@tiny"): Parameters<typeof completeSimple>[0] | undefined;
  };
  readonly modelRegistry: {
    getApiKey(model: Parameters<typeof completeSimple>[0]): Promise<string | undefined>;
  };
}

interface BeforeAgentStartEventResult {
  readonly message?: CustomMessagePayload;
}
type SessionStartEvent = Record<string, never>;

interface MessageDeliveryOptions {
  readonly deliverAs: "nextTurn";
  readonly triggerTurn: false;
}



interface ToolDefinition {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: unknown;
  readonly strict?: boolean;
  readonly loadMode?: "discoverable" | "essential";
  readonly execute: (
    toolCallId: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: unknown,
    context?: ToolContext,
  ) => Promise<unknown>;
}

interface ExtensionAPI {
  readonly zod: SchemaBuilder;
  registerTool(tool: ToolDefinition): void;
  readonly pi: { readonly Text: TextComponentConstructor };
  registerMessageRenderer(
    customType: "eng-mode-expert-decision-guidance",
    renderer: (_message: unknown, _options: unknown, theme: { fg(color: "accent" | "dim", text: string): string }) => unknown,
  ): void;
  on(
    event: "before_agent_start",
    handler: (
      event: BeforeAgentStartEvent,
      context: PromptClassifierContext,
    ) => BeforeAgentStartEventResult | Promise<BeforeAgentStartEventResult>,
  ): void;
  on(event: "session_start", handler: (event: SessionStartEvent) => void): void;
  sendMessage(message: CustomMessagePayload, options: MessageDeliveryOptions): void;

}
import { join, resolve } from "node:path";
import { decideRepositoryContracts, observeRepositoryContracts } from "./contracts.ts";
import { openStore, parseVerdict } from "./store.ts";

export const actionNames = [
  "contracts", "init", "unit_add", "unit_set", "unit_get", "unit_list", "unit_counts",
  "ledger_record", "ledger_check", "ledger_summary", "inbox_push", "inbox_claim", "inbox_ack",
  "inbox_reclaim", "inbox_peek", "inbox_count", "gate_park", "gate_list", "gate_resolve",
  "frontier_set", "frontier_show", "standing_add", "standing_show", "status",
] as const;

type Input = {
  action: (typeof actionNames)[number]; store?: string; repositoryRoot?: string;
  mode?: "read-only" | "code-producing"; spawner?: string; agent?: string; unit?: string;
  status?: string; report?: string; claim?: string; id?: string; track?: string;
  state?: string; branch?: string; pr?: number; sha?: string; brief?: string;
  verdict?: string; evidence?: string; verifier?: string; question?: string;
  options?: string; defaultAnswer?: string; answer?: string; repo?: string;
  prs?: number[]; line?: string; force?: boolean;
};

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function resolveStore(input: Input): string {
  if (input.store !== undefined && input.store.length > 0) return input.store;
  return join(resolve(required(input.repositoryRoot, "repositoryRoot")), ".omp", "eng-orch");
}

export async function executeEngOrch(input: Input): Promise<unknown> {
  if (input.action === "contracts") {
    const repositoryRoot = required(input.repositoryRoot, "repositoryRoot");
    const observations = observeRepositoryContracts(repositoryRoot);
    return decideRepositoryContracts({ repositoryRoot, mode: input.mode ?? "code-producing", observations });
  }
  const store = openStore(resolveStore(input), input.force === undefined ? {} : { force: input.force });
  try {
    switch (input.action) {
      case "init": return await store.init({ spawner: required(input.spawner, "spawner") });
      case "unit_add": return await store.units.add({ id: required(input.id, "id"), track: required(input.track, "track"), ...(input.brief === undefined ? {} : { brief: input.brief }) });
      case "unit_set": return await store.units.set({ id: required(input.id, "id"), state: required(input.state, "state"), ...(input.branch === undefined ? {} : { branch: input.branch }), ...(input.pr === undefined ? {} : { pr: input.pr }), ...(input.sha === undefined ? {} : { sha: input.sha }) });
      case "unit_get": return await store.units.get(required(input.id, "id"));
      case "unit_list": return await store.units.list({ ...(input.state === undefined ? {} : { state: input.state }), ...(input.track === undefined ? {} : { track: input.track }) });
      case "unit_counts": return await store.units.counts();
      case "ledger_record": return await store.ledger.record({ pr: input.pr ?? 0, sha: required(input.sha, "sha"), verdict: parseVerdict(required(input.verdict, "verdict")), evidence: required(input.evidence, "evidence"), ...(input.verifier === undefined ? {} : { verifier: input.verifier }) });
      case "ledger_check": return await store.ledger.check({ pr: input.pr ?? 0, sha: required(input.sha, "sha") });
      case "ledger_summary": return await store.ledger.summary();
      case "inbox_push": return await store.inbox.push({ spawner: required(input.spawner, "spawner"), agent: required(input.agent, "agent"), unit: required(input.unit, "unit"), status: required(input.status, "status"), ...(input.report === undefined ? {} : { report: input.report }) });
      case "inbox_claim": return await store.inbox.claim({ spawner: required(input.spawner, "spawner") });
      case "inbox_ack": return await store.inbox.ack({ spawner: required(input.spawner, "spawner"), claim: required(input.claim, "claim") });
      case "inbox_reclaim": return await store.inbox.reclaim({ spawner: required(input.spawner, "spawner"), ...(input.claim === undefined ? {} : { claim: input.claim }) });
      case "inbox_peek": return await store.inbox.peek();
      case "inbox_count": return await store.inbox.count();
      case "gate_park": return await store.gates.park({ id: required(input.id, "id"), question: required(input.question, "question"), options: required(input.options, "options"), defaultAnswer: required(input.defaultAnswer, "defaultAnswer") });
      case "gate_list": return await store.gates.list();
      case "gate_resolve": return await store.gates.resolve({ id: required(input.id, "id"), answer: required(input.answer, "answer") });
      case "frontier_set": return await store.frontier.set({ repo: required(input.repo, "repo"), ...(input.prs === undefined ? {} : { prs: input.prs }) });
      case "frontier_show": return await store.frontier.show();
      case "standing_add": return await store.standing.add({ line: required(input.line, "line") });
      case "standing_show": return await store.standing.show();
      case "status": return await store.status.render();
    }
  } finally {
    await store.close();
  }
}

const MINIMUM_GOAL_TOKEN_BUDGET = 500_000_000;
const PROMPT_CLASSIFIER_MAX_TOKENS = 16;

export const EXPERT_GUIDANCE_CLASSIFIER_PROMPT = `Classify whether the user's request would materially benefit from expert decision discipline.

Labels:
- trivial: an acknowledgement; a direct factual lookup with one unambiguous answer; or an explicitly mechanical typo, formatting, or exact rename request with no design choice.
- non-trivial: architecture, design, planning, review, investigation, debugging, implementation with non-obvious choices, multi-file work, risky work, or any request involving judgment or trade-offs.

If uncertain, choose non-trivial.
Reply with exactly one label: trivial or non-trivial.`;

export const EXPERT_DECISION_GUIDANCE =
  "For every decision, ask what the best expert in that field would do and why they would reject your current choice; if you can name that reason, don't make the choice. Optimize for what that expert would judge correct, never for what satisfies the stated constraints most cheaply. Every trade-off you take must be stated to the user, never absorbed.";
const EXPERT_DECISION_MESSAGE: CustomMessagePayload = {
  customType: "eng-mode-expert-decision-guidance",
  content: EXPERT_DECISION_GUIDANCE,
  display: true,
  attribution: "agent",
};


export function parsePromptClassification(text: string): "trivial" | "non-trivial" | undefined {
  const normalized = text.trim().toLowerCase();
  if (normalized === "trivial") return "trivial";
  if (normalized === "non-trivial") return "non-trivial";
  return undefined;
}

export function classifierOutputNeedsExpertGuidance(text: string | undefined): boolean {
  return text === undefined || parsePromptClassification(text) !== "trivial";
}

async function classifyPrompt(prompt: string, context: PromptClassifierContext): Promise<string | undefined> {
  const model = context.models.resolve("@tiny");
  if (!model) return undefined;
  const apiKey = await context.modelRegistry.getApiKey(model);
  if (!apiKey) return undefined;

  const response = await completeSimple(
    model,
    {
      systemPrompt: [EXPERT_GUIDANCE_CLASSIFIER_PROMPT],
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    },
    { apiKey, maxTokens: PROMPT_CLASSIFIER_MAX_TOKENS, disableReasoning: true },
  );
  if (response.stopReason === "error") return undefined;
  return response.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export default function engModeExtension(pi: ExtensionAPI): void {
  const z = pi.zod;
  pi.registerMessageRenderer(
    "eng-mode-expert-decision-guidance",
    (_message, _options, theme) => new pi.pi.Text(`${theme.fg("accent", "◆")} ${theme.fg("dim", "Expert lens")}`, 0, 0),
  );
  let initialGuidanceQueued = false;
  pi.on("session_start", () => {
    initialGuidanceQueued = true;
    pi.sendMessage(EXPERT_DECISION_MESSAGE, { deliverAs: "nextTurn", triggerTurn: false });
  });
  pi.on("before_agent_start", async (event, context) => {
    if (initialGuidanceQueued) {
      initialGuidanceQueued = false;
      return {};
    }
    let output: string | undefined;
    try {
      output = await classifyPrompt(event.prompt, context);
    } catch {
      output = undefined;
    }
    return classifierOutputNeedsExpertGuidance(output) ? { message: EXPERT_DECISION_MESSAGE } : {};
  });

  pi.registerTool({
    name: "goal",
    label: "Goal",
    description: "Control OMP's native goal mode. Create, inspect, complete, resume, or drop the session goal.",
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
  pi.registerTool({
    name: "eng_orch",
    label: "Eng orchestration store",
    description: "Validate repository contracts or update Eng Mode's durable orchestration store.",
    parameters: z.object({
      action: z.enum(actionNames), store: z.string().optional(), repositoryRoot: z.string().optional(),
      mode: z.enum(["read-only", "code-producing"]).optional(), spawner: z.string().optional(),
      agent: z.string().optional(),
      unit: z.string().optional(), status: z.string().optional(), report: z.string().optional(), claim: z.string().optional(),
      id: z.string().optional(), track: z.string().optional(), state: z.string().optional(), branch: z.string().optional(),
      pr: z.number().optional(), sha: z.string().optional(), brief: z.string().optional(), verdict: z.string().optional(),
      evidence: z.string().optional(), verifier: z.string().optional(), question: z.string().optional(), options: z.string().optional(),
      defaultAnswer: z.string().optional(), answer: z.string().optional(), repo: z.string().optional(),
      prs: z.array(z.number()).optional(), line: z.string().optional(), force: z.boolean().optional(),
    }),
    async execute(_toolCallId, input) {
      try {
        const details = await executeEngOrch(input as Input);
        return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], details: { error: message }, isError: true };
      }
    },
  });
}
