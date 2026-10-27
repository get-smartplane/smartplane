import type { Resource } from "@pc/domain"
import { Unplug } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { Button } from "@/components/ui/button"
import { useMutation } from "@/lib/api/use-mutation"
import { disconnectOAuthAtom } from "../atoms"

/** Forgets the stored sign-in; the integration, its OAuth app and its grants stay, ready to reconnect. */
export function DisconnectButton({ resource }: { readonly resource: Resource }) {
  const disconnect = useMutation(disconnectOAuthAtom, { success: `${resource.name} was disconnected` })
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" className="text-danger-ink hover:bg-destructive/10 hover:text-danger-ink">
          <Unplug />
          Disconnect
        </Button>
      }
      title={`Disconnect ${resource.name}?`}
      description={
        <>
          <p>The stored sign-in is deleted. Agents lose every {resource.name} tool on their next call, until someone connects again.</p>
          <p>Grants, the OAuth app and the audit history stay as they are.</p>
        </>
      }
      confirmLabel="Disconnect"
      destructive
      onConfirm={async () => (await disconnect.execute(resource.id))._tag === "Success"}
    />
  )
}
