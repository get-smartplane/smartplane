import { UpstreamFailure } from "@pc/domain"
import { type RunError, type RunOutput, type RunRequest, RunRequestJson, RunResponseJson, RunTimeoutMs } from "@pc/integrations/rpc"
import { Context, Duration, Effect, Layer, Option, Schema } from "effect"
import { WorkerBindings } from "../platform/bindings"
import { IntegrationCatalog } from "./catalog"
import { routeToShard, type ShardRoute, shardRunners } from "./shards"

const upstream = "integrations"

/**
 * The integrations runner Workers, over their service bindings: each run goes to the Worker of its piece's
 * shard. Requests and responses are schema-encoded both ways. A piece whose shard is not bound (local dev,
 * tests, a partial deployment) is not `serve`d, and the gateway offers no tools for it.
 */
export class IntegrationRunner extends Context.Service<IntegrationRunner, {
  readonly serves: (pieceId: string) => boolean
  readonly run: (request: RunRequest) => Effect.Effect<RunOutput, RunError | UpstreamFailure>
}>()("api/integrations/IntegrationRunner") {
  static readonly make = (route: (pieceId: string) => ShardRoute | undefined) =>
    IntegrationRunner.of({
      serves: (pieceId) => route(pieceId) !== undefined,
      run: Effect.fn("IntegrationRunner.run")(function*(request: RunRequest) {
        const target = route(request.pieceId)
        yield* Effect.annotateCurrentSpan({
          "piece.id": request.pieceId,
          "piece.action": request.actionName,
          "resource.id": request.resourceId,
          "integration.shard": target?.shard ?? "none"
        })
        if (target === undefined) return yield* new UpstreamFailure({ upstream, message: "the integrations service is not configured" })
        const encoded = yield* Effect.orDie(Schema.encodeEffect(RunRequestJson)(request))
        const raw = yield* Effect.tryPromise({
          try: () => target.runner.run(encoded),
          catch: () => new UpstreamFailure({ upstream, message: "the integrations service is unreachable" })
        }).pipe(
          Effect.timeoutOrElse({
            duration: Duration.millis(RunTimeoutMs + 5_000),
            orElse: () => Effect.fail(new UpstreamFailure({ upstream, message: "the integrations service did not answer" }))
          })
        )
        const response = yield* Schema.decodeUnknownEffect(RunResponseJson)(raw).pipe(
          Effect.mapError(() => new UpstreamFailure({ upstream, message: "the integrations service sent a malformed response" }))
        )
        return response.ok ? response.result : yield* Effect.fail(response.error)
      })
    })

  /** No runner Worker bound: nothing is served. */
  static readonly none = IntegrationRunner.make(() => undefined)

  static readonly layer = Layer.effect(
    IntegrationRunner,
    Effect.gen(function*() {
      const runners = shardRunners(yield* WorkerBindings)
      const catalog = yield* IntegrationCatalog
      return IntegrationRunner.make(routeToShard(runners, (pieceId) => Option.map(catalog.piece(pieceId), (piece) => piece.shard)))
    })
  )
}
