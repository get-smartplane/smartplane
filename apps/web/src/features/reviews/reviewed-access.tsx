import type { ReviewedAccess } from "@pc/domain"
import { EntityName } from "@/components/status/entity-name"
import { Initials } from "@/components/status/initials"
import { ActionLevel } from "@/features/access/action-level"
import { SubjectLabel } from "@/features/access/subject-label"
import { formatDate } from "@/lib/format"

/** The access under review, as snapshotted: a membership (who, which role) or a grant (who, what, on which resource). */
export function ReviewedAccessLabel({ access }: { readonly access: ReviewedAccess }) {
  if (access._tag === "Membership") {
    return (
      <span className="flex min-w-0 items-center gap-3">
        <Initials name={access.email} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-medium">{access.email}</span>
          <span className="inline-flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
            Member as <EntityName entity={{ kind: "role", id: access.role }} />
          </span>
        </span>
      </span>
    )
  }
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <SubjectLabel subject={access.subject} />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-8.5 text-xs text-muted-foreground">
        <ActionLevel action={access.action} />
        <span>on</span>
        <EntityName entity={{ kind: "resource", id: access.resourceId }} className="font-medium text-foreground" />
        {access.conditions.tools && <code className="truncate">{access.conditions.tools.join(", ")}</code>}
        {access.expiresAt !== null && <span className="tabular-nums">until {formatDate(access.expiresAt)}</span>}
      </span>
    </span>
  )
}
