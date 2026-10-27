import { AddTeamMember, type TeamId, type TeamMember } from "@pc/domain"
import { UserPlus } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { membersAtom } from "@/features/members/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { addTeamMemberAtom } from "./atoms"

const messages = { userId: "Choose a member." }

interface AddTeamMemberDialogProps {
  readonly teamId: TeamId
  readonly current: ReadonlyArray<TeamMember>
}

export function AddTeamMemberDialog({ teamId, current }: AddTeamMemberDialogProps) {
  const [userId, setUserId] = useState("")
  const add = useMutation(addTeamMemberAtom, { success: "Member added" })
  const form = useForm(AddTeamMember, { ...add, execute: (payload) => add.execute({ id: teamId, ...payload }) }, messages)
  // Only active org members can join a team.
  const candidates = useQueryData(membersAtom, []).filter(
    (member) => member.status === "active" && member.userId !== null && !current.some((m) => m.userId === member.userId)
  )

  return (
    <FormDialog
      trigger={
        <Button>
          <UserPlus />
          Add member
        </Button>
      }
      title="Add to team"
      description="Active members only. They get this team's access right away."
      submitLabel="Add to team"
      form={form}
      input={() => ({ userId })}
      onOpenChange={(open) => open || setUserId("")}
    >
      <FormField id="team-member" label="Member" error={form.errors.userId}>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger id="team-member" aria-invalid={form.errors.userId !== undefined}>
            <SelectValue placeholder="Choose a member" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((member) =>
              member.userId === null ? null : (
                <SelectItem key={member.id} value={member.userId}>
                  {member.name ? `${member.name} · ${member.email}` : member.email}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </FormField>
    </FormDialog>
  )
}
