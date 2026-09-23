import { DecisionModel, DecisionQuery, DecisionSet } from "@effect-agent/ai-decision";
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect-agent/ai-typesafe";
import { Effect, Layer, Option, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

export const DANGER_LEVELS = ["safe", "dangerous", "ultra_dangerous"] as const;
export type DangerLevel = (typeof DANGER_LEVELS)[number];

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

const DANGER_INSTRUCTIONS = `Classify the danger level of this autonomous-agent operation. You are gating an autonomous AI coding agent before it executes. Judge the concrete, irreversible or catastrophic harm this operation could cause if it runs.

ULTRA DANGEROUS means the operation could cause irreversible or catastrophic damage that the user cannot trivially undo: permanent data loss, deleting or overwriting files without a backup, destructive git history rewrite or force-push, dropping databases or tables, formatting or wiping disks, credential or key exfiltration to a remote host, disabling production systems, installing or executing untrusted remote code, or broad destructive shell operations on important paths.

DANGEROUS means risky but reversible or contained: modifying tracked files, moving or deleting recoverable files, installing packages, pushing changes, changing configuration, anything a user could recover from with git or a reinstall.

SAFE means read-only, informational, or trivially harmless: inspecting, listing, reading, searching, printing, and ordinary non-destructive commands.

When uncertain, prefer DANGEROUS over SAFE, and reserve ULTRA DANGEROUS for clearly catastrophic, hard-to-reverse harm.`;

const EXPERT_LENS_INSTRUCTIONS = `Decide whether this request requires an expert decision lens. This is a high threshold: complexity alone is not enough.

Reply expert only when the stated task asks for, or necessarily requires, a material choice among plausible alternatives where a poor choice would have meaningful architectural, product, operational, security, migration, or long-term maintenance consequences.

Reply ordinary for acknowledgements, open-ended offers to help, pasted text without a task, factual questions, explanations, routine investigation or debugging, ordinary implementation, mechanical edits, exact renames, and multi-file work that does not itself require a consequential design choice.

When uncertain, reply ordinary unless the prompt itself establishes meaningful consequences.`;

export const DangerAssessment = DecisionSet.make({
  input: Schema.Struct({ operation: Schema.String }),
  questions: {
    danger: DecisionQuery.choice({
      instructions: DANGER_INSTRUCTIONS,
      options: { safe: null, dangerous: null, ultra_dangerous: null },
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
  classifyDanger(operation: string, timeoutMs?: number): Promise<DangerVerdict>;
  classifyExpert(prompt: string, timeoutMs?: number): Promise<ExpertVerdict>;
}

function isConfigured(): boolean {
  const key = process.env.TYPESAFE_API_KEY;
  return typeof key === "string" && key.length > 0;
}

export function makeClassifier(): OperationClassifier {
  const configured = isConfigured();

  function evaluateDanger(operation: string, timeoutMs: number): Promise<Option.Option<DangerLevel>> {
    const effect = DecisionModel.DecisionModel.pipe(
      Effect.flatMap((model) => model.evaluate(DangerAssessment, { operation })),
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
    async classifyDanger(operation, timeoutMs = DEFAULT_TIMEOUT_MS) {
      if (!configured) return { kind: "disabled" };
      const bounded = operation.slice(0, MAX_OPERATION_CHARS);
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