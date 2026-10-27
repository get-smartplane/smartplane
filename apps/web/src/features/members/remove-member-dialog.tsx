import type { Member } from "@pc/domain"
import { UserMinus } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { RowAction } from "@/components/form/row-action"
import { useMutation } from "@/lib/api/use-mutation"
import { removeMemberAtom } from "./atoms"

const revoked = [
  "Their membership is deactivated and active sessions stop working.",
  "Every access token they created is revoked, so connected MCP clients lose access immediately.",
  "Grants made directly to them are revoked.",
  "They are removed from all teams."
] as const

// A pending invitation has nothing applied yet; offboarding it cancels the invitation and its setup.
const cancelled = [
  "Accepting the invitation no longer gives them access.",
  "The teams and grants set up for them are dropped before they ever apply."
] as const

/** `blocked` says why this member cannot be offboarded here; undefined means they can. */
export function RemoveMemberDialog({ member, blocked }: { readonly member: Member; readonly blocked: string | undefined }) {
  const invited = member.status === "invited"
  const remove = useMutation(removeMemberAtom, { success: invited ? `Invitation for ${member.email} cancelled` : `${member.email} was offboarded` })
  return (
    <ConfirmDialog
      trigger={
        <RowAction label={invited ? `Cancel invitation for ${member.email}` : `Offboard ${member.email}`} danger disabled={blocked !== undefined} disabledReason={blocked}>
          <UserMinus />
        </RowAction>
      }
      title={invited ? `Cancel the invitation for ${member.email}?` : `Offboard ${member.name ?? member.email}?`}
      description={
        <>
          <p>This runs the same offboarding path as directory sync:</p>
          <ul className="ml-4 list-disc space-y-1">
            {(invited ? cancelled : revoked).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>The {invited ? "invitation" : "member"} record and its audit history are kept for compliance.</p>
        </>
      }
      confirmLabel={invited ? "Cancel invitation" : "Offboard member"}
      destructive
      onConfirm={async () => (await remove.execute(member.id))._tag === "Success"}
    />
  )
}
