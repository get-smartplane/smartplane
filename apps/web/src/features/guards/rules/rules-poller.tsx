import type { Guard } from "@pc/domain"
import { useAtomRefresh } from "@effect/atom-react"
import { useEffect } from "react"
import { guardsAtom } from "../atoms"
import { pollingFor } from "../verify/verify-state"

const EveryMs = 2000

/**
 * One poll for the whole rules list while any rule's verify run works: every row's stage comes from the same
 * refreshed list, however many runs go on in parallel. Stops when none is working.
 */
export function RulesPoller({ guards }: { readonly guards: ReadonlyArray<Guard> }) {
  const refresh = useAtomRefresh(guardsAtom)
  const polling = guards.some((guard) => pollingFor(guard, Date.now()) === "poll")
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(refresh, EveryMs)
    return () => clearInterval(timer)
  }, [polling, refresh])
  return null
}
