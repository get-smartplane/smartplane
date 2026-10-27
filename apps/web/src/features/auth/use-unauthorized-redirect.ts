import type { UnauthorizedReason } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { loginUrl } from "@/lib/api/session"

/**
 * Where an Unauthorized failure sends the user: a signed-in user without an org goes to onboarding;
 * someone who never signed in sees the login page; an expired or rejected session restarts AuthKit.
 */
export const useUnauthorizedRedirect = () => {
  const navigate = useNavigate()
  return useCallback(
    (reason: UnauthorizedReason) => {
      switch (reason) {
        case "no_organization":
          return void navigate({ to: "/onboarding", replace: true })
        case "missing_credentials":
          return void navigate({ to: "/login", replace: true })
        case "deprovisioned":
          return void navigate({ to: "/login", search: { reason: "deprovisioned" }, replace: true })
        case "expired":
        case "invalid_credentials":
          return window.location.assign(loginUrl())
      }
    },
    [navigate]
  )
}
