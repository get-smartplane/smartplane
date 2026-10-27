import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { PixelCloud } from "./pixel-cloud"

/** A small window of sky with the subject's icon on a paper tile, for empty states. */
export function SkyEmblem({ icon: Icon, className }: { readonly icon: LucideIcon; readonly className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative isolate flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg bg-sky", className)}>
      <PixelCloud seed={7} className="absolute -left-3 bottom-1 -z-10 w-20" />
      <PixelCloud seed={21} w={22} h={9} className="absolute -top-1 -right-2 -z-10 w-16" />
      <span className="flex size-10 items-center justify-center rounded-md bg-card text-foreground ring-[1.5px] ring-plane-line dark:ring-0">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
    </span>
  )
}
