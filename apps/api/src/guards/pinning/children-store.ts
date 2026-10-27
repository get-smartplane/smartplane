import type { OrgId } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { KvCache } from "../../platform/kv"

/** Ids only: a normalised id is at most a URL-free token, never a title or content. */
const ChildIds = Schema.Struct({ ids: Schema.Array(Schema.String.check(Schema.isMaxLength(120))) })

/** A week: items seen in a read stay recognisable while an agent works through them, then age out. */
export const ChildTtlSeconds = 7 * 24 * 3600
/** Per pin; the oldest ids drop first. Keeps one KV value small (~80 KB at most). */
export const MaxChildrenPerPin = 2000

const key = (orgId: OrgId, pinId: string) => `pin-children:v1:${orgId}:${pinId}`

/** Merges new ids after the known ones, keeps the newest `cap`; `undefined` when nothing is new. */
export const mergeChildren = (known: ReadonlyArray<string>, fresh: ReadonlyArray<string>, cap = MaxChildrenPerPin): ReadonlyArray<string> | undefined => {
  const seen = new Set(known)
  const added = fresh.filter((id) => id.length <= 120 && !seen.has(id))
  if (added.length === 0) return undefined
  return [...known, ...new Set(added)].slice(-cap)
}

/**
 * Items recognised inside pinned entities (rows of a pinned database, issues of a pinned project), per org
 * and pin in KV, harvested from tool results the gateway already returned. Writes are last-writer-wins:
 * two concurrent harvests may drop each other's ids, which only means an item is recognised a call later.
 */
export class PinChildren extends Context.Service<PinChildren, {
  readonly get: (orgId: OrgId, pinIds: ReadonlyArray<string>) => Effect.Effect<ReadonlyMap<string, ReadonlySet<string>>>
  readonly add: (orgId: OrgId, pinId: string, ids: ReadonlyArray<string>) => Effect.Effect<void>
  readonly clear: (orgId: OrgId, pinId: string) => Effect.Effect<void>
}>()("api/guards/PinChildren") {
  static readonly layer = Layer.effect(
    PinChildren,
    Effect.gen(function*() {
      const kv = yield* KvCache
      const read = (orgId: OrgId, pinId: string) =>
        Effect.map(kv.get(key(orgId, pinId), ChildIds), (found) => Option.match(found, { onNone: (): ReadonlyArray<string> => [], onSome: (value) => value.ids }))

      return PinChildren.of({
        get: Effect.fn("PinChildren.get")(function*(orgId: OrgId, pinIds: ReadonlyArray<string>) {
          const lists = yield* Effect.forEach(pinIds, (pinId) => Effect.map(read(orgId, pinId), (ids) => [pinId, new Set(ids)] as const), { concurrency: 8 })
          return new Map(lists)
        }),
        add: Effect.fn("PinChildren.add")(function*(orgId: OrgId, pinId: string, ids: ReadonlyArray<string>) {
          const merged = mergeChildren(yield* read(orgId, pinId), ids)
          yield* Effect.annotateCurrentSpan({ "pin.children_added": merged === undefined ? 0 : ids.length })
          if (merged !== undefined) yield* kv.set(key(orgId, pinId), ChildIds, { ids: merged }, ChildTtlSeconds)
        }),
        clear: Effect.fn("PinChildren.clear")((orgId: OrgId, pinId: string) => kv.remove(key(orgId, pinId)))
      })
    })
  )
}
