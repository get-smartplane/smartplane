import type { RoleSlug } from "@pc/domain"
import type { ReactNode } from "react"
import { ExpandableNames } from "@/components/form/expandable-names"
import { useQueryData } from "@/components/query/use-query-data"
import { actionMeta } from "@/features/access/action-meta"
import { grantSummary } from "@/features/access/grant-summary"
import { useToolSource } from "@/features/access/tool-source"
import { allResourcesAtom } from "@/features/resources/atoms"
import { rolesAtom } from "@/features/roles/atoms"
import { teamsAtom } from "@/features/teams/atoms"
import { useInheritedGrants } from "./inherited-access"
import type { GrantItem, InviteSetup } from "./invite-setup"

function Row({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function DirectGrant({ item }: { readonly item: GrantItem }) {
  const source = useToolSource(item.draft.resourceId)
  const name = useQueryData(allResourcesAtom, []).find((resource) => resource.id === item.draft.resourceId)?.name ?? item.draft.resourceId
  return (
    <li className="flex flex-col">
      <span>
        <span className="font-semibold">{name}</span>, {actionMeta[item.draft.action].label}
      </span>
      <span className="text-xs text-muted-foreground">{grantSummary(item.draft, source)}</span>
    </li>
  )
}

interface ReviewStepProps {
  /** Absent when changing an existing invitation, whose people are fixed. */
  readonly emails?: ReadonlyArray<string>
  readonly role: RoleSlug | undefined
  readonly setup: InviteSetup
}

/** Everything the invitation carries, in one place, before anything is sent. */
export function ReviewStep({ emails, role, setup }: ReviewStepProps) {
  const teams = useQueryData(teamsAtom, []).filter((team) => setup.teamIds.includes(team.id))
  const roleName = useQueryData(rolesAtom, []).find((candidate) => candidate.slug === role)?.name ?? role
  const resources = useQueryData(allResourcesAtom, [])
  const inherited = useInheritedGrants(setup.teamIds, role)
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col divide-y rounded-lg border bg-card px-3">
        {emails && (
          <Row term={emails.length === 1 ? "Person" : `${emails.length} people`}>
            <ExpandableNames names={emails} visible={4} />
          </Row>
        )}
        <Row term="Role">{roleName}</Row>
        <Row term="Teams">{teams.length === 0 ? <span className="text-muted-foreground">None</span> : teams.map((team) => team.name).join(", ")}</Row>
        <Row term="Direct access">
          {setup.grants.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {setup.grants.map((item) => <DirectGrant key={item.key} item={item} />)}
            </ul>
          )}
        </Row>
        <Row term="Through teams and role">
          {inherited.length === 0 ? (
            <span className="text-muted-foreground">Nothing</span>
          ) : (
            <ExpandableNames
              names={inherited.map((grant) => `${resources.find((resource) => resource.id === grant.resourceId)?.name ?? grant.resourceId}, ${actionMeta[grant.action].label}`)}
            />
          )}
        </Row>
      </dl>
      <p className="text-sm text-muted-foreground">
        Nothing applies until they accept; until then they have no access. You can change this setup from the member list while the
        invitation is pending.
      </p>
    </div>
  )
}
