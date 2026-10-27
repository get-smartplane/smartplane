import { McpTransport } from "@pc/domain"
import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ConfigFieldsProps } from "../config-draft"
import { ResourceSelect } from "../resource-select"

const transportLabels = { streamable_http: "Streamable HTTP", sse: "Server-sent events" } as const

export function McpServerFields({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <FormField id="mcp-url" label="Server URL" error={errors["config.url"]}>
      <Input
        id="mcp-url"
        placeholder="https://mcp.example.com/mcp"
        value={draft.url}
        aria-invalid={errors["config.url"] !== undefined}
        onChange={(event) => set("url", event.target.value)}
      />
    </FormField>
  )
}

export function McpServerAdvanced({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <>
      <FormField id="mcp-transport" label="Transport" error={errors["config.transport"]}>
        <Select value={draft.transport} onValueChange={(value) => set("transport", value)}>
          <SelectTrigger id="mcp-transport" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {McpTransport.literals.map((transport) => (
              <SelectItem key={transport} value={transport}>
                {transportLabels[transport]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField
        id="mcp-auth"
        label="Authentication secret"
        error={(errors["config.auth.secretId"] ?? errors["config.auth"])}
        description="Sent to the upstream server by the gateway; agents never see it."
      >
        <ResourceSelect
          id="mcp-auth"
          kind="secret"
          noneLabel="No authentication"
          value={draft.authSecretId}
          onChange={(id) => set("authSecretId", id)}
        />
      </FormField>
    </>
  )
}
