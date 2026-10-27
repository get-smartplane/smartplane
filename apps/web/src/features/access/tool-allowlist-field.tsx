import type { ResourceId } from "@pc/domain"
import { X } from "lucide-react"
import { useState, type KeyboardEvent } from "react"
import { useQueryData } from "@/components/query/use-query-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { resourceToolsAtom } from "@/features/mcp-catalog/atoms"
import { resourcesAtom } from "@/features/resources/atoms"
import { McpToolsPicker } from "./mcp-tools-picker"

interface ToolAllowlistFieldProps {
  readonly serverId: ResourceId
  readonly tools: ReadonlyArray<string>
  readonly onChange: (tools: ReadonlyArray<string>) => void
}

/**
 * Narrows an MCP server grant to named tools: picked from the server's live list when it can be read (its
 * account is connected), typed in otherwise, with registered tool resources as suggestions.
 */
export function ToolAllowlistField({ serverId, tools, onChange }: ToolAllowlistFieldProps) {
  const live = useQueryData(resourceToolsAtom(serverId), null)
  if (live?.status === "available" && live.tools.length > 0) return <McpToolsPicker tools={live.tools} value={tools} onChange={onChange} />
  return <TypedToolNames serverId={serverId} tools={tools} onChange={onChange} />
}

function TypedToolNames({ serverId, tools, onChange }: ToolAllowlistFieldProps) {
  const [draft, setDraft] = useState("")
  const known = useQueryData(resourcesAtom({ kind: "tool" }), []).flatMap((resource) =>
    resource.config.kind === "tool" && resource.config.serverId === serverId ? [resource.config.toolName] : []
  )
  const add = (tool: string) => {
    const name = tool.trim()
    if (name !== "" && !tools.includes(name)) onChange([...tools, name])
    setDraft("")
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== ",") return
    event.preventDefault()
    add(draft)
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id="grant-tools"
        className="font-mono"
        placeholder="Type a tool name and press Enter"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
      />
      <div className="flex flex-wrap gap-1.5">
        {tools.map((tool) => (
          <Badge key={tool} variant="secondary" className="font-mono">
            {tool}
            <button type="button" aria-label={`Remove ${tool}`} onClick={() => onChange(tools.filter((t) => t !== tool))}>
              <X />
            </button>
          </Badge>
        ))}
        {known
          .filter((tool) => !tools.includes(tool))
          .map((tool) => (
            <Button key={tool} type="button" variant="outline" size="xs" className="font-mono" onClick={() => add(tool)}>
              + {tool}
            </Button>
          ))}
      </div>
    </div>
  )
}
