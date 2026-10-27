import { useEffect, useState } from "react"
import { toast } from "sonner"
import { callbackOutcome, oauthFailure, type OAuthFailure, type OAuthReturn } from "./oauth-return"

/**
 * Reads the OAuth callback's outcome once: success becomes a toast, a failure stays on the page as an alert
 * (a toast would vanish before anyone read the fix). `clear` drops the query string so a reload is clean.
 */
export const useOAuthReturn = (search: OAuthReturn, name: string, provider: string, clear: () => void): OAuthFailure | null => {
  const outcome = callbackOutcome(search)
  const [failure] = useState(() => (outcome === "error" ? oauthFailure(search.reason, provider) : null))
  useEffect(() => {
    if (outcome === null) return
    // A fixed id, so React's development double-run cannot toast twice.
    if (outcome === "connected") toast.success(`${name} is connected`, { id: "oauth-return", description: "Agents with a grant can use its actions now." })
    clear()
  }, [outcome, name, clear])
  return failure
}
