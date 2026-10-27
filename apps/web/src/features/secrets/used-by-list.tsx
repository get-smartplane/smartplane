import type { Resource } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { kindMeta } from "@/features/resources/kinds"

/** The resources that reference a secret, as links; "Not used" says it is safe to remove. */
export function UsedByList({ users }: { readonly users: ReadonlyArray<Resource> }) {
  if (users.length === 0) return <span className="text-muted-foreground">Not used</span>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {users.map((user) => {
        const { label, icon: Icon } = kindMeta[user.config.kind]
        return (
          <li key={user.id}>
            <Link
              to="/resources/$resourceId"
              params={{ resourceId: user.id }}
              className="inline-flex max-w-48 items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon className="size-3 shrink-0 text-muted-foreground" aria-label={label} />
              <span className="truncate">{user.name}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
