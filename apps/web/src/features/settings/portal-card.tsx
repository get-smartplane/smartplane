import { ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { openAdminPortalAtom } from "./atoms"
import type { PortalIntentMeta } from "./portal-intents"

/**
 * The tab is opened synchronously on click (so pop-up blockers allow it) and pointed at the one-time link
 * once it arrives; on failure it is closed again.
 */
export function PortalCard({ meta }: { readonly meta: PortalIntentMeta }) {
  const open = useMutation(openAdminPortalAtom)
  const { icon: Icon } = meta

  const configure = async () => {
    const tab = window.open("about:blank", "_blank")
    if (tab === null) {
      toast.error("Pop-up blocked", { description: "Allow pop-ups for this site, then try again." })
      return
    }
    // The portal must not be able to script this dashboard through `window.opener`.
    tab.opener = null
    const outcome = await open.execute({ intent: meta.intent, tab })
    if (outcome._tag === "Failure") tab.close()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {meta.title}
        </CardTitle>
        <CardDescription>{meta.description}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" disabled={open.pending} onClick={() => void configure()}>
            {open.pending ? <Spinner /> : <ExternalLink />}
            Configure
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}
