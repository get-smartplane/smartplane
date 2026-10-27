import { PieceId } from "@pc/domain"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { PieceDetailPage } from "@/features/integrations/piece-detail-page"

const decodePieceId = Schema.decodeUnknownSync(PieceId)

export const Route = createFileRoute("/_app/integrations/$pieceId")({
  params: {
    parse: (raw) => ({ pieceId: decodePieceId(raw.pieceId) }),
    stringify: ({ pieceId }) => ({ pieceId })
  },
  component: function PieceRoute() {
    return <PieceDetailPage pieceId={Route.useParams().pieceId} />
  }
})
