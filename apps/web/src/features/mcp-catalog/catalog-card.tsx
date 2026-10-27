import type { AddedCatalogServer, McpCatalogItem } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { LogIn, Plug } from "lucide-react"
import { StatusBadge } from "@/components/status/status-badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { startConnectionAtom } from "@/features/connections/atoms"
import { PieceLogo } from "@/features/integrations/piece-logo"
import { useMutation } from "@/lib/api/use-mutation"
import { CatalogConnectDialog } from "./connect-dialog"
import { primaryOf, serverState } from "./server-state"

/** "Linear · Connect": an official server, its one-line pitch, and where this org stands with it. */
export function CatalogCard({ item, canManage }: { readonly item: McpCatalogItem; readonly canManage: boolean }) {
  const { entry, added } = item
  const primary = primaryOf(added)
  const state = primary === undefined ? undefined : serverState(primary)
  return (
    <article className="flex min-h-40 flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <PieceLogo url={entry.logoUrl} name={entry.name} />
        {state && <StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-semibold">{entry.name}</h3>
        <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">{entry.description}</p>
      </div>
      <div className="mt-auto flex items-center gap-2">
        {primary === undefined ? (
          canManage && (
            <CatalogConnectDialog entry={entry} trigger={<Button size="sm" variant="outline"><Plug />Connect</Button>} />
          )
        ) : (
          <AddedActions server={primary} needsSignIn={state?.needsSignIn === true && canManage} />
        )}
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {state === undefined ? (entry.auth === "token" ? "With a token" : "One sign-in") : state.detail}
          {added.length > 1 && ` · ${added.length} added`}
        </span>
      </div>
    </article>
  )
}

/** An added server: open it, or finish (or redo) its shared sign-in right from the card. */
function AddedActions({ server, needsSignIn }: { readonly server: AddedCatalogServer; readonly needsSignIn: boolean }) {
  const start = useMutation(startConnectionAtom)
  const signIn = async () => {
    const started = await start.execute(server.resourceId)
    if (started._tag === "Success") window.location.assign(started.value.authorizeUrl)
  }
  return needsSignIn ? (
    <Button size="sm" disabled={start.pending} onClick={() => void signIn()}>
      {start.pending ? <Spinner /> : <LogIn />}
      Sign in
    </Button>
  ) : (
    <Button size="sm" variant="outline" asChild>
      <Link to="/resources/$resourceId" params={{ resourceId: server.resourceId }}>Open</Link>
    </Button>
  )
}
