import { Schema } from "effect"
import { HttpUrl } from "../primitives"
import { IntegrationAction } from "./action"
import { IntegrationAuthType, PieceAuth } from "./auth"
import { PieceId } from "./names"

const summaryFields = {
  id: PieceId,
  displayName: Schema.String,
  description: Schema.String,
  logoUrl: HttpUrl,
  categories: Schema.Array(Schema.String),
  /** npm version of the bundled piece. */
  version: Schema.String,
  /** Connection methods, in the piece's order of preference. */
  authTypes: Schema.Array(IntegrationAuthType),
  actionCount: Schema.Int,
  supportedActionCount: Schema.Int
}

/** A row of the integrations catalog. */
export const IntegrationPieceSummary = Schema.Struct(summaryFields).annotate({ identifier: "IntegrationPieceSummary" })
export type IntegrationPieceSummary = typeof IntegrationPieceSummary.Type

/**
 * The runner Worker that bundles a piece. Pieces are split across Workers so each bundle stays small and
 * starts fast; apps/api routes a run to its piece's shard.
 */
export const IntegrationShard = Schema.Literals(["core", "business"]).annotate({ identifier: "IntegrationShard" })
export type IntegrationShard = typeof IntegrationShard.Type

/** A piece with its connection methods and every action, including the ones the gateway does not run. */
export const IntegrationPiece = Schema.Struct({
  ...summaryFields,
  packageName: Schema.String,
  shard: IntegrationShard,
  auth: Schema.Array(PieceAuth),
  actions: Schema.Array(IntegrationAction)
}).annotate({ identifier: "IntegrationPiece" })
export type IntegrationPiece = typeof IntegrationPiece.Type

/** The generated manifest: every curated piece, built from the bundled Activepieces packages. */
export const IntegrationCatalog = Schema.Struct({
  source: Schema.Struct({ framework: Schema.Literal("activepieces"), license: Schema.Literal("MIT") }),
  pieces: Schema.Array(IntegrationPiece)
}).annotate({ identifier: "IntegrationCatalog" })
export type IntegrationCatalog = typeof IntegrationCatalog.Type

export const CatalogFilter = Schema.Struct({
  /** Case-insensitive match on id, name, description and category. */
  search: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(100))),
  category: Schema.optionalKey(Schema.String)
}).annotate({ identifier: "CatalogFilter" })
export type CatalogFilter = typeof CatalogFilter.Type

export const summarize = (piece: IntegrationPiece): IntegrationPieceSummary => ({
  id: piece.id,
  displayName: piece.displayName,
  description: piece.description,
  logoUrl: piece.logoUrl,
  categories: piece.categories,
  version: piece.version,
  authTypes: piece.authTypes,
  actionCount: piece.actionCount,
  supportedActionCount: piece.supportedActionCount
})
