import type { Guard, GuardPinLookup } from "@pc/domain"
import { Info } from "lucide-react"
import { PinChooser } from "./pin-chooser"
import { PinnedList } from "./pinned-list"

/** Why a rule that names something specific is not pinned; it is then judged by meaning alone. */
const reason = (lookup: GuardPinLookup): string | undefined => {
  const named = lookup.mention ? `“${lookup.mention}”` : "what the rule names"
  switch (lookup.status) {
    case "no_connection":
      return `Not pinned: ${named} could not be looked up with your account. ${lookup.detail ?? ""}`
    case "none_found":
      return `Not pinned: nothing called ${named} was found.`
    case "no_lookup_tool":
      return `Not pinned: none of its read-only tools can look up ${named}.`
    case "failed":
      return `Not pinned: the lookup did not finish. ${lookup.detail ?? ""}`
    case "dismissed":
      return "Not pinned: you said none of the candidates is it."
    default:
      return undefined
  }
}

/** Pinned things, the candidates to confirm, or why there are none, under "Applies to". */
export function PinSummary({ guard }: { readonly guard: Guard }) {
  const lookup = guard.compiled?.pinning
  if (guard.pins.length > 0) return <PinnedList guard={guard} />
  if (lookup === undefined) return null
  if (lookup.status === "found" && lookup.candidates.length > 0) return <PinChooser guard={guard} lookup={lookup} />
  const text = reason(lookup)
  if (text === undefined) return null
  return (
    <p className="flex items-start gap-2 text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>{text.trim()} The rule still checks every call by meaning.</span>
    </p>
  )
}
