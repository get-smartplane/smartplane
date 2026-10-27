import type { EntityKind, LookupEntry, LookupRef } from "@pc/domain"
import { Effect } from "effect"
import type { Api } from "./client"

export interface Names {
  /** The display label for an id, or the id itself when it could not be resolved. */
  readonly of: (kind: EntityKind, id: string) => string
}

const key = (kind: EntityKind, id: string) => `${kind}:${id}`

/**
 * One batched lookup per table, like the dashboard. Names only decorate output, so a failed lookup (or a caller
 * without `resources:read`) falls back to raw ids instead of failing the command.
 */
export const lookupNames = (api: Api, refs: ReadonlyArray<LookupRef>): Effect.Effect<Names> => {
  const unique = [...new Map(refs.map((ref) => [key(ref.kind, ref.id), ref])).values()].slice(0, 200)
  if (unique.length === 0) return Effect.succeed({ of: (_, id) => id })
  return api.lookup.resolve({ payload: { refs: unique } }).pipe(
    Effect.map(({ entries }) => {
      // People by email and teams by slug: the handles `--to user:<email>` and `--to team:<slug>` take.
      const label = (entry: LookupEntry) => (entry.kind === "user" || entry.kind === "team" ? entry.detail ?? entry.label : entry.label)
      const labels = new Map(entries.map((entry) => [key(entry.kind, entry.id), entry.gone ? `${label(entry)} (gone)` : label(entry)]))
      return { of: (kind: EntityKind, id: string) => labels.get(key(kind, id)) ?? id }
    }),
    Effect.orElseSucceed((): Names => ({ of: (_, id) => id }))
  )
}
