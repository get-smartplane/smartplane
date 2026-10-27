import { LookupRef, type LookupEntry } from "@pc/domain"
import { Context, Effect, Exit, Layer, Option, Request, RequestResolver, Schema } from "effect"
import { ApiClient } from "@/lib/api/client"
import { toApiError, type ApiError } from "@/lib/api/errors"

class ResolveRef extends Request.TaggedClass("ResolveRef")<LookupRef, Option.Option<LookupEntry>, ApiError> {}

/** The API caps a lookup at 200 refs. */
const maxBatch = 200

/** Refs requested while a screen renders are collected for this long, then resolved in one call. */
const batchWindow = "15 millis"

const isLookupRef = Schema.is(LookupRef)

const sameRef = (ref: LookupRef) => (entry: LookupEntry) => entry.kind === ref.kind && entry.id === ref.id

/**
 * Display names for ids, batched across every component that asks during one render.
 * `None` means the API does not know the id; callers fall back to showing it raw.
 */
export class Lookup extends Context.Service<
  Lookup,
  { readonly resolve: (ref: LookupRef) => Effect.Effect<Option.Option<LookupEntry>, ApiError> }
>()("@pc/web/Lookup") {
  static readonly layer = Layer.effect(
    Lookup,
    Effect.gen(function*() {
      const api = yield* ApiClient
      const resolver = RequestResolver.make<ResolveRef>((entries) =>
        api.lookup.resolve({ payload: { refs: entries.map(({ request }) => ({ kind: request.kind, id: request.id })) } }).pipe(
          toApiError,
          Effect.exit,
          Effect.map((exit) => {
            for (const entry of entries) {
              entry.completeUnsafe(Exit.map(exit, (result) => Option.fromNullishOr(result.entries.find(sameRef(entry.request)))))
            }
          })
        )
      ).pipe(RequestResolver.setDelay(batchWindow), RequestResolver.batchN(maxBatch))

      // One malformed ref would fail the whole batch's payload, so it is answered locally instead.
      const resolve = Effect.fn("Lookup.resolve")(function*(ref: LookupRef) {
        if (!isLookupRef(ref)) return Option.none()
        return yield* Effect.request(new ResolveRef(ref), resolver)
      })
      return { resolve }
    })
  )
}
