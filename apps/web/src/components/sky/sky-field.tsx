import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { PaperPlane } from "./paper-plane"
import { PixelCloud } from "./pixel-cloud"

interface Cloud {
  readonly seed: number
  /** Position and width, as percentages of the field. */
  readonly left: number
  readonly top: number
  readonly width: number
}

const defaultClouds: ReadonlyArray<Cloud> = [
  { seed: 7, left: -4, top: 62, width: 26 },
  { seed: 21, left: 58, top: 8, width: 18 },
  { seed: 3, left: 78, top: 54, width: 30 },
  { seed: 12, left: 30, top: 80, width: 22 }
]

interface SkyFieldProps {
  readonly children?: ReactNode
  readonly className?: string
  readonly clouds?: ReadonlyArray<Cloud>
  /** Where the plane flies, as a percentage position and width; omit for no plane. */
  readonly plane?: { readonly left: number; readonly top: number; readonly width: number }
}

/** A flat field of sky with pixel clouds drifting behind its content. Day blue in light, night navy in dark. */
export function SkyField({ children, className, clouds = defaultClouds, plane }: SkyFieldProps) {
  return (
    <div className={cn("relative isolate overflow-hidden bg-sky text-sky-ink", className)}>
      {clouds.map((cloud) => (
        <PixelCloud
          key={`${cloud.seed}-${cloud.left}`}
          seed={cloud.seed}
          className="absolute -z-10"
          style={{ left: `${cloud.left}%`, top: `${cloud.top}%`, width: `${cloud.width}%` }}
        />
      ))}
      {plane && (
        <div className="absolute -z-10 hidden -rotate-6 sm:block" style={{ left: `${plane.left}%`, top: `${plane.top}%`, width: `${plane.width}%` }}>
          <PaperPlane />
        </div>
      )}
      {children}
    </div>
  )
}
