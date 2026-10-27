import { ResourceId } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { connectionFailure, connectionOutcome } from "@/features/connections/connection-return"
import { callbackOutcome, oauthFailure, type OAuthFailure } from "@/features/integrations/oauth-return"
import type { SetupSearch } from "../setup/setup-search"
import type { SetupController } from "../setup/use-setup"

const decodeResourceId = Schema.decodeUnknownOption(ResourceId)

/**
 * The provider sent the browser back to `/setup?step=tool&resource=…&integration=…` (an integration) or
 * `…&connection=…` (an MCP server from the catalog). Connected: the step is
 * done and the flow moves on. Failed: the reason stays on screen beside a retry.
 */
export const useSetupOAuthReturn = (controller: SetupController, search: SetupSearch, provider: string): { readonly failure: OAuthFailure | null; readonly resourceId: ResourceId | null } => {
  const navigate = useNavigate()
  const viaConnection = search.connection !== undefined
  const outcome = viaConnection ? connectionOutcome(search) : callbackOutcome(search)
  const resourceId = Option.getOrNull(decodeResourceId(search.resource))
  const [failure] = useState(() => (outcome !== "error" ? null : viaConnection ? connectionFailure(search.reason) : oauthFailure(search.reason, provider)))
  const handled = useRef(false)
  useEffect(() => {
    if (outcome === null || handled.current) return
    handled.current = true
    if (outcome === "connected" && resourceId !== null) {
      // A fixed id, so React's development double-run cannot toast twice.
      toast.success("Connected", { id: "setup-oauth-return", description: "Next, decide who can use it." })
      void controller.finish("done", { toolResourceId: resourceId })
    } else {
      void navigate({ to: "/setup", search: { step: "tool" }, replace: true })
    }
  }, [outcome, resourceId, controller, navigate])
  return { failure, resourceId }
}
