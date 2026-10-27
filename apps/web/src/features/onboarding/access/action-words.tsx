import { type Action, actionImplies, type IntegrationAction, type Resource, type ResourceKind } from "@pc/domain"
import { Check, X } from "lucide-react"
import { actionMeta } from "@/features/access/action-meta"
import { useToolSource } from "@/features/access/tool-source"

const shown = 5

/** What a level means for kinds without a list of named actions. */
const kindWords = (kind: ResourceKind, level: Action): ReadonlyArray<readonly [boolean, string]> => {
  if (kind === "database") return [[actionImplies(level, "use"), "Run read-only queries"], [actionImplies(level, "write"), "Run queries that change data, when the database is writable"]]
  if (kind === "mcp_server") return [[actionImplies(level, "use"), "Call the server's read-only tools"], [actionImplies(level, "write"), "Call tools that create, change or delete"]]
  return [[true, actionMeta[level].description]]
}

function Line({ allowed, children }: { readonly allowed: boolean; readonly children: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {allowed ? <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-label="Allowed" /> : <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not at this level" />}
      <span className={allowed ? "" : "text-muted-foreground"}>{children}</span>
    </li>
  )
}

function Group({ title, actions, allowed }: { readonly title: string; readonly actions: ReadonlyArray<IntegrationAction>; readonly allowed: boolean }) {
  if (actions.length === 0) return null
  const rest = actions.length - shown
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1">
        {actions.slice(0, shown).map((action) => <Line key={action.name} allowed={allowed}>{action.displayName}</Line>)}
        {rest > 0 && <li className="pl-6 text-xs text-muted-foreground">and {rest} more</li>}
      </ul>
    </div>
  )
}

/** The chosen level in the tool's own words: which of its actions agents get, and which stay off. */
export function ActionWords({ resource, level }: { readonly resource: Resource; readonly level: Action }) {
  const source = useToolSource(resource.id)
  if (source?.kind === "integration") {
    const allowed = source.actions.filter((action) => actionImplies(level, action.requiredAction))
    const withheld = source.actions.filter((action) => !actionImplies(level, action.requiredAction))
    return (
      <div className="grid gap-4 rounded-lg bg-muted/55 p-4 sm:grid-cols-2">
        <Group title="Agents can" actions={allowed} allowed />
        <Group title="Not at this level" actions={withheld} allowed={false} />
        {allowed.length === 0 && <p className="text-sm text-muted-foreground">At this level agents can see the tool but run none of its actions.</p>}
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/55 p-4">
      {kindWords(resource.config.kind, level).map(([allowed, words]) => <Line key={words} allowed={allowed}>{words}</Line>)}
    </ul>
  )
}
