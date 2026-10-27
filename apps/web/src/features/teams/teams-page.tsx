import { UsersRound } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { useCan } from "@/features/auth/me-context"
import { teamsAtom } from "./atoms"
import { CreateTeamDialog } from "./create-team-dialog"
import { TeamsTable } from "./teams-table"

export function TeamsPage() {
  const canManage = useCan("teams:manage")
  return (
    <Page>
      <PageHeader
        title="Teams"
        description="Group people so access follows the team, not each person."
        actions={canManage && <CreateTeamDialog />}
      />
      <QueryView atom={teamsAtom}>
        {(teams) =>
          teams.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="Group people into teams"
              description="Grant a team access once; everyone who joins it gets the same access, and loses it when they leave."
              action={canManage && <CreateTeamDialog />}
              hint="Teams from your identity provider appear here automatically once directory sync is on."
            />
          ) : (
            <TeamsTable teams={teams} />
          )
        }
      </QueryView>
    </Page>
  )
}
