import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { connectionFailure, connectionOutcome, type ConnectionReturn } from "@/features/connections/connection-return"
import type { OAuthFailure } from "@/features/integrations/oauth-return"

/**
 * The provider sent the browser back to `/integrations?resource=…&connection=…` after a catalog Connect.
 * Success is a toast (the card now reads Connected); a failure stays on the page, above the card to retry from.
 */
export const useCatalogReturn = (search: ConnectionReturn): OAuthFailure | null => {
  const navigate = useNavigate()
  const outcome = connectionOutcome(search)
  const [failure] = useState(() => (outcome === "error" ? connectionFailure(search.reason) : null))
  useEffect(() => {
    if (outcome === null) return
    // A fixed id, so React's development double-run cannot toast twice.
    if (outcome === "connected") toast.success("Connected", { id: "catalog-return", description: "Its tools are live. Grant access to let agents use them." })
    void navigate({ to: "/integrations", search: {}, replace: true })
  }, [outcome, navigate])
  return failure
}
