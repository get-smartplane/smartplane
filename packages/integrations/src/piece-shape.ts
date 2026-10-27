import { Schema } from "effect"

/**
 * Activepieces objects are external data. These schemas check what a piece package exports, keeping only
 * what Smartplane relies on. They are used as guards (`Schema.is`) rather than decoders: pieces call their
 * own methods through `this`, so the original objects must be kept, not copies. Prop types stay open
 * strings so a new framework prop type is reported rather than fatal.
 */
/** Any JavaScript function: callable with whatever arguments, returning something to be checked. */
export type AnyFunction = (...args: ReadonlyArray<unknown>) => unknown

export const AnyFunction = Schema.declare((input: unknown): input is AnyFunction => typeof input === "function", {
  identifier: "Function"
})

export const StaticOption = Schema.Struct({ label: Schema.String, value: Schema.Unknown })
export type StaticOption = typeof StaticOption.Type

/** `options` of a static dropdown; dynamic dropdowns hold a function there instead. */
export const StaticOptions = Schema.Struct({ options: Schema.Array(StaticOption) })

export interface PieceProp {
  readonly type: string
  readonly displayName?: string | null | undefined
  readonly description?: string | null | undefined
  readonly required?: boolean | undefined
  readonly defaultValue?: unknown
  readonly options?: unknown
  readonly refreshers?: ReadonlyArray<string> | undefined
  /** Item fields of an ARRAY prop whose items are objects. */
  readonly properties?: Readonly<Record<string, PieceProp>> | undefined
}

const MaybeString = Schema.optional(Schema.NullOr(Schema.String))

export const PieceProp: Schema.Codec<PieceProp> = Schema.Struct({
  type: Schema.String,
  displayName: MaybeString,
  description: MaybeString,
  required: Schema.optional(Schema.Boolean),
  defaultValue: Schema.optional(Schema.Unknown),
  options: Schema.optional(Schema.Unknown),
  refreshers: Schema.optional(Schema.Array(Schema.String)),
  properties: Schema.optional(Schema.Record(Schema.String, Schema.suspend((): Schema.Codec<PieceProp> => PieceProp)))
})

export const PieceAction = Schema.Struct({
  name: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  props: Schema.Record(Schema.String, PieceProp),
  run: AnyFunction,
  requireAuth: Schema.optional(Schema.Boolean),
  audience: Schema.optional(Schema.NullOr(Schema.String)),
  classification: Schema.optional(Schema.NullOr(Schema.String)),
  aiMetadata: Schema.optional(Schema.NullOr(Schema.Struct({ idempotent: Schema.optional(Schema.Boolean) })))
})
export type PieceAction = typeof PieceAction.Type

/** Auth stays `unknown` here; `auth/convert.ts` checks each kind it supports. */
export const PieceDefinition = Schema.Struct({
  displayName: Schema.String,
  description: Schema.optional(Schema.String),
  logoUrl: Schema.String,
  categories: Schema.optional(Schema.Array(Schema.String)),
  auth: Schema.optional(Schema.Unknown),
  actions: AnyFunction
})
export type PieceDefinition = typeof PieceDefinition.Type

export const isPieceDefinition = Schema.is(PieceDefinition)
export const isPieceAction = Schema.is(PieceAction)
export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A piece package exports its piece under a camel-case name (`github`, `googleSheets`); find it by shape. */
export const findPiece = (module: unknown): PieceDefinition | undefined =>
  isRecord(module) ? Object.values(module).find(isPieceDefinition) : undefined

/** The piece's actions by name; anything that is not action-shaped is dropped. */
export const actionsOf = (piece: PieceDefinition): ReadonlyMap<string, PieceAction> => {
  const actions = piece.actions()
  return new Map(isRecord(actions) ? Object.entries(actions).flatMap(([name, action]) => (isPieceAction(action) ? [[name, action]] : [])) : [])
}
