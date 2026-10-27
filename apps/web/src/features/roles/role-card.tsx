import type { Role } from "@pc/domain"
import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { RowAction } from "@/components/form/row-action"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMutation } from "@/lib/api/use-mutation"
import { removeRoleAtom } from "./atoms"
import { EditRoleDialog } from "./edit-role-dialog"
import { permissionLabels } from "./permission-labels"

export function RoleCard({ role, editable }: { readonly role: Role; readonly editable: boolean }) {
  const remove = useMutation(removeRoleAtom, { success: "Role deleted" })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {role.name}
          <span className="font-mono text-xs font-normal text-muted-foreground">{role.slug}</span>
        </CardTitle>
        <CardDescription>{role.description || `${role.permissions.length} ${role.permissions.length === 1 ? "permission" : "permissions"}`}</CardDescription>
        {editable && !role.builtin && (
          <CardAction className="flex gap-1">
            <EditRoleDialog role={role} />
            <ConfirmDialog
              trigger={
                <RowAction label={`Delete ${role.name}`} danger>
                  <Trash2 />
                </RowAction>
              }
              title={`Delete ${role.name}?`}
              description={<p>Roles still assigned to members cannot be deleted. Reassign them first.</p>}
              confirmLabel="Delete role"
              destructive
              onConfirm={async () => (await remove.execute(role.slug))._tag === "Success"}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1.5">
        {role.permissions.length === 0 ? (
          <span className="text-sm text-muted-foreground">No dashboard permissions</span>
        ) : (
          role.permissions.map((permission) => (
            <Badge key={permission} variant="secondary">
              {permissionLabels[permission].label}
            </Badge>
          ))
        )}
      </CardContent>
    </Card>
  )
}
