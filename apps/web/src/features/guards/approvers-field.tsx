import { type Guard, type GuardApprover, uniqueApprovers } from "@pc/domain"
import { Plus, X } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { membersAtom } from "@/features/members/atoms"
import { rolesAtom } from "@/features/roles/atoms"
import { teamsAtom } from "@/features/teams/atoms"
import { ApproverLabel } from "./approver-label"

interface ApproversFieldProps {
  readonly guard: Pick<Guard, "createdBy">
  readonly value: ReadonlyArray<GuardApprover>
  readonly onChange: (value: ReadonlyArray<GuardApprover>) => void
}

/** Who releases held calls: the rule's author, a role, a team or a person. Empty means any admin. */
export function ApproversField({ guard, value, onChange }: ApproversFieldProps) {
  const roles = useQueryData(rolesAtom, [])
  const teams = useQueryData(teamsAtom, [])
  const members = useQueryData(membersAtom, []).filter((member) => member.status === "active")
  const add = (approver: GuardApprover) => onChange(uniqueApprovers([...value, approver]))

  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">Anyone who can decide approvals, except the requester.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((approver, index) => (
            <li key={JSON.stringify(approver)} className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 text-sm">
              <ApproverLabel approver={approver} guard={guard} />
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove approver" onClick={() => onChange(value.filter((_, i) => i !== index))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-fit">
            <Plus />
            Add approver
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
          <DropdownMenuItem onSelect={() => add({ _tag: "Author" })}>The rule's author</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Roles</DropdownMenuLabel>
            {roles.map((role) => (
              <DropdownMenuItem key={role.slug} onSelect={() => add({ _tag: "Role", role: role.slug })}>{role.name}</DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {teams.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Teams</DropdownMenuLabel>
              {teams.map((team) => (
                <DropdownMenuItem key={team.id} onSelect={() => add({ _tag: "Team", teamId: team.id })}>{team.name}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          <DropdownMenuGroup>
            <DropdownMenuLabel>People</DropdownMenuLabel>
            {members.flatMap((member) =>
              member.userId === null ? [] : [
                <DropdownMenuItem key={member.id} onSelect={() => member.userId !== null && add({ _tag: "User", userId: member.userId })}>
                  {member.name ?? member.email}
                </DropdownMenuItem>
              ]
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
