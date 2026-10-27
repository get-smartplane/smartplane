import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { chainVerificationAtom } from "./atoms"

/** Re-hashes the org's chain server-side and reports whether any event was altered or removed. */
export function ChainBadge() {
  const result = useAtomValue(chainVerificationAtom)
  if (AsyncResult.isInitial(result)) {
    return (
      <Badge variant="outline" className="h-6 px-2">
        <Spinner />
        Verifying chain…
      </Badge>
    )
  }
  if (AsyncResult.isFailure(result)) {
    return (
      <Badge variant="warning" className="h-6 px-2">
        <ShieldQuestion />
        Chain not verified
      </Badge>
    )
  }
  const verification = result.value
  return verification._tag === "Intact" ? (
    <Badge variant="success" className="h-6 gap-1.5 px-2">
      <ShieldCheck />
      <span className="tabular-nums">Chain intact · {verification.checked.toLocaleString()} events</span>
    </Badge>
  ) : (
    <Badge variant="destructive" className="h-6 gap-1.5 px-2">
      <ShieldAlert />
      Chain broken at #{verification.at}
    </Badge>
  )
}
