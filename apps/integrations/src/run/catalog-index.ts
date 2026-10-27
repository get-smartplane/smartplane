import type { IntegrationAction, IntegrationPiece, IntegrationShard } from "@pc/domain"
import { decodeCatalog } from "@pc/integrations/catalog"
import { UnknownAction, UnsupportedAction } from "@pc/integrations/rpc"
import { Context, Effect, Layer } from "effect"

/** The generated catalog, indexed for runs: only `supported` actions of the Worker's own pieces may execute. */
export class CatalogIndex extends Context.Service<CatalogIndex, {
  readonly runnable: (pieceId: string, actionName: string) => Effect.Effect<IntegrationAction, UnknownAction | UnsupportedAction>
}>()("integrations/run/CatalogIndex") {
  static readonly make = (serves: (piece: IntegrationPiece) => boolean) =>
    Layer.effect(
      CatalogIndex,
      Effect.gen(function*() {
        const catalog = yield* decodeCatalog
        const actions = new Map<string, IntegrationAction>(
          catalog.pieces.filter(serves).flatMap((piece) => piece.actions.map((action) => [`${piece.id}/${action.name}`, action] as const))
        )
        return CatalogIndex.of({
          runnable: (pieceId, actionName) => {
            const action = actions.get(`${pieceId}/${actionName}`)
            if (action === undefined) return Effect.fail(new UnknownAction({ pieceId, actionName }))
            switch (action.support.status) {
              case "supported":
                return Effect.succeed(action)
              case "superseded":
                return Effect.fail(new UnsupportedAction({ pieceId, actionName, reason: `use ${action.support.by} instead` }))
              case "unsupported":
                return Effect.fail(new UnsupportedAction({ pieceId, actionName, reason: action.support.reason }))
            }
          }
        })
      })
    )

  /** A shard's Worker knows only its own pieces: another shard's piece is an `UnknownAction` here. */
  static readonly forShard = (shard: IntegrationShard) => CatalogIndex.make((piece) => piece.shard === shard)

  /** Every piece of every shard (tests that run pieces from several shards in one process). */
  static readonly all = CatalogIndex.make(() => true)
}
