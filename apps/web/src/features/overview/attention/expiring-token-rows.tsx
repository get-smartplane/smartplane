import { DateTime } from "effect"
import { Link } from "@tanstack/react-router"
import { KeyRound } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { tokensAtom } from "@/features/tokens/atoms"
import { isTokenLive } from "@/features/tokens/token-status"
import { formatRelative } from "@/lib/format"
import { AttentionRow, attentionLinkClass } from "./attention-row"

const soon = 7 * 86_400_000

/** The signed-in user's own tokens that stop working within a week. */
export function ExpiringTokenRows() {
  const expiring = useQueryData(tokensAtom("mine"), []).filter(
    (token) => isTokenLive(token) && DateTime.toEpochMillis(token.expiresAt) - Date.now() < soon
  )
  return expiring.map((token) => (
    <li key={token.id}>
      <Link to="/tokens" className={attentionLinkClass}>
        <AttentionRow icon={KeyRound} tone="warning" title={token.name} detail={`Token expires ${formatRelative(token.expiresAt)}`} />
      </Link>
    </li>
  ))
}
