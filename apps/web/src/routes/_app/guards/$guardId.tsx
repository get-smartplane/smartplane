import { GuardId } from "@pc/domain"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { GuardDetailPage } from "@/features/guards/guard-detail-page"

const decodeGuardId = Schema.decodeUnknownSync(GuardId)

export const Route = createFileRoute("/_app/guards/$guardId")({
  params: {
    parse: (raw) => ({ guardId: decodeGuardId(raw.guardId) }),
    stringify: ({ guardId }) => ({ guardId })
  },
  component: function GuardRoute() {
    return <GuardDetailPage guardId={Route.useParams().guardId} />
  }
})
