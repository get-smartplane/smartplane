import type { ChainedAuditEvent } from "@pc/domain"
import { Check } from "lucide-react"
import { useRef } from "react"
import { PaperPlane } from "@/components/sky/paper-plane"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import "../sky/moments.css"
import { useInView } from "../sky/use-in-view"

/**
 * "Waiting for your first tool call…": the plane circles until the audit log shows an agent, then lands with
 * a check. The words carry the state for screen readers; the plane is decoration.
 */
export function FirstCall({ event }: { readonly event: ChainedAuditEvent | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const landed = event !== null
  return (
    <div ref={ref} className={cn("flex items-center gap-4 rounded-xl border p-4 transition-colors duration-300", landed ? "border-brand/50 bg-brand/6" : "bg-muted/40")}>
      <div aria-hidden="true" className="relative size-16 shrink-0">
        <span className="absolute inset-2 rounded-full border-2 border-dashed border-foreground/25" />
        {landed ? (
          <>
            <PaperPlane className="onb-land absolute top-6 left-1 w-12" strokeWidth={5} />
            <span className="onb-check absolute -top-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-brand text-brand-foreground ring-2 ring-card">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
          </>
        ) : (
          <div className="onb-orbit absolute inset-0" data-paused={inView ? undefined : ""}>
            <PaperPlane className="absolute top-0 left-1/2 w-9 -translate-x-1/2 -translate-y-1 rotate-12" strokeWidth={5} />
          </div>
        )}
      </div>
      <div aria-live="polite" className="flex min-w-0 flex-col gap-0.5">
        <p className="font-semibold">{landed ? "Your agent is connected" : "Waiting for your first tool call…"}</p>
        <p className="text-sm text-muted-foreground">
          {landed ? `First call ${formatRelative(event.occurredAt)}. It is in the audit log.` : "Paste the config, sign in, then ask your agent to list its tools."}
        </p>
      </div>
    </div>
  )
}
