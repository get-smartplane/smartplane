import type { Resource } from "@pc/domain"
import { LogIn } from "lucide-react"
import { PaperPlane } from "@/components/sky/paper-plane"
import { StatusBadge } from "@/components/status/status-badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { connectionStatus } from "@/features/integrations/detail/connection-status"
import { startOAuthAtom } from "@/features/integrations/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import "../sky/sky.css"
import { ToolBadge } from "./tool-badge"

/** The chosen tool boarding the plane, whether agents can reach it yet, and a sign-in when an OAuth tool is still waiting for one. */
export function ConnectedTool({ resource, onChange }: { readonly resource: Resource; readonly onChange: () => void }) {
  const start = useMutation(startOAuthAtom)
  const config = resource.config
  const status = config.kind === "integration" ? connectionStatus(config.connection, config.accountMode) : { label: "Added", tone: "success" as const, hint: null }
  const waiting = config.kind === "integration" && config.connection.type === "oauth2" && config.accountMode !== "per_user" && config.connection.status !== "connected"
  const signIn = async () => {
    const started = await start.execute({ id: resource.id, returnTo: "setup" })
    if (started._tag === "Success") window.location.assign(started.value.authorizeUrl)
  }
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PaperPlane className="w-12 shrink-0 -rotate-6" strokeWidth={4} />
          <div className="onb-board min-w-0">
            <ToolBadge resource={resource} />
          </div>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      {status.hint && <p className="text-sm text-muted-foreground">{status.hint}</p>}
      <div className="flex flex-wrap gap-2">
        {waiting && (
          <Button variant="outline" disabled={start.pending} onClick={() => void signIn()}>
            {start.pending ? <Spinner /> : <LogIn />}
            Sign in to {resource.name}
          </Button>
        )}
        <Button variant="ghost" onClick={onChange}>
          Connect a different tool
        </Button>
      </div>
    </div>
  )
}
