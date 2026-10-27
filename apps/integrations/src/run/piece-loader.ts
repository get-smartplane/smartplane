import { actionsOf, findPiece, type PieceAction } from "@pc/integrations/piece-shape"
import { UnknownAction, UnsupportedAction } from "@pc/integrations/rpc"
import type { PieceLoaders } from "@pc/integrations/shards"
import { Context, Effect, Layer } from "effect"

/** Loads a shard's bundled piece packages on first use and hands out their actions (the original objects). */
export class PieceLoader extends Context.Service<PieceLoader, {
  readonly action: (pieceId: string, actionName: string) => Effect.Effect<PieceAction, UnknownAction | UnsupportedAction>
}>()("integrations/run/PieceLoader") {
  static readonly make = (loaders: PieceLoaders) =>
    Layer.sync(PieceLoader, () => {
      const modules = new Map<string, Promise<unknown>>()
      // A failed import is not kept, so one bad load does not disable the piece for the isolate's lifetime.
      const load = (pieceId: string, loader: () => Promise<unknown>) => {
        const cached = modules.get(pieceId)
        if (cached !== undefined) return cached
        const loading = loader()
        modules.set(pieceId, loading)
        loading.catch(() => modules.delete(pieceId))
        return loading
      }
      return PieceLoader.of({
        action: Effect.fn("PieceLoader.action")(function*(pieceId: string, actionName: string) {
          const loader = loaders[pieceId]
          if (loader === undefined) return yield* new UnknownAction({ pieceId, actionName })
          const failed = (reason: string) => new UnsupportedAction({ pieceId, actionName, reason })
          const module = yield* Effect.tryPromise({ try: () => load(pieceId, loader), catch: () => failed("the piece failed to load") })
          const piece = findPiece(module)
          if (piece === undefined) return yield* failed("the package exports no piece")
          const action = actionsOf(piece).get(actionName)
          if (action === undefined) return yield* new UnknownAction({ pieceId, actionName })
          return action
        })
      })
    })
}
