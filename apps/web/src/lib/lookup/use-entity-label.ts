import type { LookupRef } from "@pc/domain"
import { useAtomValue } from "@effect/atom-react"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { lookupAtom } from "./lookup-atom"

export interface EntityLabel {
  readonly label: string
  readonly detail: string | null
  /** Removed or deprovisioned; history still names it. */
  readonly gone: boolean
  /** False while loading, or when the id is unknown or the lookup is not allowed: `label` is the raw id. */
  readonly resolved: boolean
}

const unresolved = (ref: LookupRef): EntityLabel => ({ label: ref.id, detail: null, gone: false, resolved: false })

/** A display name for an id, falling back to the id itself so nothing ever renders blank. */
export const useEntityLabel = (ref: LookupRef): EntityLabel => {
  const result = useAtomValue(lookupAtom(ref))
  if (!AsyncResult.isSuccess(result)) return unresolved(ref)
  return Option.match(result.value, {
    onNone: () => unresolved(ref),
    onSome: (entry) => ({ label: entry.label, detail: entry.detail, gone: entry.gone, resolved: true })
  })
}
