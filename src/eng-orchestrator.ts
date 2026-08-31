import { join, resolve } from "node:path";
import { decideRepositoryContracts, observeRepositoryContracts } from "./contracts.ts";
import type { ExtensionAPI } from "./extension-types.ts";
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
    const unreachable: never = input.action;
    throw new Error(`unknown eng_orch action: ${unreachable}`);
  } finally {
    await store.close();
  }
}

export function registerEngOrchestration(pi: ExtensionAPI): void {
  const z = pi.zod;
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
