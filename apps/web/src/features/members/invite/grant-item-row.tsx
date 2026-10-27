import { Action } from "@pc/domain"
import { Schema } from "effect"
import { SlidersHorizontal, X } from "lucide-react"
import { useEffect } from "react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ValueTypeOf } from "@/features/access/argument-limits/argument-limits"
import { actionMeta } from "@/features/access/action-meta"
import { GrantAdvancedFields } from "@/features/access/grant-advanced-fields"
import type { GrantDraft } from "@/features/access/grant-draft"
import { grantSummary } from "@/features/access/grant-summary"
import { useToolSource, valueTypeOf } from "@/features/access/tool-source"
import { allResourcesAtom } from "@/features/resources/atoms"
import { kindMeta } from "@/features/resources/kinds"
import type { FieldErrors } from "@/lib/forms/decode-form"
import { cn } from "@/lib/utils"
import type { GrantItem } from "./invite-setup"

const isAction = Schema.is(Action)

interface GrantItemRowProps {
  readonly item: GrantItem
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly update: (change: (draft: GrantDraft) => GrantDraft) => void
  readonly onRemove: () => void
  /** Hands up how this resource's argument values are typed, for the payload built at submit. */
  readonly register: (key: number, valueTypeOf: ValueTypeOf) => void
  /** This grant's schema errors, keyed relative to it (`expiresAt`, `conditions.tools`). */
  readonly errors: FieldErrors
}

/** One direct grant: resource, level and a summary at a glance; expiry and limits open below, one row at a time. */
export function GrantItemRow({ item, open, onOpenChange, update, onRemove, register, errors }: GrantItemRowProps) {
  const { key, draft } = item
  const source = useToolSource(draft.resourceId)
  const resource = useQueryData(allResourcesAtom, []).find((candidate) => candidate.id === draft.resourceId)
  const Icon = resource ? kindMeta[resource.config.kind].icon : SlidersHorizontal
  const invalid = Object.keys(errors).length > 0
  useEffect(() => register(key, valueTypeOf(source)), [register, key, source])
  const set = <K extends keyof GrantDraft>(field: K, value: GrantDraft[K]) => update((current) => ({ ...current, [field]: value }))

  return (
    <li className={cn("rounded-lg border bg-card", invalid && "border-destructive/50")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="flex min-w-0 flex-1 basis-44 flex-col">
          <span className="truncate font-semibold">{resource?.name ?? "Resource no longer exists"}</span>
          <span className={cn("truncate text-xs", invalid ? "text-danger-ink" : "text-muted-foreground")}>
            {invalid ? Object.values(errors)[0] : grantSummary(draft, source)}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Select value={draft.action} onValueChange={(next) => isAction(next) && set("action", next)}>
            <SelectTrigger size="sm" className="w-28" aria-label={`Level for ${resource?.name ?? "this resource"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Action.literals.map((action) => (
                <SelectItem key={action} value={action}>
                  {actionMeta[action].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" size="icon-sm" aria-expanded={open} aria-label="Expiry and limits" title="Expiry and limits" onClick={() => onOpenChange(!open)}>
            <SlidersHorizontal className={cn(open && "text-brand")} />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${resource?.name ?? "grant"}`} onClick={onRemove}>
            <X />
          </Button>
        </span>
      </div>
      {open && (
        <div className="flex animate-reveal flex-col gap-5 rounded-b-lg bg-muted/40 px-3 pt-3 pb-4">
          <GrantAdvancedFields draft={draft} set={set} source={source} errors={errors} />
        </div>
      )}
    </li>
  )
}
