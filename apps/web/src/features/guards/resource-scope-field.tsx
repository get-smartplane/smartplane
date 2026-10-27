import type { ResourceId } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { allResourcesAtom } from "@/features/resources/atoms"
import { kindMeta } from "@/features/resources/kinds"

interface ResourceScopeFieldProps {
  readonly value: ReadonlyArray<ResourceId>
  readonly onChange: (value: ReadonlyArray<ResourceId>) => void
}

/** Empty selection means the guard applies to every resource in its scope. */
export function ResourceScopeField({ value, onChange }: ResourceScopeFieldProps) {
  const resources = useQueryData(allResourcesAtom, []).filter((resource) => resource.config.kind !== "secret")
  const toggle = (id: ResourceId, checked: boolean) => onChange(checked ? [...value, id] : value.filter((v) => v !== id))
  return (
    <div className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-lg border p-3">
      {resources.length === 0 && <p className="text-sm text-muted-foreground">No resources yet.</p>}
      {resources.map((resource) => {
        const Icon = kindMeta[resource.config.kind].icon
        const id = `guard-resource-${resource.id}`
        return (
          <div key={resource.id} className="flex items-center gap-2">
            <Checkbox id={id} checked={value.includes(resource.id)} onCheckedChange={(c) => toggle(resource.id, c === true)} />
            <Label htmlFor={id} className="font-normal">
              <Icon className="size-3.5 text-muted-foreground" />
              {resource.name}
            </Label>
          </div>
        )
      })}
    </div>
  )
}
