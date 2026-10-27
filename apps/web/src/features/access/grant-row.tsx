import { type Grant, isCreatorGrant } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { useMe } from "@/features/auth/me-context"
import { allResourcesAtom } from "@/features/resources/atoms"
import { EntityName } from "@/components/status/entity-name"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDate, isPast } from "@/lib/format"
import { subjectRef } from "@/lib/lookup/refs"
import { useEntityLabel } from "@/lib/lookup/use-entity-label"
import { ActionLevel } from "./action-level"
import { GrantConditionsSummary } from "./grant-conditions"
import { RevokeGrantButton } from "./revoke-grant-button"
import { SubjectLabel } from "./subject-label"

export function GrantRow({ grant }: { readonly grant: Grant }) {
  const resource = { kind: "resource", id: grant.resourceId } as const
  const subjectName = useEntityLabel(subjectRef(grant.subject)).label
  const resourceName = useEntityLabel(resource).label
  const { principal } = useMe()
  const self = principal._tag === "User" && grant.subject.type === "user" && grant.subject.id === principal.userId
  // An ordinary grant; this only explains why it exists. Revoking it works like any other.
  const byCreation = isCreatorGrant(grant, useQueryData(allResourcesAtom, []).find((candidate) => candidate.id === grant.resourceId))
  const note = byCreation ? (self ? "Because you created it" : "Created this resource") : undefined
  return (
    <TableRow>
      <TableCell>
        <SubjectLabel subject={grant.subject} self={self} note={note} />
      </TableCell>
      <TableCell className="font-medium">
        <EntityName entity={resource} />
      </TableCell>
      <TableCell>
        <ActionLevel action={grant.action} />
      </TableCell>
      <TableCell className="hidden max-w-72 md:table-cell">
        <GrantConditionsSummary conditions={grant.conditions} />
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {grant.expiresAt === null ? (
          <span className="text-muted-foreground">Never</span>
        ) : (
          <span className={isPast(grant.expiresAt) ? "text-danger-ink" : "tabular-nums"}>{formatDate(grant.expiresAt)}</span>
        )}
      </TableCell>
      <TableCell>
        <RevokeGrantButton grant={grant} summary={`${subjectName} can ${grant.action} ${resourceName}`} />
      </TableCell>
    </TableRow>
  )
}
