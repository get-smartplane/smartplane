import type { AccessReviewScope } from "@pc/domain"
import { EntityName } from "@/components/status/entity-name"

export function ScopeLabel({ scope }: { readonly scope: AccessReviewScope }) {
  return scope.type === "org" ? (
    <span>Whole organization</span>
  ) : (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <span className="shrink-0">Project</span>
      <span aria-hidden="true">·</span>
      <EntityName entity={{ kind: "project", id: scope.projectId }} />
    </span>
  )
}
