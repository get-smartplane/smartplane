import type { AuditEventType } from "@pc/domain"
import type { Tone } from "@/components/status/tone"

export type DecisionKind = "allowed" | "held" | "blocked"

interface DecisionMeta {
  readonly label: string
  /** The audit event the gateway writes for this outcome. */
  readonly event: AuditEventType
  readonly tone: Tone
  /** Fill for chart marks; validated as a set for colour-vision separation in both themes. */
  readonly fill: string
}

/** Stacked bottom to top in this order, so the common case sits on the baseline. */
export const decisionKinds: ReadonlyArray<DecisionKind> = ["allowed", "held", "blocked"]

export const decisionMeta: { readonly [K in DecisionKind]: DecisionMeta } = {
  allowed: { label: "Allowed", event: "mcp.tool_called", tone: "success", fill: "bg-chart-allowed" },
  held: { label: "Held", event: "policy.pending_approval", tone: "warning", fill: "bg-chart-held" },
  blocked: { label: "Blocked", event: "policy.denied", tone: "danger", fill: "bg-chart-blocked" }
}
