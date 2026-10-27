import type { UnauthorizedReason } from "@pc/domain"
import { useEffect } from "react"
import { Spinner } from "@/components/ui/spinner"
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect"

export function UnauthorizedRedirect({ reason }: { readonly reason: UnauthorizedReason }) {
  const redirect = useUnauthorizedRedirect()
  useEffect(() => redirect(reason), [redirect, reason])
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Spinner />
      Redirecting…
    </div>
  )
}
