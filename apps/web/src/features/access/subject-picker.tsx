import { SubjectType } from "@pc/domain"
import { Schema } from "effect"
import { useQueryData } from "@/components/query/use-query-data"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { membersAtom } from "@/features/members/atoms"
import { rolesAtom } from "@/features/roles/atoms"
import { teamsAtom } from "@/features/teams/atoms"
import { tokensAtom } from "@/features/tokens/atoms"
import { subjectTypeLabels as typeLabels } from "./subject-label"
const isSubjectType = Schema.is(SubjectType)

const useSubjectOptions = (type: SubjectType): ReadonlyArray<{ readonly value: string; readonly label: string }> => {
  const members = useQueryData(membersAtom, [])
  const teams = useQueryData(teamsAtom, [])
  const roles = useQueryData(rolesAtom, [])
  const tokens = useQueryData(tokensAtom("all"), [])
  switch (type) {
    case "user":
      return members.flatMap((m) => (m.userId !== null && m.status === "active" ? [{ value: m.userId, label: m.email }] : []))
    case "team":
      return teams.map((team) => ({ value: team.id, label: team.name }))
    case "role":
      return roles.map((role) => ({ value: role.slug, label: role.name }))
    case "service_account":
      return tokens.flatMap((t) => (t.kind === "service_account" && t.revokedAt === null ? [{ value: t.id, label: t.name }] : []))
  }
}

interface SubjectPickerProps {
  readonly type: SubjectType
  readonly id: string
  readonly onTypeChange: (type: SubjectType) => void
  readonly onIdChange: (id: string) => void
  readonly invalid: boolean
}

export function SubjectPicker({ type, id, onTypeChange, onIdChange, invalid }: SubjectPickerProps) {
  const options = useSubjectOptions(type)
  return (
    <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
      <Select value={type} onValueChange={(next) => isSubjectType(next) && onTypeChange(next)}>
        <SelectTrigger className="w-full" aria-label="Subject type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SubjectType.literals.map((value) => (
            <SelectItem key={value} value={value}>
              {typeLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={id} onValueChange={onIdChange}>
        <SelectTrigger id="grant-subject" className="w-full" aria-invalid={invalid}>
          <SelectValue placeholder={`Choose a ${typeLabels[type].toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
