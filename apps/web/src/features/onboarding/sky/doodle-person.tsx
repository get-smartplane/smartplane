import { cn } from "@/lib/utils"

/** The landing's pen-doodle person (wobbly head, stick body, laptop under one arm), in the page's ink. */
export function DoodlePerson({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 44 72" className={cn("block h-auto", className)} aria-hidden="true">
      <g fill="none" className="stroke-foreground" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 4C28 3 31 9 30 14C29 20 23 22 19 21C13 20 11 14 12 10C13 6 17 4 21 4Z" className="fill-card" />
        <path d="M21 22C22 30 20 36 21 44" />
        <path d="M21 28C15 31 12 35 9 38" />
        <path d="M21 28C26 30 29 32 31 35" />
        <path d="M29 33 38 31 39 38 30 40Z" className="fill-accent" />
        <path d="M21 44C18 52 14 57 10 64" />
        <path d="M21 44C24 51 28 56 32 62" />
      </g>
    </svg>
  )
}
