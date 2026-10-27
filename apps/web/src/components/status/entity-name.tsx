import type { LookupRef } from "@pc/domain"
import { useEntityLabel } from "@/lib/lookup/use-entity-label"
import { cn } from "@/lib/utils"

interface EntityNameProps {
  readonly entity: LookupRef
  /** Show the secondary line (an email, a resource kind) under the name. */
  readonly withDetail?: boolean
  readonly className?: string
}

/**
 * The current name of an id, resolved through the batched lookup. Unresolved ids render as monospace ids;
 * removed entities keep their name, dimmed, so history still reads.
 */
export function EntityName({ entity, withDetail, className }: EntityNameProps) {
  const { label, detail, gone, resolved } = useEntityLabel(entity)
  return (
    <span className={cn("flex min-w-0 flex-col leading-tight", className)} title={resolved ? entity.id : undefined}>
      <span className={cn("inline-flex min-w-0 items-baseline gap-1.5", gone && "text-muted-foreground")}>
        <span className={cn("truncate", !resolved && "font-mono text-xs")}>{label}</span>
        {gone && <span className="shrink-0 text-[0.6875rem] text-muted-foreground/80">removed</span>}
      </span>
      {withDetail && detail !== null && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
    </span>
  )
}
