import {
  type CatalogFilter,
  type Forbidden,
  type IntegrationAction,
  type IntegrationPiece,
  type IntegrationPieceSummary,
  NotFound,
  type PieceId,
  type Principal,
  summarize
} from "@pc/domain"
import { decodeCatalog } from "@pc/integrations/catalog"
import { Context, Effect, Layer, Option } from "effect"
import { requirePermission } from "../auth/permissions"

const matches = (piece: IntegrationPiece, filter: CatalogFilter): boolean => {
  const search = filter.search?.trim().toLowerCase()
  const text = [piece.id, piece.displayName, piece.description, ...piece.categories].join(" ").toLowerCase()
  return (search === undefined || search === "" || text.includes(search)) &&
    (filter.category === undefined || piece.categories.includes(filter.category))
}

/** The bundled piece catalog, decoded once per isolate. Reading it needs `resources:read`, like resources. */
export class IntegrationCatalog extends Context.Service<IntegrationCatalog, {
  readonly piece: (id: string) => Option.Option<IntegrationPiece>
  readonly action: (pieceId: string, name: string) => Option.Option<IntegrationAction>
  readonly list: (principal: Principal, filter: CatalogFilter) => Effect.Effect<ReadonlyArray<IntegrationPieceSummary>, Forbidden>
  readonly get: (principal: Principal, id: PieceId) => Effect.Effect<IntegrationPiece, Forbidden | NotFound>
}>()("api/integrations/IntegrationCatalog") {
  static readonly layer = Layer.effect(
    IntegrationCatalog,
    Effect.gen(function*() {
      const { pieces } = yield* decodeCatalog
      const byId = new Map<string, IntegrationPiece>(pieces.map((piece) => [piece.id, piece]))
      const piece = (id: string) => Option.fromUndefinedOr(byId.get(id))
      return IntegrationCatalog.of({
        piece,
        action: (pieceId, name) => Option.flatMap(piece(pieceId), (found) => Option.fromUndefinedOr(found.actions.find((action) => action.name === name))),
        list: Effect.fn("IntegrationCatalog.list")(function*(principal: Principal, filter: CatalogFilter) {
          yield* requirePermission(principal, "resources:read")
          return pieces.filter((candidate) => matches(candidate, filter)).map(summarize)
        }),
        get: Effect.fn("IntegrationCatalog.get")(function*(principal: Principal, id: PieceId) {
          yield* requirePermission(principal, "resources:read")
          return yield* Option.match(piece(id), {
            onNone: () => Effect.fail(new NotFound({ entity: "integration_piece", id })),
            onSome: Effect.succeed
          })
        })
      })
    })
  )
}
