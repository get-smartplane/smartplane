import { Probability, UpstreamFailure } from "@pc/domain"
import { Context, Duration, Effect, Layer, Schema } from "effect"
import { AppConfig } from "../platform/config"
import { WorkersAi } from "../platform/ai"
import { chunksOf } from "../platform/chunks"

const ClefResponse = Schema.Struct({
  answers: Schema.Record(Schema.String, Schema.Struct({ noul: Probability, confidence: Schema.optional(Schema.Number) }))
})

/** A guard decision must not hold an agent for long; past this the guard counts as unavailable. */
const Timeout = Duration.seconds(10)
/** Clef answers at most 64 questions per call. */
export const QuestionsPerCall = 64
/** Calls in flight per classification, so a resource with hundreds of guards cannot flood Workers AI. */
const CallConcurrency = 4

/**
 * Cloudflare Clef decision models on Workers AI: calibrated yes/no probabilities for predefined questions.
 * More than 64 questions are split into calls of at most 64, run concurrently.
 */
export class Classifier extends Context.Service<Classifier, {
  /**
   * Probability that the answer to each question is "yes" (the action violates the guard), keyed by question id.
   * Fails if any call fails, and leaves out any question Clef did not answer, so callers fail closed on both.
   */
  readonly classify: (
    state: unknown,
    questions: ReadonlyMap<string, string>
  ) => Effect.Effect<ReadonlyMap<string, number>, UpstreamFailure>
}>()("api/guards/Classifier") {
  /** Built from a model id so the compiler eval and self-test scripts run the same code against the REST API. */
  static readonly make = (model: string) =>
    Effect.gen(function*() {
      const ai = yield* WorkersAi
      const unavailable = (message: string) => new UpstreamFailure({ upstream: "clef", message })

      const call = Effect.fn("Classifier.call")(function*(state: unknown, questions: ReadonlyArray<readonly [string, string]>) {
        const response = yield* ai.run(model, {
          model: model.split("/").at(-1),
          state,
          questions: Object.fromEntries(questions.map(([id, instructions]) => [id, { type: "noul", instructions }]))
        }).pipe(Effect.timeoutOrElse({ duration: Timeout, orElse: () => Effect.fail(unavailable("timed out")) }))
        const { answers } = yield* Schema.decodeUnknownEffect(ClefResponse)(response).pipe(
          Effect.mapError(() => unavailable("unexpected response shape"))
        )
        // Only answers to this call's own questions count; anything else Clef returns is ignored.
        return questions.flatMap(([id]) => {
          const answer = answers[id]
          return answer === undefined ? [] : [[id, answer.noul] as const]
        })
      })

      return Classifier.of({
        classify: Effect.fn("Classifier.classify")(function*(state: unknown, questions: ReadonlyMap<string, string>) {
          const groups = chunksOf([...questions], QuestionsPerCall)
          yield* Effect.annotateCurrentSpan({ "clef.questions": questions.size, "clef.calls": groups.length })
          const answered = yield* Effect.forEach(groups, (group) => call(state, group), { concurrency: CallConcurrency })
          return new Map(answered.flat())
        })
      })
    })

  static readonly layer = Layer.effect(Classifier, Effect.gen(function*() {
    return yield* Classifier.make((yield* AppConfig).CLASSIFIER_MODEL)
  }))
}
