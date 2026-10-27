import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import type { ConfigFieldsProps } from "../config-draft"
import { ResourceSelect } from "../resource-select"

export function ToolFields({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <>
      <FormField id="tool-server" label="MCP server" error={errors["config.serverId"] && "Choose the server that provides this tool."}>
        <ResourceSelect
          id="tool-server"
          kind="mcp_server"
          value={draft.serverId}
          invalid={errors["config.serverId"] !== undefined}
          onChange={(id) => set("serverId", id)}
        />
      </FormField>
      <FormField id="tool-name" label="Tool name" error={errors["config.toolName"]} description="Exactly as the server lists it.">
        <Input
          id="tool-name"
          className="font-mono"
          placeholder="search_documents"
          value={draft.toolName}
          aria-invalid={errors["config.toolName"] !== undefined}
          onChange={(event) => set("toolName", event.target.value)}
        />
      </FormField>
    </>
  )
}
