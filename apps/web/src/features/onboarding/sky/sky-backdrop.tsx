import type { CSSProperties } from "react"
import { PixelCloud } from "@/components/sky/pixel-cloud"
import "./sky.css"

interface Cloud {
  readonly seed: number
  readonly left: number
  readonly top: number
  readonly width: number
  /** Seconds for one drift; clouds higher up move slower, for a little depth. */
  readonly drift: number
}

const clouds: ReadonlyArray<Cloud> = [
  { seed: 21, left: -4, top: 9, width: 15, drift: 110 },
  { seed: 3, left: 70, top: 4, width: 19, drift: 130 },
  { seed: 12, left: 86, top: 30, width: 11, drift: 80 },
  { seed: 7, left: 2, top: 44, width: 12, drift: 70 },
  { seed: 5, left: 30, top: 70, width: 9, drift: 95 }
]

/**
 * The full-page sky behind the setup and welcome flows: fixed, so content scrolls over it and nothing
 * re-lays out; clouds drift on the compositor. Decorative only.
 */
export function SkyBackdrop({ sparse = false }: { readonly sparse?: boolean }) {
  return (
    <div aria-hidden="true" className="onb-sky pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {(sparse ? clouds.slice(0, 3) : clouds).map((cloud, index) => (
        <div
          key={cloud.seed}
          className="onb-cloud absolute"
          style={{ left: `${cloud.left}%`, top: `${cloud.top}%`, width: `${cloud.width}%`, "--drift": `${cloud.drift}s`, "--offset": `${-index * 17}s`, "--dx": `${index % 2 === 0 ? 5 : -5}vw` } as CSSProperties}
        >
          <PixelCloud seed={cloud.seed} className="w-full opacity-90" />
        </div>
      ))}
    </div>
  )
}
