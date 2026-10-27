import type { TeamId } from "@pc/domain"
import { Info, Users } from "lucide-react"
import { BackLink } from "@/components/layout/back-link"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCan } from "@/features/auth/me-context"
import { NotFoundPage } from "@/features/shell/not-found-page"
import { AddTeamMemberDialog } from "./add-team-member-dialog"
import { teamMembersAtom, teamsAtom } from "./atoms"
import { TeamMembersTable } from "./team-members-table"

export function TeamDetailPage({ teamId }: { readonly teamId: TeamId }) {
  const canManage = useCan("teams:manage")
  return (
    <Page>
      <QueryView atom={teamsAtom}>
        {(teams) => {
          const team = teams.find((candidate) => candidate.id === teamId)
          if (team === undefined) return <NotFoundPage />
          const synced = team.directoryGroupId !== null
          return (
            <QueryView atom={teamMembersAtom(team.id)}>
              {(members) => (
                <div className="flex flex-col gap-6">
                  <PageHeader
                    back={<BackLink to="/teams">Teams</BackLink>}
                    title={team.name}
                    description={`${members.length} ${members.length === 1 ? "member" : "members"} · access granted to this team reaches all of them.`}
                    actions={canManage && !synced && <AddTeamMemberDialog teamId={team.id} current={members} />}
                  />
                  {synced && (
                    <Alert>
                      <Info />
                      <AlertDescription>
                        Membership is synced from your identity provider. Change it there; edits here are disabled.
                      </AlertDescription>
                    </Alert>
                  )}
                  {members.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="Nobody in this team yet"
                      description="Add members to share this team's access with them."
                      action={canManage && !synced && <AddTeamMemberDialog teamId={team.id} current={members} />}
                    />
                  ) : (
                    <TeamMembersTable team={team} members={members} editable={canManage && !synced} />
                  )}
                </div>
              )}
            </QueryView>
          )
        }}
      </QueryView>
    </Page>
  )
}
