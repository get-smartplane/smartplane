import type { Guard } from "@pc/domain"
import { useAtomRefresh } from "@effect/atom-react"
import { useEffect } from "react"
import { guardsAtom, pinStatsAtom } from "../atoms"
import { pollingFor } from "./verify-state"

const EveryMs = 1500

/**
 * Refreshes the rule while its verify run works, so each stage, the draft, pins and tested calls show up as
 * they land. A reload resumes from the server's state: the run lives on the guard. Stops when the run ends,
 * waits for a person, or has not moved for too long.
 */
export function VerifyPoller({ guard }: { readonly guard: Guard }) {
  const refresh = useAtomRefresh(guardsAtom)
  const refreshStats = useAtomRefresh(pinStatsAtom(guard.id))
  const polling = pollingFor(guard, Date.now()) === "poll"
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(() => {
      refresh()
      refreshStats()
    }, EveryMs)
    return () => clearInterval(timer)
  }, [polling, refresh, refreshStats])
  return null
}
