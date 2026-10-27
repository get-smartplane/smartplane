import type { Member } from "@pc/domain"
import { RoleSelect } from "@/features/roles/role-select"
import { useMutation } from "@/lib/api/use-mutation"
import { changeMemberRoleAtom } from "./atoms"

/** Editable only for manual, non-deprovisioned members; directory-managed roles come from SCIM. */
export function MemberRoleCell({ member, editable }: { readonly member: Member; readonly editable: boolean }) {
  const change = useMutation(changeMemberRoleAtom, { success: "Role updated" })
  if (!editable) return <span className="pl-2.5 capitalize">{member.role.replaceAll("-", " ")}</span>
  return (
    <RoleSelect
      className="h-8 w-40 border-transparent bg-transparent shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted"
      value={member.role}
      disabled={change.pending}
      onChange={(role) => role !== member.role && void change.execute({ id: member.id, role })}
    />
  )
}
