import type { UserId } from "@pc/domain"
import { EntityName } from "@/components/status/entity-name"

const shown = 3

/** The people who hold this access (directly, through a team or role, or as a token's creator). */
export function Beneficiaries({ userIds }: { readonly userIds: ReadonlyArray<UserId> }) {
  if (userIds.length === 0) return <span className="text-xs text-muted-foreground">Nobody yet</span>
  const rest = userIds.length - shown
  return (
    <ul className="flex min-w-0 flex-col gap-0.5 text-sm">
      {userIds.slice(0, shown).map((id) => (
        <li key={id} className="min-w-0">
          <EntityName entity={{ kind: "user", id }} />
        </li>
      ))}
      {rest > 0 && <li className="text-xs text-muted-foreground">and {rest} more</li>}
    </ul>
  )
}
