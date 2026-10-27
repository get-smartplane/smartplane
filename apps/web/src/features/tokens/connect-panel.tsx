import { KeyRound, LogIn } from "lucide-react"
import { CopyButton } from "@/components/form/copy-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiOrigin } from "@/lib/api/http"
import { CreateTokenDialog } from "./create-token-dialog"
import { oauthSnippets } from "./mcp-config"
import { SnippetTabs } from "./snippet-tabs"

const mcpUrl = `${apiOrigin}/mcp`

/** Two ways in: MCP OAuth (sign in through WorkOS, nothing to copy or rotate) or a `pc_` access token. */
export function ConnectPanel() {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-[1.0625rem] leading-6">Connect a client</h2>
        <p className="text-sm text-muted-foreground">Most clients sign in with your work account: copy the URL, nothing else.</p>
      </div>
      <Tabs defaultValue="oauth" className="min-w-0">
        <TabsList>
          <TabsTrigger value="oauth">
            <LogIn />
            Sign in with OAuth
          </TabsTrigger>
          <TabsTrigger value="token">
            <KeyRound />
            Access token
          </TabsTrigger>
        </TabsList>
        <TabsContent value="oauth" className="flex min-w-0 flex-col gap-4 pt-2">
          <p className="text-sm text-pretty text-muted-foreground">
            The client opens a browser to sign you in. There is no token to store or rotate, and access ends with your
            membership.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-[0.8125rem]">{mcpUrl}</code>
            <CopyButton text={mcpUrl} label="Copy URL" />
          </div>
          <SnippetTabs snippets={oauthSnippets(mcpUrl)} />
        </TabsContent>
        <TabsContent value="token" className="flex flex-col items-start gap-4 pt-2">
          <p className="text-sm text-pretty text-muted-foreground">
            For clients without OAuth sign-in, CI jobs and service accounts. Create an access token; ready-to-paste
            configs are shown once, right after it is created.
          </p>
          <CreateTokenDialog />
        </TabsContent>
      </Tabs>
    </section>
  )
}
