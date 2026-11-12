import { Effect } from "effect"
import { chunksOf } from "./chunks"

/** D1 allows at most 100 bound parameters per statement; this leaves room for the org id and a few filters. */
export const IdsPerQuery = 90


/**
 * Runs `query` once per group of at most `IdsPerQuery` ids and concatenates the rows, so an `IN (…)` list
 * never exceeds D1's parameter limit. No ids means no query.
 */
export const inChunks = <Id, A, E, R>(
  ids: ReadonlyArray<Id>,
  query: (chunk: ReadonlyArray<Id>) => Effect.Effect<ReadonlyArray<A>, E, R>
): Effect.Effect<ReadonlyArray<A>, E, R> =>
  Effect.map(Effect.forEach(chunksOf(ids, IdsPerQuery), query), (groups) => groups.flat())
