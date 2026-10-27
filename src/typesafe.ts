import { DecisionModel, DecisionQuery, DecisionSet } from "@effect-agent/ai-decision";
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect-agent/ai-typesafe";
import { Effect, Layer, Option, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

export const EXPERT_LENSES = ["ordinary", "expert"] as const;
export type ExpertLens = (typeof EXPERT_LENSES)[number];

/** Outcome of an expert-lens classification. `disabled`/`error` = no lens (advisory; fail open). */
export type ExpertVerdict =
  | { readonly kind: "disabled" }
  | { readonly kind: "classified"; readonly lens: ExpertLens }
  | { readonly kind: "error" };

const DEFAULT_TIMEOUT_MS = 5_000;
const EXPERT_LENS_INSTRUCTIONS = `Decide whether this request requires an expert decision lens. This is a high threshold: complexity alone is not enough.

Reply expert only when the stated task asks for, or necessarily requires, a material choice among plausible alternatives where a poor choice would have meaningful architectural, product, operational, security, migration, or long-term maintenance consequences.

Reply ordinary for acknowledgements, open-ended offers to help, pasted text without a task, factual questions, explanations, routine investigation or debugging, ordinary implementation, mechanical edits, exact renames, and multi-file work that does not itself require a consequential design choice.

When uncertain, reply ordinary unless the prompt itself establishes meaningful consequences.`;

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

export interface ExpertClassifier {
  classifyExpert(prompt: string, timeoutMs?: number): Promise<ExpertVerdict>;
}

function isConfigured(): boolean {
  const key = process.env.TYPESAFE_API_KEY;
  return typeof key === "string" && key.length > 0;
}

export function makeClassifier(): ExpertClassifier {
  const configured = isConfigured();

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