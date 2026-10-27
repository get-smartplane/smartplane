import type { RoleSlug } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { rolesAtom } from "./atoms"

interface RoleSelectProps {
  readonly id?: string
  readonly value: RoleSlug | undefined
  readonly onChange: (role: RoleSlug) => void
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly className?: string
}

export function RoleSelect({ id, value, onChange, disabled, invalid, className }: RoleSelectProps) {
  const roles = useQueryData(rolesAtom, [])
  const select = (slug: string) => {
    const role = roles.find((candidate) => candidate.slug === slug)
    if (role) onChange(role.slug)
  }
  return (
    <Select value={value ?? ""} onValueChange={select} disabled={disabled}>
      <SelectTrigger id={id} className={className} aria-invalid={invalid}>
        <SelectValue placeholder="Choose a role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.slug} value={role.slug}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
