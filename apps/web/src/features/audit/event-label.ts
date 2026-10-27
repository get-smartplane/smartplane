import type { AuditEventType, ChainedAuditEvent } from "@pc/domain"
import { isDeliveryDecision } from "./delivery-detail"
import type { Tone } from "@/components/status/tone"

// "Guard" is the API's word; people read it as a rule.
const acronyms: ReadonlyMap<string, string> = new Map([["mcp", "MCP"], ["auth", "Auth"], ["guard", "Rule"]])

/** The gateway's decisions read as outcomes, in the words the overview uses; skill events name what changed. */
const outcomes: ReadonlyMap<string, string> = new Map([
  ["mcp.tool_call_started", "Call started"],
  ["mcp.tool_called", "Call allowed"],
  ["mcp.prompt_read", "Skill loaded"],
  ["mcp.resource_read", "Skill read"],
  ["policy.denied", "Call blocked"],
  ["policy.pending_approval", "Call held for approval"],
  ["policy.flagged", "Call flagged"],
  ["approval.consumed", "Approval used"],
  ["skill.version_created", "Skill version added"],
  ["skill.scanned", "Skill scanned"],
  ["skill.scan_overridden", "Skill scan overridden"],
  ["skill.rescan_requested", "Skill re-scan requested"],
  ["skill.activated", "Skill version activated"],
  ["skill.policy_updated", "Skill scan policy updated"],
  ["skill.downloaded", "Skill downloaded"],
  ["connection.connected", "Account connected"],
  ["connection.disconnected", "Account disconnected"],
  ["connection.refreshed_failed", "Account sign-in expired"],
  ["secret.delivered", "Secret delivered"],
  ["secret.delivery_changed", "Secret delivery changed"],
  ["machine_token.created", "Machine token created"],
  ["machine_token.renewed", "Machine token renewed"],
  ["machine_token.revoked", "Machine token revoked"]
])

/** "member.role_changed" → "Member role changed"; "policy.denied" → "Call blocked". */
export const eventLabel = (type: AuditEventType): string => {
  const outcome = outcomes.get(type)
  if (outcome !== undefined) return outcome
  const [first = "", ...rest] = type.replace(".", " ").replaceAll("_", " ").split(" ")
  const head = acronyms.get(first) ?? first.charAt(0).toUpperCase() + first.slice(1)
  return [head, ...rest].join(" ")
}

/** One event's label: a guard's decision on a secret delivery reads as a delivery, not as a tool call. */
export const eventTitle = (event: ChainedAuditEvent): string => {
  if (isDeliveryDecision(event)) return event.type === "policy.denied" ? "Delivery blocked" : "Delivery flagged"
  return eventLabel(event.type)
}

const danger: ReadonlySet<string> = new Set(["policy.denied", "auth.login_failed", "member.deprovisioned", "approval.rejected", "connection.refreshed_failed"])
const warning: ReadonlySet<string> = new Set(["policy.flagged", "policy.pending_approval", "approval.requested", "approval.expired", "skill.scan_overridden"])
const success: ReadonlySet<string> = new Set(["approval.granted", "approval.consumed", "mcp.tool_called", "mcp.prompt_read", "mcp.resource_read", "secret.delivered"])

/** Denials stand out, holds ask for attention, allowed calls read as allowed; the rest is routine. */
export const eventTone = (type: AuditEventType): Tone =>
  danger.has(type)
    ? "danger"
    : warning.has(type)
      ? "warning"
      : success.has(type)
        ? "success"
        : type.startsWith("guard.") || type === "mcp.tool_call_started"
          ? "info"
          : "neutral"
