import type { AuditTarget } from "@pc/domain"
import { EntityName } from "@/components/status/entity-name"

const kindLabels: { readonly [K in AuditTarget["type"]]: string } = {
  org: "Org",
  user: "User",
  member: "Member",
  role: "Role",
  team: "Team",
  project: "Project",
  resource: "Resource",
  grant: "Grant",
  guard: "Rule",
  approval: "Approval",
  token: "Token",
  audit_event: "Event",
  access_review: "Review",
  access_review_item: "Review item",
  integration_piece: "Integration",
  connection: "Connection",
  mcp_catalog_entry: "MCP server"
}

/** What an event touched: its kind, then its current name (or id when it cannot be resolved). */
export function TargetLabel({ target }: { readonly target: AuditTarget | null }) {
  if (target === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      {/* Machine tokens share the token kind; their `mtk_` ids tell them apart. */}
      <span className="shrink-0 text-xs text-muted-foreground">{target.type === "token" && target.id.startsWith("mtk_") ? "Machine token" : kindLabels[target.type]}</span>
      <EntityName entity={{ kind: target.type, id: target.id }} />
    </span>
  )
}
