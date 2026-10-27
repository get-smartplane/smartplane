import { Conflict } from "@pc/domain"
import { Effect, Option, Schema } from "effect"
import type { SqlError } from "effect/sql/SqlError"

/** A TEXT column holding the JSON encoding of `schema`. */
export const JsonColumn = <S extends Schema.Top>(schema: S) => Schema.fromJsonString(Schema.toCodecJson(schema))

type RowCodec<A> = Schema.Codec<A, unknown, never, never>

/**
 * Decodes query rows with `codec`. A row that does not decode means the database and the domain disagree,
 * which is a bug, so it is a defect rather than an expected error (as are SQL errors).
 */
export const decodeRows = <A>(codec: RowCodec<A>) =>
<E, R>(query: Effect.Effect<ReadonlyArray<unknown>, E, R>): Effect.Effect<ReadonlyArray<A>, never, R> =>
  query.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(codec))), Effect.orDie)

export const decodeFirst = <A>(codec: RowCodec<A>) =>
<E, R>(query: Effect.Effect<ReadonlyArray<unknown>, E, R>): Effect.Effect<Option.Option<A>, never, R> =>
  Effect.map(decodeRows(codec)(query), (rows) => Option.fromUndefinedOr(rows[0]))

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Encodes a model into the column record for `sql.insert` / `sql.update`. */
export const encodeRow = <A>(codec: Schema.Codec<A, Schema.Json, never, never>) => (value: A) =>
  Schema.encodeEffect(codec)(value).pipe(
    Effect.orDie,
    Effect.flatMap((row) => (isRecord(row) ? Effect.succeed(row) : Effect.die(new Error("row codecs must encode to an object"))))
  )

/** Timestamps are stored as ISO-8601 UTC strings, the JSON encoding of `DateTimeUtc`. */
export const isoNow = (): string => new Date().toISOString()

const isUniqueViolation = (error: SqlError): boolean =>
  error.reason._tag === "UniqueViolation" ||
  (error.reason._tag === "UnknownError" && String(error.reason.cause).includes("UNIQUE constraint failed"))

/** Turns a unique-constraint violation into `Conflict`; any other SQL error stays a defect. */
export const conflictOnDuplicate = (message: string) =>
<A, R>(statement: Effect.Effect<A, SqlError, R>): Effect.Effect<A, Conflict, R> =>
  Effect.catchTag(statement, "SqlError", (error) =>
    isUniqueViolation(error) ? Effect.fail(new Conflict({ message })) : Effect.die(error))
