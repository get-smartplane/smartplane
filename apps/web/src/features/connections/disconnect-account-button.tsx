import { Unplug } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { Button } from "@/components/ui/button"
import { useMutation } from "@/lib/api/use-mutation"
import { disconnectAtom } from "./atoms"
import type { ResourceRef } from "./connect-button"

/** Deletes the shared account's connection, or (per-user) the caller's own. Grants and audit history stay. */
export function DisconnectAccountButton({ resource, own }: { readonly resource: ResourceRef; readonly own: boolean }) {
  const disconnect = useMutation(disconnectAtom, { success: own ? `Your ${resource.name} account was disconnected` : `${resource.name} was disconnected` })
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" className="text-danger-ink hover:bg-destructive/10 hover:text-danger-ink">
          <Unplug />
          Disconnect
        </Button>
      }
      title={own ? `Disconnect your ${resource.name} account?` : `Disconnect the shared ${resource.name} account?`}
      description={
        own
          ? <p>Your stored credential is deleted. Your calls through {resource.name} fail with "connect your account" until you connect again.</p>
          : <p>The stored credential is deleted. Everyone's calls through {resource.name} fail until an admin connects an account again. The provider keeps the app authorized; revoke it there if needed.</p>
      }
      confirmLabel="Disconnect"
      destructive
      onConfirm={async () => (await disconnect.execute(resource.id))._tag === "Success"}
    />
  )
}
