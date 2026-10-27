import { Probability, UpstreamFailure } from "@pc/domain"
import { Context, Duration, Effect, Layer, Schema } from "effect"
import { AppConfig } from "../platform/config"
import { WorkersAi } from "../platform/ai"

const ClefResponse = Schema.Struct({
  answers: Schema.Record(Schema.String, Schema.Struct({ noul: Probability, confidence: Schema.optional(Schema.Number) }))
})

/** A guard decision must not hold an agent for long; past this the guard counts as unavailable. */
const Timeout = Duration.seconds(10)

/**
 * Cloudflare Clef decision models on Workers AI: calibrated yes/no probabilities for predefined questions,
 * up to 64 per call, so every applicable guard is answered in one request.
 */
export class Classifier extends Context.Service<Classifier, {
  /** Probability that the answer to each question is "yes" (the action violates the guard), keyed by question id. */
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

      return Classifier.of({
        classify: Effect.fn("Classifier.classify")(function*(state: unknown, questions: ReadonlyMap<string, string>) {
          yield* Effect.annotateCurrentSpan({ "clef.questions": questions.size })
          const response = yield* ai.run(model, {
            model: model.split("/").at(-1),
            state,
            questions: Object.fromEntries(Array.from(questions, ([id, instructions]) => [id, { type: "noul", instructions }]))
          }).pipe(Effect.timeoutOrElse({ duration: Timeout, orElse: () => Effect.fail(unavailable("timed out")) }))
          const { answers } = yield* Schema.decodeUnknownEffect(ClefResponse)(response).pipe(
            Effect.mapError(() => unavailable("unexpected response shape"))
          )
          return new Map(Object.entries(answers).map(([id, answer]) => [id, answer.noul]))
        })
      })
    })

  static readonly layer = Layer.effect(Classifier, Effect.gen(function*() {
    return yield* Classifier.make((yield* AppConfig).CLASSIFIER_MODEL)
  }))
}
