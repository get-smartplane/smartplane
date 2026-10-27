import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** The surface every data table sits on: one card-coloured sheet with a hairline edge. */
export function TableFrame({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>{children}</div>
}
