import { MaxTokenTtlDays, type MachineToken } from "@pc/domain"
import { DateTime } from "effect"
import { RefreshCw } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { RowAction } from "@/components/form/row-action"
import { formatDate } from "@/lib/format"
import { useMutation } from "@/lib/api/use-mutation"
import { renewMachineTokenAtom } from "./atoms"

/** Renewal moves the expiry only; the plaintext stays the same, so nothing on the platform changes. */
export function RenewMachineTokenButton({ token }: { readonly token: MachineToken }) {
  const renew = useMutation(renewMachineTokenAtom, { success: `${token.name} renewed` })
  const until = formatDate(DateTime.add(DateTime.nowUnsafe(), { days: MaxTokenTtlDays }))
  return (
    <ConfirmDialog
      trigger={
        <RowAction label={`Renew ${token.name}`}>
          <RefreshCw />
        </RowAction>
      }
      title={`Renew ${token.name}?`}
      description={
        <p>
          It will expire on <span className="font-medium text-foreground">{until}</span>, {MaxTokenTtlDays} days from today. The token itself
          does not change, so the service needs no redeploy.
        </p>
      }
      confirmLabel={`Renew for ${MaxTokenTtlDays} days`}
      onConfirm={async () => (await renew.execute(token.id))._tag === "Success"}
    />
  )
}
