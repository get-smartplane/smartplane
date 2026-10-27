import { deliverability, envNameOf, type Resource, type ResourceId } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { allResourcesAtom } from "@/features/resources/atoms"
import { cn } from "@/lib/utils"

const none: ReadonlyArray<Resource> = []

interface Entry {
  readonly id: ResourceId
  readonly label: string
  /** Why the service no longer receives it, when it does not. */
  readonly inactive?: string
}

const entryOf = (byId: ReadonlyMap<ResourceId, Resource>, id: ResourceId): Entry => {
  const resource = byId.get(id)
  if (resource === undefined) return { id, label: id, inactive: "removed" }
  const label = envNameOf(resource) ?? resource.name
  return deliverability(resource.config) === "deliverable" ? { id, label } : { id, label, inactive: "gateway only" }
}

/**
 * What a machine token may receive, by the env names the service sees. Entries that were made gateway-only
 * or removed since are excluded at delivery time, so they show struck through with the reason.
 */
export function AllowList({ ids, visible = 4 }: { readonly ids: ReadonlyArray<ResourceId>; readonly visible?: number }) {
  const byId = new Map(useQueryData(allResourcesAtom, none).map((resource) => [resource.id, resource]))
  const entries = ids.map((id) => entryOf(byId, id))
  const rest = entries.length - visible
  return (
    <ul className="flex flex-wrap items-center gap-1" title={entries.map((entry) => entry.label).join(", ")}>
      {entries.slice(0, visible).map((entry) => (
        <li
          key={entry.id}
          className={cn(
            "max-w-full truncate rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground",
            entry.inactive && "text-muted-foreground line-through"
          )}
          title={entry.inactive ? `${entry.label}: ${entry.inactive}, not delivered` : entry.label}
        >
          {entry.label}
        </li>
      ))}
      {rest > 0 && <li className="text-xs text-muted-foreground">+{rest} more</li>}
    </ul>
  )
}
