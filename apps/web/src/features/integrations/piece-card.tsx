import type { IntegrationPieceSummary } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { StatusBadge } from "@/components/status/status-badge"
import { authTypeLabel } from "./auth-methods"
import { PieceLogo } from "./piece-logo"

interface PieceCardProps {
  readonly piece: IntegrationPieceSummary
  /** How many integrations of this piece the org already has. */
  readonly connected: number
}

/** One catalog entry: what it is and how it connects; the whole card opens the piece. */
export function PieceCard({ piece, connected }: PieceCardProps) {
  return (
    <Link
      to="/integrations/$pieceId"
      params={{ pieceId: piece.id }}
      className="group flex min-h-36 flex-col gap-3 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-foreground/20 hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <PieceLogo url={piece.logoUrl} name={piece.displayName} />
        {connected > 0 && <StatusBadge tone="success">{connected === 1 ? "Added" : `${connected} added`}</StatusBadge>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold group-hover:underline">{piece.displayName}</span>
        <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">{piece.description || `Use ${piece.displayName} from your agents.`}</p>
      </div>
      <p className="mt-auto text-xs text-muted-foreground tabular-nums">
        {piece.supportedActionCount} actions · {piece.authTypes.map((type) => authTypeLabel[type]).join(" or ")}
      </p>
    </Link>
  )
}
