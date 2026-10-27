import type { Resource } from "@pc/domain"
import { Section } from "@/components/layout/section"
import { QueryView } from "@/components/query/query-view"
import { grantsAtom } from "@/features/access/atoms"
import { GrantsTable } from "@/features/access/grants-table"

/** Who can reach this resource today; granting more happens from the header. */
export function ResourceGrants({ resource }: { readonly resource: Resource }) {
  return (
    <Section title="Who can reach it">
      <QueryView atom={grantsAtom}>
        {(grants) => {
          const mine = grants.filter((grant) => grant.resourceId === resource.id)
          return mine.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
              Nobody yet. Access is closed until you grant a team, a role or a person access to {resource.name}.
            </p>
          ) : (
            <GrantsTable grants={mine} />
          )
        }}
      </QueryView>
    </Section>
  )
}
