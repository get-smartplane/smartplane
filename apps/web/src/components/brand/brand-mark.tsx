import { cn } from "@/lib/utils"

/**
 * The mark: the site's paper plane as a line drawing, one stroke colour so it reads at 16px in either
 * theme. The fill takes the surface it sits on, so it is an outline, never a filled glyph.
 */
export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden="true" fill="none" strokeLinejoin="round" strokeLinecap="round">
      <g stroke="currentColor" strokeWidth="1.9">
        <path d="M3 16.6 29 6.4 14 19.2Z" className="fill-card" />
        <path d="M14 19.2 29 6.4 17.4 26.4Z" className="fill-muted" />
        <path d="M14 19.2 17.4 26.4 15.8 20.6" />
      </g>
    </svg>
  )
}

export function BrandWordmark({ className }: { readonly className?: string }) {
  return <span className={cn("font-display text-[1.0625rem] font-[720] tracking-[-0.04em]", className)}>Smartplane</span>
}

export function BrandName({ className }: { readonly className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark />
      <BrandWordmark />
    </span>
  )
}
