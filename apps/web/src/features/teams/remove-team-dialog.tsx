import type { Team } from "@pc/domain"
import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { RowAction } from "@/components/form/row-action"
import { useMutation } from "@/lib/api/use-mutation"
import { removeTeamAtom } from "./atoms"

export function RemoveTeamDialog({ team }: { readonly team: Team }) {
  const remove = useMutation(removeTeamAtom, { success: `${team.name} was deleted` })
  return (
    <ConfirmDialog
      trigger={
        <RowAction label={`Delete ${team.name}`} danger>
          <Trash2 />
        </RowAction>
      }
      title={`Delete ${team.name}?`}
      description={
        <p>
          Every grant made to this team is revoked, so its {team.memberCount} members lose any access they had only
          through it.
        </p>
      }
      confirmLabel="Delete team"
      destructive
      onConfirm={async () => (await remove.execute(team.id))._tag === "Success"}
    />
  )
}
