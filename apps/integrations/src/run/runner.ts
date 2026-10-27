import { cachedValidator } from "@pc/integrations/validation"
import { type RunError, type RunOutput, type RunRequest, RunTimeoutMs, Timeout } from "@pc/integrations/rpc"
import { Clock, Context, Duration, Effect, Layer } from "effect"
import { scrubber, secretsOf } from "./auth-value"
import { CatalogIndex } from "./catalog-index"
import { actionContext } from "./context"
import { failureOf } from "./failure"
import { toOutput } from "./output"
import { PieceLoader } from "./piece-loader"
import { ActionStore } from "./store"

/** Defaults the piece declares for inputs the agent left out, as the Activepieces engine applies them. */
const withDefaults = (props: Readonly<Record<string, { readonly defaultValue?: unknown }>>, input: Readonly<Record<string, unknown>>) => ({
  ...Object.fromEntries(Object.entries(props).flatMap(([name, prop]) => (prop.defaultValue === undefined ? [] : [[name, prop.defaultValue]]))),
  ...input
})

/**
 * Runs one piece action: catalog check (supported only), input validation against the catalog schema, a
 * Smartplane-built context, a hard timeout, and a scrubbed, size-capped JSON result. Credentials never
 * reach spans, logs or the result.
 */
export class PieceRunner extends Context.Service<PieceRunner, {
  readonly run: (request: RunRequest) => Effect.Effect<RunOutput, RunError>
}>()("integrations/run/PieceRunner") {
  static readonly layer = Layer.effect(
    PieceRunner,
    Effect.gen(function*() {
      const catalog = yield* CatalogIndex
      const loader = yield* PieceLoader
      const stores = yield* ActionStore

      const run = Effect.fn("PieceRunner.run")(function*(request: RunRequest) {
        const { pieceId, actionName } = request
        yield* Effect.annotateCurrentSpan({ "piece.id": pieceId, "piece.action": actionName, "org.id": request.orgId, "resource.id": request.resourceId })
        const entry = yield* catalog.runnable(pieceId, actionName)
        const input = yield* cachedValidator(pieceId, actionName, entry.inputSchema)(request.props)
        const action = yield* loader.action(pieceId, actionName)
        const scrub = scrubber(secretsOf(request.auth))
        const context = actionContext({
          request,
          propsValue: withDefaults(action.props, input),
          store: stores.forResource(request.orgId, request.resourceId),
          runId: crypto.randomUUID()
        })
        const started = yield* Clock.currentTimeMillis
        const value = yield* Effect.tryPromise({ try: async () => action.run(context), catch: (error) => failureOf(error, scrub) }).pipe(
          Effect.timeoutOrElse({ duration: Duration.millis(RunTimeoutMs), orElse: () => Effect.fail(new Timeout({ ms: RunTimeoutMs })) })
        )
        const ms = (yield* Clock.currentTimeMillis) - started
        const { output, truncated } = toOutput(value, scrub)
        yield* Effect.annotateCurrentSpan({ "piece.ms": ms, "piece.truncated": truncated })
        const result: RunOutput = { output, truncated, ms }
        return result
      }, Effect.tapError((error) => Effect.annotateCurrentSpan({ "piece.error": error._tag })))

      return PieceRunner.of({ run })
    })
  )
}
