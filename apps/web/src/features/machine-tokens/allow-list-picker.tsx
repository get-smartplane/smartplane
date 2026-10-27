import { deliverability, envNameOf, type ProjectId, type Resource, type ResourceId } from "@pc/domain"
import { useState } from "react"
import { matchesQuery, SearchInput } from "@/components/form/search-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { EnableDeliveryDialog } from "@/features/secrets/delivery/enable-delivery-dialog"
import { cn } from "@/lib/utils"

/** What a token scoped to `projectId` can reach: org-wide values plus that project's (every value when unscoped). */
export const inTokenScope = (resource: Resource, projectId: ProjectId | null) =>
  (resource.config.kind === "secret" || resource.config.kind === "variable") &&
  (projectId === null || resource.projectId === null || resource.projectId === projectId)

interface AllowListPickerProps {
  readonly id: string
  readonly candidates: ReadonlyArray<Resource>
  readonly value: ReadonlyArray<ResourceId>
  readonly onChange: (value: ReadonlyArray<ResourceId>) => void
  readonly invalid: boolean
}

const searchFrom = 8

/**
 * Only deliverable values can be chosen. A gateway-only secret stays in the list, explained, with a one-click
 * "Make deliverable" that goes through the same confirm as the Secrets table, then selects it.
 */
export function AllowListPicker({ id, candidates, value, onChange, invalid }: AllowListPickerProps) {
  const [query, setQuery] = useState("")
  const [enabling, setEnabling] = useState<Resource>()
  const ordered = [...candidates].sort((a, b) =>
    Number(deliverability(b.config) === "deliverable") - Number(deliverability(a.config) === "deliverable") || a.name.localeCompare(b.name)
  )
  const shown = ordered.filter((resource) => matchesQuery(query, [resource.name, envNameOf(resource) ?? null]))
  const toggle = (resourceId: ResourceId, on: boolean) => onChange(on ? [...value, resourceId] : value.filter((existing) => existing !== resourceId))

  return (
    <div id={id} aria-invalid={invalid} className={cn("flex flex-col gap-2 rounded-lg border bg-card p-2", invalid && "border-destructive")}>
      {candidates.length >= searchFrom && <SearchInput label="Search secrets and variables" value={query} onChange={setQuery} />}
      <ul className="flex max-h-64 flex-col overflow-y-auto" aria-labelledby={`${id}-label`}>
        {shown.map((resource) => {
          const checkboxId = `${id}-${resource.id}`
          const deliverable = deliverability(resource.config) === "deliverable"
          return (
            <li key={resource.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
              <Checkbox
                id={checkboxId}
                disabled={!deliverable}
                checked={value.includes(resource.id)}
                onCheckedChange={(on) => toggle(resource.id, on === true)}
              />
              <label htmlFor={checkboxId} className={cn("flex min-w-0 flex-1 flex-col", deliverable ? "cursor-pointer" : "text-muted-foreground")}>
                <span className="truncate text-sm">{resource.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  <code className="font-mono">{envNameOf(resource)}</code>
                  {" · "}
                  {resource.config.kind === "variable" ? "variable" : deliverable ? "secret" : "secret, gateway only"}
                </span>
              </label>
              {!deliverable && (
                <Button type="button" variant="outline" size="xs" onClick={() => setEnabling(resource)}>
                  Make deliverable
                </Button>
              )}
            </li>
          )
        })}
        {shown.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">
            {candidates.length === 0 ? "No secrets or variables in this scope yet." : "Nothing matches."}
          </li>
        )}
      </ul>
      {enabling && (
        <EnableDeliveryDialog
          secret={enabling}
          open
          onOpenChange={(open) => !open && setEnabling(undefined)}
          onEnabled={(secret) => onChange([...value, secret.id])}
        />
      )}
    </div>
  )
}
