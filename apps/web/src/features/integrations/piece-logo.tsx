import { Plug } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

const sizes = { sm: "size-6 p-0.5", md: "size-9 p-1.5", lg: "size-12 p-2" } as const

interface PieceLogoProps {
  readonly url: string | undefined
  readonly name: string
  readonly size?: keyof typeof sizes
  readonly className?: string
}

/**
 * Logos come from the Activepieces CDN; if one is blocked or missing, a neutral plug keeps the grid even.
 * No referrer: dashboard URLs carry resource ids, which the CDN has no business seeing.
 * The tile is always light so dark-on-transparent marks (GitHub, Notion) stay legible in dark mode.
 */
export function PieceLogo({ url, name, size = "md", className }: PieceLogoProps) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-black/8 dark:ring-white/10", sizes[size], className)}>
      {url === undefined || failed ? (
        <Plug className="size-full text-neutral-500" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" onError={() => setFailed(true)} />
      )}
      <span className="sr-only">{name}</span>
    </span>
  )
}
