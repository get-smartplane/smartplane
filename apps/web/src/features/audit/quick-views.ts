import type { AuditEventType } from "@pc/domain"

/** The slices people open the log for most, one click each. */
export const quickViews: ReadonlyArray<{ readonly label: string; readonly type: AuditEventType | undefined }> = [
  { label: "Everything", type: undefined },
  { label: "Agent calls", type: "mcp.tool_called" },
  { label: "Blocked", type: "policy.denied" },
  { label: "Held", type: "policy.pending_approval" },
  { label: "Access granted", type: "grant.created" },
  { label: "Secret deliveries", type: "secret.delivered" },
  { label: "Sign-ins", type: "auth.login" }
]
