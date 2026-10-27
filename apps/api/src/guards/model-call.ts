import { ModelTimedOut, type UpstreamFailure } from "@pc/domain"
import { Duration, Effect } from "effect"
import type { WorkersAi } from "../platform/ai"

export type ReasoningEffort = "low" | "medium" | "high"

/** One kind of model call: which model, how hard it may think, and how long the caller waits. */
export interface ModelCall {
  readonly model: string
  /** What the call is for, in the typed timeout and on spans: "compile", "examples", "pin-lookup", "targets". */
  readonly purpose: string
  readonly timeout: Duration.Duration
  readonly reasoning?: ReasoningEffort
}

/** Models known not to reason: a reasoning parameter is left out for them. */
const nonReasoning = /mistral|llama|gemma-3|qwen2\.5/i

/**
 * Workers AI spells reasoning effort per model family: OpenAI's gpt-oss takes the Responses-style
 * `reasoning.effort`, the others (GLM, DeepSeek, Qwen) `reasoning_effort`. Non-reasoning models get nothing.
 */
export const reasoningParams = (model: string, effort: ReasoningEffort | undefined): Readonly<Record<string, unknown>> => {
  if (effort === undefined || nonReasoning.test(model)) return {}
  return model.includes("gpt-oss") ? { reasoning: { effort } } : { reasoning_effort: effort }
}

/**
 * The compiler's settings for a model. Reasoning models think at low effort (medium doubled latency for no
 * gain on the evals, `scripts/eval-models.ts`); a draft gets 30 s, then fails with `ModelTimedOut`.
 */
export const compileCall = (model: string): ModelCall => ({
  model,
  purpose: "compile",
  timeout: Duration.seconds(30),
  reasoning: "low"
})

/**
 * Runs one model call with an explicit deadline. Past it the call fails with `ModelTimedOut`, so a caller
 * can degrade (skip examples, keep the first draft) instead of hanging the request toward the 100 s edge limit.
 */
export const runModel = (ai: WorkersAi["Service"], call: ModelCall, input: Readonly<Record<string, unknown>>): Effect.Effect<unknown, UpstreamFailure | ModelTimedOut> =>
  ai.run(call.model, { ...input, ...reasoningParams(call.model, call.reasoning) }).pipe(
    Effect.timeoutOrElse({
      duration: call.timeout,
      orElse: () => Effect.fail(new ModelTimedOut({ model: call.model, purpose: call.purpose, timeoutMs: Duration.toMillis(call.timeout) }))
    }),
    Effect.withSpan("ModelCall.run", { attributes: { "ai.model": call.model, "ai.purpose": call.purpose, "ai.timeout_ms": Duration.toMillis(call.timeout) } })
  )
