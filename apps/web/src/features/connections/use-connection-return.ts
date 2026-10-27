import { useEffect, useState } from "react"
import { toast } from "sonner"
import { connectionFailure, connectionOutcome, type ConnectionReturn } from "./connection-return"

/** Reads the callback's outcome once: success toasts, a failure stays on the page as an alert; `clear` drops the query. */
export const useConnectionReturn = (search: ConnectionReturn, clear: () => void) => {
  const outcome = connectionOutcome(search)
  const [failure] = useState(() => (outcome === "error" ? connectionFailure(search.reason) : null))
  useEffect(() => {
    if (outcome === null) return
    if (outcome === "connected") toast.success("Account connected", { id: "connection-return", description: "Calls through this resource now use it." })
    clear()
  }, [outcome, clear])
  return failure
}
