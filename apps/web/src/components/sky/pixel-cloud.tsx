import { useMemo, type CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { cloudPaths } from "./pixel-grid"

interface PixelCloudProps {
  readonly seed: number
  readonly w?: number
  readonly h?: number
  readonly className?: string
  readonly style?: CSSProperties
}

/** A pixel cloud in the theme's cloud tones (white by day, dim navy by night). Decorative only. */
export function PixelCloud({ seed, w = 28, h = 12, className, style }: PixelCloudProps) {
  const paths = useMemo(() => cloudPaths(seed, w, h), [seed, w, h])
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("pointer-events-none block h-auto select-none", className)}
      style={style}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path d={paths.shade} className="fill-cloud-shade" />
      <path d={paths.half} className="fill-cloud-half" />
      <path d={paths.lit} className="fill-cloud-lit" />
    </svg>
  )
}
