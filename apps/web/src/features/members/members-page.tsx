import { Users } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { useCan, useMe } from "@/features/auth/me-context"
import { membersAtom } from "./atoms"
import { InviteMemberDialog } from "./invite-member-dialog"
import { MembersList } from "./members-list"

export function MembersPage() {
  const { org } = useMe()
  const canManage = useCan("members:manage")
  return (
    <Page>
      <PageHeader
        title="Members"
        description={`Everyone who can sign in to ${org.name} and connect agents.`}
        actions={canManage && <InviteMemberDialog />}
      />
      <QueryView atom={membersAtom}>
        {(members) =>
          members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Invite your team"
              description="People you invite can connect their own MCP clients and see only what they are granted."
              action={canManage && <InviteMemberDialog />}
              hint="Using Okta, Entra or Google? Connect directory sync in Organization settings and members arrive on their own."
            />
          ) : (
            <MembersList members={members} />
          )
        }
      </QueryView>
    </Page>
  )
}
