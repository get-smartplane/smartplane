import { type CatalogServerConnected, type McpCatalogEntry, type OAuthReturnTo, PieceId } from "@pc/domain"
import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { useQueryData } from "@/components/query/use-query-data"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { catalogAtom } from "@/features/integrations/atoms"
import { PieceLogo } from "@/features/integrations/piece-logo"
import { CatalogConnectForm } from "./connect-form"

interface CatalogConnectDialogProps {
  readonly entry: McpCatalogEntry
  readonly trigger: ReactNode
  readonly returnTo?: OAuthReturnTo
}

/** Default after connecting: the provider's sign-in, or the new server's page when nothing is left to sign in to. */
export const useAfterConnect = () => {
  const navigate = useNavigate()
  return ({ resource, authorizeUrl }: CatalogServerConnected) => {
    if (authorizeUrl !== null) return window.location.assign(authorizeUrl)
    toast.success(`${resource.name} is added`, { description: "Grant access to let agents use it." })
    void navigate({ to: "/resources/$resourceId", params: { resourceId: resource.id } })
  }
}

/** One screen: what the server is, whose account, Connect. The bundled integration, if any, is the alternative. */
export function CatalogConnectDialog({ entry, trigger, returnTo = "integrations" }: CatalogConnectDialogProps) {
  const [open, setOpen] = useState(false)
  const after = useAfterConnect()
  const piece = useQueryData(catalogAtom, []).find((candidate) => entry.pieceId !== undefined && candidate.id === entry.pieceId)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect {entry.name}</DialogTitle>
          <DialogDescription>Agents reach it through Smartplane and never see its credentials. You get full access right away; others once you grant it.</DialogDescription>
        </DialogHeader>
        <CatalogConnectForm
          entry={entry}
          returnTo={returnTo}
          onConnected={(connected) => {
            setOpen(false)
            after(connected)
          }}
        />
        {piece && (
          <div className="flex flex-col gap-1.5 border-t pt-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Other ways to connect</p>
            <Link
              to="/integrations/$pieceId"
              params={{ pieceId: PieceId.make(piece.id) }}
              className="group flex items-center gap-3 rounded-md px-1 py-1.5 text-sm outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <PieceLogo url={piece.logoUrl} name={piece.displayName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{piece.displayName} integration</span>
                <span className="block text-xs text-muted-foreground">{piece.supportedActionCount} actions, with your own OAuth app or API key</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
