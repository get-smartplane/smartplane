import { CreateResource, type Resource } from "@pc/domain"
import { Server } from "lucide-react"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { createResourceAtom } from "@/features/resources/atoms"
import { McpPresetPicker } from "@/features/resources/mcp-preset-picker"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"

const messages = { name: "Enter a name between 1 and 80 characters.", "config.url": "Enter the server's http(s) URL." }

/** Name and URL of a hosted MCP server; a token, if it needs one, is added later from the server's page. */
export function McpServerForm({ onCreated }: { readonly onCreated: (resource: Resource) => Promise<void> }) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const form = useForm(CreateResource, useMutation(createResourceAtom), messages)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const created = await form.submit({ name, description: "", projectId: null, config: { kind: "mcp_server", url, transport: "streamable_http" } })
    if (created) await onCreated(created)
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <McpPresetPicker
        onPick={(preset) => {
          setName(preset.name)
          setUrl(preset.url)
        }}
      />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <FormField id="setup-mcp-name" label="Name" error={form.errors.name}>
          <Input id="setup-mcp-name" placeholder="Sentry" value={name} aria-invalid={form.errors.name !== undefined} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField id="setup-mcp-url" label="Server URL" error={form.errors["config.url"]}>
          <Input id="setup-mcp-url" placeholder="https://mcp.example.com/mcp" value={url} aria-invalid={form.errors["config.url"] !== undefined} onChange={(event) => setUrl(event.target.value)} />
        </FormField>
      </div>
      <Button type="submit" className="w-fit" disabled={form.pending}>
        {form.pending ? <Spinner /> : <Server />}
        Add server
      </Button>
    </form>
  )
}
