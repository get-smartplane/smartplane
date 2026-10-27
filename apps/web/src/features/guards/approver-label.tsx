import type { Guard, GuardApprover } from "@pc/domain"
import { EntityName } from "@/components/status/entity-name"
import { useMe } from "@/features/auth/me-context"

/** "You (rule author)", a role, a team or a person, by current name. */
export function ApproverLabel({ approver, guard }: { readonly approver: GuardApprover; readonly guard: Pick<Guard, "createdBy"> }) {
  const { principal } = useMe()
  switch (approver._tag) {
    case "Author":
      return principal._tag === "User" && principal.userId === guard.createdBy ? (
        <span>You (rule author)</span>
      ) : (
        <span className="inline-flex items-baseline gap-1">
          <EntityName entity={{ kind: "user", id: guard.createdBy }} />
          <span className="text-muted-foreground">(rule author)</span>
        </span>
      )
    case "Role":
      return <span>Anyone with the {approver.role} role</span>
    case "Team":
      return <EntityName entity={{ kind: "team", id: approver.teamId }} />
    case "User":
      return <EntityName entity={{ kind: "user", id: approver.userId }} />
  }
}
