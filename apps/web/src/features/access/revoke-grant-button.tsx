import type { Grant } from "@pc/domain"
import { X } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { RowAction } from "@/components/form/row-action"
import { useMutation } from "@/lib/api/use-mutation"
import { revokeGrantAtom } from "./atoms"

export function RevokeGrantButton({ grant, summary }: { readonly grant: Grant; readonly summary: string }) {
  const revoke = useMutation(revokeGrantAtom, { success: "Grant revoked" })
  return (
    <ConfirmDialog
      trigger={
        <RowAction label="Revoke grant" danger>
          <X />
        </RowAction>
      }
      title="Revoke this grant?"
      description={<p>{summary}. Agents acting for this subject lose this access on their next call.</p>}
      confirmLabel="Revoke"
      destructive
      onConfirm={async () => (await revoke.execute(grant.id))._tag === "Success"}
    />
  )
}
