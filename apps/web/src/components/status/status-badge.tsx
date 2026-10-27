import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toneBadge, toneDot, type Tone } from "./tone"

export function StatusDot({ tone, className }: { readonly tone: Tone; readonly className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0 rounded-full", toneDot[tone], className)} />
}

/** A soft-filled label with a dot, for states (active, pending, revoked), not for categories. */
export function StatusBadge({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }) {
  return (
    <Badge variant={toneBadge[tone]} className="gap-1.5">
      <StatusDot tone={tone} />
      {children}
    </Badge>
  )
}

/** Dot and plain text, for dense lists (the audit log) where a filled badge per row would shout. */
export function StatusText({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <StatusDot tone={tone} className="size-2" />
      <span className="truncate">{children}</span>
    </span>
  )
}
