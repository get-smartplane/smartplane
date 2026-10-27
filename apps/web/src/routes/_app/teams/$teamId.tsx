import { TeamId } from "@pc/domain"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { TeamDetailPage } from "@/features/teams/team-detail-page"

const decodeTeamId = Schema.decodeUnknownSync(TeamId)

export const Route = createFileRoute("/_app/teams/$teamId")({
  params: {
    parse: (raw) => ({ teamId: decodeTeamId(raw.teamId) }),
    stringify: ({ teamId }) => ({ teamId })
  },
  component: function TeamRoute() {
    return <TeamDetailPage teamId={Route.useParams().teamId} />
  }
})
