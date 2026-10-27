import { KeyRound } from "lucide-react"
import { CopyButton } from "@/components/form/copy-button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreateTokenDialog } from "@/features/tokens/create-token-dialog"
import { apiOrigin } from "@/lib/api/http"
import { agentClients } from "./agent-clients"

const mcpUrl = `${apiOrigin}/mcp`

/** The one endpoint, a tab per client with its copyable config, and a token for clients without OAuth. */
export function AgentConnect() {
  const clients = agentClients(mcpUrl)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 rounded-lg border bg-card p-1.5 pl-3">
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">MCP endpoint</span>
        <code className="min-w-0 flex-1 truncate text-[0.8125rem]">{mcpUrl}</code>
        <CopyButton text={mcpUrl} label="Copy URL" />
      </div>
      <Tabs defaultValue={clients[0]?.id} className="min-w-0">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
          {clients.map((client) => (
            <TabsTrigger key={client.id} value={client.id} className="flex-none">
              {client.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {clients.map((client) => (
          <TabsContent key={client.id} value={client.id} className="flex min-w-0 flex-col gap-2 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{client.hint}</span>
              <span className="flex shrink-0 items-center gap-2">
                {client.badge && <Badge variant="outline">{client.badge}</Badge>}
                <CopyButton text={client.code} />
              </span>
            </div>
            <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3.5 text-xs leading-relaxed">{client.code}</pre>
          </TabsContent>
        ))}
      </Tabs>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/55 p-3.5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="size-4 shrink-0" aria-hidden="true" />
          No browser on that machine, or a CI job? Use an access token instead.
        </p>
        <CreateTokenDialog variant="outline" />
      </div>
    </div>
  )
}
