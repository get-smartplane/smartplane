import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { QueryView } from "@/components/query/query-view"
import { useCan } from "@/features/auth/me-context"
import { rolesAtom } from "./atoms"
import { CreateRoleDialog } from "./create-role-dialog"
import { RoleCard } from "./role-card"

/** Role definitions can escalate privileges, so editing them requires `org:manage`. */
export function RolesPage() {
  const canManage = useCan("org:manage")
  return (
    <Page>
      <PageHeader
        title="Roles"
        description="What each person may do in this dashboard. Access to tools and data is set on Grants."
        actions={canManage && <CreateRoleDialog />}
      />
      <QueryView atom={rolesAtom}>
        {(roles) => (
          <div className="flex flex-col gap-8">
            <Section title="Custom roles" description="Pick exactly the permissions a job needs.">
              {roles.some((role) => !role.builtin) ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {roles.filter((role) => !role.builtin).map((role) => (
                    <RoleCard key={role.slug} role={role} editable={canManage} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">
                  None yet. A security reviewer who reads the audit log and decides approvals is a common first one.
                </p>
              )}
            </Section>
            <Section title="Built-in roles" description="Fixed, so every org starts from the same ground.">
              <div className="grid gap-3 md:grid-cols-2">
                {roles.filter((role) => role.builtin).map((role) => (
                  <RoleCard key={role.slug} role={role} editable={false} />
                ))}
              </div>
            </Section>
          </div>
        )}
      </QueryView>
    </Page>
  )
}
