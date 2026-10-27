import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { Tone } from "@/components/status/tone"
import { cn } from "@/lib/utils"

export const attentionLinkClass = "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40"

const toneTile: { readonly [T in Tone]: string } = {
  success: "bg-success/10 text-success-ink",
  warning: "bg-warning/20 text-warning-ink",
  danger: "bg-destructive/10 text-danger-ink",
  info: "bg-info/20 text-info-ink",
  neutral: "bg-muted text-muted-foreground"
}

interface AttentionRowProps {
  readonly icon: LucideIcon
  readonly tone: Tone
  readonly title: ReactNode
  readonly detail: ReactNode
}

/** One thing waiting on someone: what it is, and why it is here. */
export function AttentionRow({ icon: Icon, tone, title, detail }: AttentionRowProps) {
  return (
    <>
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", toneTile[tone])}>
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="min-w-0 truncate text-sm font-medium">{title}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </>
  )
}
