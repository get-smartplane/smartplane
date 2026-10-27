import type { Resource, ResourceTools } from "@pc/domain"
import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { Panel } from "@/components/layout/panel"
import { Skeleton } from "@/components/ui/skeleton"
import { resourceToolsAtom } from "./atoms"
import { ToolAccessBadge } from "./tool-access-badge"

const summary = (tools: ResourceTools["tools"]) => {
  const writes = tools.filter((tool) => tool.access === "write" || tool.access === "destructive").length
  return `${tools.length} tools${writes > 0 ? ` · ${writes} change data` : ""}`
}

/**
 * What an MCP server offers, read live from it (cached for five minutes). Shown to admins and to members with
 * a grant; for anyone else the API refuses and the panel stays out of the way.
 */
export function ResourceToolsPanel({ resource }: { readonly resource: Resource }) {
  const result = useAtomValue(resourceToolsAtom(resource.id))
  if (AsyncResult.isFailure(result)) return null
  if (!AsyncResult.isSuccess(result)) {
    return (
      <Panel title="Tools">
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Panel>
    )
  }
  const { status, tools, message } = result.value
  return (
    <Panel title="Tools" action={status === "available" && <span className="text-xs text-muted-foreground tabular-nums">{summary(tools)}</span>}>
      {status === "not_connected" && <p className="p-4 text-sm text-muted-foreground">Connect the account above to see what {resource.name} can do.</p>}
      {status === "unavailable" && (
        <p className="p-4 text-sm text-muted-foreground">
          Could not list the tools right now{message ? `: ${message}` : ""}. Agents see the same until it answers again.
        </p>
      )}
      {status === "available" && tools.length === 0 && <p className="p-4 text-sm text-muted-foreground">{resource.name} offers no tools to you.</p>}
      {status === "available" && tools.length > 0 && (
        <ul className="flex max-h-96 flex-col divide-y overflow-y-auto">
          {tools.map((tool) => (
            <li key={tool.name} className="flex items-start gap-3 px-4 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <code className="truncate font-mono text-[0.8125rem] font-medium">{tool.name}</code>
                {(tool.description ?? tool.title) && <p className="line-clamp-2 text-xs text-pretty text-muted-foreground">{tool.description ?? tool.title}</p>}
              </div>
              <ToolAccessBadge access={tool.access} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
