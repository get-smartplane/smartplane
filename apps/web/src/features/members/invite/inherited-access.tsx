import type { Grant, RoleSlug, TeamId } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { ActionLevel } from "@/features/access/action-level"
import { grantsAtom } from "@/features/access/atoms"
import { allResourcesAtom } from "@/features/resources/atoms"
import { rolesAtom } from "@/features/roles/atoms"
import { teamsAtom } from "@/features/teams/atoms"
import { formatDate } from "@/lib/format"

/** Grants a person gets without being named: through the teams they join and the role they hold. */
export const useInheritedGrants = (teamIds: ReadonlyArray<TeamId>, role: RoleSlug | undefined): ReadonlyArray<Grant> =>
  useQueryData(grantsAtom, []).filter(
    (grant) => (grant.subject.type === "team" && teamIds.includes(grant.subject.id)) || (grant.subject.type === "role" && grant.subject.role === role)
  )

interface InheritedAccessProps {
  readonly teamIds: ReadonlyArray<TeamId>
  readonly role: RoleSlug | undefined
}

/** Read-only, so whoever sets up direct grants sees what is already covered. */
export function InheritedAccess({ teamIds, role }: InheritedAccessProps) {
  const inherited = useInheritedGrants(teamIds, role)
  const resources = useQueryData(allResourcesAtom, [])
  const teams = useQueryData(teamsAtom, [])
  const roles = useQueryData(rolesAtom, [])
  const via = (grant: Grant) =>
    grant.subject.type === "team"
      ? (teams.find((team) => grant.subject.type === "team" && team.id === grant.subject.id)?.name ?? "a team")
      : `${roles.find((candidate) => candidate.slug === role)?.name ?? role} role`

  if (inherited.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing yet: their role and teams carry no grants.</p>
  }
  return (
    <ul className="flex flex-col rounded-lg bg-muted/55 px-3 py-1.5">
      {inherited.map((grant) => (
        <li key={grant.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{resources.find((resource) => resource.id === grant.resourceId)?.name ?? grant.resourceId}</span>
          <ActionLevel action={grant.action} />
          <span className="w-40 truncate text-xs text-muted-foreground max-sm:w-full">
            through {via(grant)}
            {grant.expiresAt && `, until ${formatDate(grant.expiresAt)}`}
          </span>
        </li>
      ))}
    </ul>
  )
}
