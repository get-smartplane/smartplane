import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Standard content column for every dashboard page. */
export function Page({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 pt-6 pb-16 md:px-8 md:pt-8", className)}>{children}</div>
  )
}
