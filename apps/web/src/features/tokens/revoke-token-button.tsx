import type { AccessToken } from "@pc/domain"
import { Ban } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { RowAction } from "@/components/form/row-action"
import { useMutation } from "@/lib/api/use-mutation"
import { revokeTokenAtom } from "./atoms"

export function RevokeTokenButton({ token }: { readonly token: AccessToken }) {
  const revoke = useMutation(revokeTokenAtom, { success: "Token revoked" })
  return (
    <ConfirmDialog
      trigger={
        <RowAction label={`Revoke ${token.name}`} danger>
          <Ban />
        </RowAction>
      }
      title={`Revoke ${token.name}?`}
      description={
        <p>
          MCP clients using <code className="font-mono">{token.prefix}…</code> are disconnected on their next request.
          {token.kind === "service_account" && " Grants made to this service account stop applying."}
        </p>
      }
      confirmLabel="Revoke token"
      destructive
      onConfirm={async () => (await revoke.execute(token.id))._tag === "Success"}
    />
  )
}
