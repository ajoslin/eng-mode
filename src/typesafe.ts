import { DecisionModel, DecisionQuery, DecisionSet } from "@effect-agent/ai-decision";
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect-agent/ai-typesafe";
import { Effect, Layer, Option, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

export const DANGER_LEVELS = ["safe", "highly_dangerous"] as const;
export type DangerLevel = (typeof DANGER_LEVELS)[number];

/** What the classifier sees: the concrete operation plus the context that authorizes it. */
export interface DangerContext {
  readonly operation: string;
  readonly userRequest: string;
  readonly cwd: string;
}

export const EXPERT_LENSES = ["ordinary", "expert"] as const;
export type ExpertLens = (typeof EXPERT_LENSES)[number];

/** Outcome of a danger classification. `disabled` = no TypeSafe key configured; the gate must allow. */
export type DangerVerdict =
  | { readonly kind: "disabled" }
  | { readonly kind: "classified"; readonly level: DangerLevel }
  | { readonly kind: "error" };

/** Outcome of an expert-lens classification. `disabled`/`error` = no lens (advisory; fail open). */
export type ExpertVerdict =
  | { readonly kind: "disabled" }
  | { readonly kind: "classified"; readonly lens: ExpertLens }
  | { readonly kind: "error" };

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_OPERATION_CHARS = 4_000;
const MAX_REQUEST_CHARS = 2_000;

const DANGER_INSTRUCTIONS = `An AI coding agent is about to run this operation on a developer's machine. Answer highly_dangerous ONLY if it matches this list:

- Deleting or overwriting data with no backup or git recovery: rm -rf on home, root, or broad paths; wiping disks; deleting untracked work.
- Destroying git history: force-push to a shared or main branch, deleting remote branches, filter-repo on pushed history.
- Dropping, truncating, or bulk-deleting data in a production or shared database.
- Mutating production infrastructure: deploys, terraform apply/destroy, kubectl delete, cloud resource deletion.
- Sending secrets, keys, or credentials to a remote host or third party.
- Piping untrusted remote code into a shell (curl | sh from unknown sources).

Everything else is safe, including: reading, dumping, migrating, or restoring local or dev databases; tearing down disposable resources (local dev stacks, scratch, test, tmp, or per-run databases, temp directories, worktrees, build output); reading credentials from a password manager (op, 1Password, keychain) for local use; installing packages; editing files; normal git commits and pushes; running tests and builds.

The user's latest request is authoritative context: an operation the user explicitly asked for is safe unless it hits production or destroys unrecoverable data. Judge the operation, not keywords.`;

const EXPERT_LENS_INSTRUCTIONS = `Decide whether this request would benefit from an expert decision lens. This is a moderate threshold.

Reply expert when the task asks for, or will likely involve, a choice among plausible approaches: design or architecture, non-trivial implementation or refactoring, diagnosing a problem where the fix could take several forms, configuration or tooling trade-offs, or anything with architectural, product, operational, security, migration, or maintenance consequences.

Reply ordinary for acknowledgements, open-ended offers to help, pasted text without a task, simple factual questions, mechanical edits, exact renames, formatting, and small changes with one obvious implementation.

When uncertain, reply expert.`;

export const DangerAssessment = DecisionSet.make({
  input: Schema.Struct({ operation: Schema.String, userRequest: Schema.String, cwd: Schema.String }),
  questions: {
    danger: DecisionQuery.choice({
      instructions: DANGER_INSTRUCTIONS,
      options: { safe: null, highly_dangerous: null },
    }),
  },
});

export const ExpertAssessment = DecisionSet.make({
  input: Schema.Struct({ prompt: Schema.String }),
  questions: {
    lens: DecisionQuery.choice({
      instructions: EXPERT_LENS_INSTRUCTIONS,
      options: { ordinary: null, expert: null },
    }),
  },
});

const Live = TypeSafeDecisionModel.model("jev-latest").pipe(
  Layer.provide(
    TypeSafeClient.layer.pipe(
      Layer.provide(TypeSafeClient.Config.layer),
      Layer.provide(FetchHttpClient.layer),
    ),
  ),
);

/** A typed classifier backed by TypeSafe AI (`TYPESAFE_API_KEY`). */
export interface OperationClassifier {
  classifyDanger(context: DangerContext, timeoutMs?: number): Promise<DangerVerdict>;
  classifyExpert(prompt: string, timeoutMs?: number): Promise<ExpertVerdict>;
}

function isConfigured(): boolean {
  const key = process.env.TYPESAFE_API_KEY;
  return typeof key === "string" && key.length > 0;
}

export function makeClassifier(): OperationClassifier {
  const configured = isConfigured();

  function evaluateDanger(context: DangerContext, timeoutMs: number): Promise<Option.Option<DangerLevel>> {
    const effect = DecisionModel.DecisionModel.pipe(
      Effect.flatMap((model) => model.evaluate(DangerAssessment, context)),
      Effect.map((result) => result.answers.danger.choice),
      Effect.timeoutOption(`${timeoutMs} millis`),
      Effect.provide(Live),
    );
    return Effect.runPromise(effect);
  }

  function evaluateExpert(prompt: string, timeoutMs: number): Promise<Option.Option<ExpertLens>> {
    const effect = DecisionModel.DecisionModel.pipe(
      Effect.flatMap((model) => model.evaluate(ExpertAssessment, { prompt })),
      Effect.map((result) => result.answers.lens.choice),
      Effect.timeoutOption(`${timeoutMs} millis`),
      Effect.provide(Live),
    );
    return Effect.runPromise(effect);
  }

  return {
    async classifyDanger(context, timeoutMs = DEFAULT_TIMEOUT_MS) {
      if (!configured) return { kind: "disabled" };
      const bounded: DangerContext = {
        operation: context.operation.slice(0, MAX_OPERATION_CHARS),
        userRequest: context.userRequest.slice(-MAX_REQUEST_CHARS),
        cwd: context.cwd,
      };
      try {
        const result = await evaluateDanger(bounded, timeoutMs);
        return Option.match(result, {
          onNone: (): DangerVerdict => ({ kind: "error" }),
          onSome: (level): DangerVerdict => ({ kind: "classified", level }),
        });
      } catch {
        return { kind: "error" };
      }
    },
    async classifyExpert(prompt, timeoutMs = DEFAULT_TIMEOUT_MS) {
      if (!configured) return { kind: "disabled" };
      try {
        const result = await evaluateExpert(prompt, timeoutMs);
        return Option.match(result, {
          onNone: (): ExpertVerdict => ({ kind: "error" }),
          onSome: (lens): ExpertVerdict => ({ kind: "classified", lens }),
        });
      } catch {
        return { kind: "error" };
      }
    },
  };
}