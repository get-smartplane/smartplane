import { UpstreamFailure } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { WorkerBindings } from "./bindings"

/** Workers AI. Responses are `unknown` on purpose: every caller decodes them with its own schema. */
export class WorkersAi extends Context.Service<WorkersAi, {
  readonly run: (model: string, input: Readonly<Record<string, unknown>>) => Effect.Effect<unknown, UpstreamFailure>
}>()("api/platform/WorkersAi") {
  static readonly layer = Layer.effect(
    WorkersAi,
    Effect.gen(function*() {
      const ai = (yield* WorkerBindings).AI
      return WorkersAi.of({
        run: Effect.fn("WorkersAi.run")(function*(model: string, input: Readonly<Record<string, unknown>>) {
          yield* Effect.annotateCurrentSpan({ "ai.model": model })
          return yield* Effect.tryPromise({
            try: (): Promise<unknown> => ai.run(model, { ...input }),
            catch: (cause) => new UpstreamFailure({ upstream: "workers-ai", message: String(cause) })
          })
        })
      })
    })
  )
}
