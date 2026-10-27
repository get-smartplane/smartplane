import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { PaperPlane } from "@/components/sky/paper-plane"
import "./moments.css"

/**
 * A rule said out loud: the landing's speech-bubble callout (paper, ink outline, tail) over a small plane.
 * It pops in once from its tail; under reduced motion it is simply there.
 */
export function SpeechBubble({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-4", className)}>
      <blockquote className="onb-bubble font-display text-xl leading-snug text-pretty">{children}</blockquote>
      <PaperPlane className="ml-1 w-14 -rotate-6" strokeWidth={4} />
    </div>
  )
}
