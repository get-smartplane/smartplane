import { cn } from "@/lib/utils"

/** The paper plane, flat: white paper with a shaded wing and a near-black outline, as on smartplane.dev. */
export function PaperPlane({ className, strokeWidth = 3 }: { readonly className?: string; readonly strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 160 90" className={cn("block h-auto", className)} aria-hidden="true" strokeLinejoin="round">
      <g className="stroke-plane-line" strokeWidth={strokeWidth}>
        <path className="fill-plane" d="M6 46 154 8 70 54Z" />
        <path className="fill-plane-shade" d="M70 54 154 8 86 84Z" />
        <path className="fill-plane" d="M70 54 86 84 78 60Z" />
      </g>
    </svg>
  )
}
