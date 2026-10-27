import { useAtomValue } from "@effect/atom-react"
import { AsyncResult, type Atom } from "effect/reactivity"

/** Secondary data for lookups (names in a select, labels in a table); `fallback` until it loads or if it fails. */
export const useQueryData = <A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>, fallback: A): A =>
  AsyncResult.getOrElse(useAtomValue(atom), () => fallback)
