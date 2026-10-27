import type { LookupRef } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { runtime } from "@/lib/api/runtime"
import { Lookup } from "./lookup"

/**
 * One atom per ref, kept alive for the session: a name resolved once is never fetched again until reload.
 * Refs are compared structurally, so `{ kind, id }` literals built during render hit the same atom.
 */
export const lookupAtom = Atom.family((ref: LookupRef) =>
  runtime.atom(Lookup.use((lookup) => lookup.resolve(ref))).pipe(Atom.keepAlive)
)
