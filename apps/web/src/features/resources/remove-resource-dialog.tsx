import type { Resource } from "@pc/domain"
import type { ReactNode } from "react"
import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { RowAction } from "@/components/form/row-action"
import { useMutation } from "@/lib/api/use-mutation"
import { removeResourceAtom } from "./atoms"

/** `consequence` replaces the default warning, e.g. which resources stop working without a secret. */
export function RemoveResourceDialog({ resource, consequence }: { readonly resource: Resource; readonly consequence?: ReactNode }) {
  const remove = useMutation(removeResourceAtom, { success: `${resource.name} was removed` })
  return (
    <ConfirmDialog
      trigger={
        <RowAction label={`Remove ${resource.name}`} danger>
          <Trash2 />
        </RowAction>
      }
      title={`Remove ${resource.name}?`}
      description={consequence ?? <p>Every grant on this resource is revoked and agents lose access immediately. The audit history is kept.</p>}
      confirmLabel={resource.config.kind === "secret" || resource.config.kind === "variable" ? `Remove ${resource.config.kind}` : "Remove resource"}
      destructive
      onConfirm={async () => (await remove.execute(resource.id))._tag === "Success"}
    />
  )
}
