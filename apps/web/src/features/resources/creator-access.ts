import type { ResourceKind } from "@pc/domain"
import { useCan } from "@/features/auth/me-context"

/**
 * The line under a "… added" toast: whoever creates a usable resource holds admin on it (the API grants it in
 * the same write). Secrets are never granted, so they say nothing.
 */
export const useCreatorAccessNote = (kind: ResourceKind): string | undefined => {
  const canGrant = useCan("grants:manage")
  if (kind === "secret") return undefined
  return canGrant ? "You have full access; grant others from Access." : "You have full access to it."
}
