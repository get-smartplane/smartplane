import type { MachineTokenId } from "@pc/domain"
import { Ban } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { RowAction } from "@/components/form/row-action"
import { useMutation } from "@/lib/api/use-mutation"
import { revokeMachineTokenAtom } from "./atoms"

interface RevokeMachineTokenButtonProps {
  readonly id: MachineTokenId
  readonly name: string
}

/** Used by the token list and by access reviews, where a `reviews:manage` reviewer may revoke. */
export function RevokeMachineTokenButton({ id, name }: RevokeMachineTokenButtonProps) {
  const revoke = useMutation(revokeMachineTokenAtom, { success: `${name} revoked` })
  return (
    <ConfirmDialog
      trigger={
        <RowAction label={`Revoke ${name}`} danger>
          <Ban />
        </RowAction>
      }
      title={`Revoke ${name}?`}
      description={
        <p>
          The service can no longer fetch its secrets, so its next boot fails. Processes already running keep the values they loaded; restart
          them, and rotate the secrets if the token may have leaked.
        </p>
      }
      confirmLabel="Revoke token"
      destructive
      onConfirm={async () => (await revoke.execute(id))._tag === "Success"}
    />
  )
}
