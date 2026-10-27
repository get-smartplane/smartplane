import type { AccountNotConnected, Decision, DenyReason } from "@pc/domain"
import { textResult, type ToolResult } from "./sdk"

/** Argument refusals name the argument, so an agent can correct the call instead of guessing. */
const reasonText = (reason: DenyReason): string => (reason._tag === "ArgumentNotAllowed" ? `${reason._tag} (${reason.path})` : reason._tag)

const byGuard = (reason: DenyReason): boolean => reason._tag === "GuardViolation" || reason._tag === "GuardUnavailable"

/** Says which check refused: the caller's grants, or a guard rule, so neither is mistaken for the other. */
export const refusalText = (decision: Exclude<Decision, { _tag: "Allow" }>): string => {
  if (decision._tag === "PendingApproval") return `This action needs approval (${decision.approvalId}). Ask an approver, then retry the same call; one approval allows one call.`
  const guards = decision.reasons.filter(byGuard)
  const grants = decision.reasons.filter((reason) => !byGuard(reason))
  return [
    grants.length > 0 ? `Denied by your access grants: ${grants.map(reasonText).join(", ")}.` : null,
    guards.length > 0 ? `Denied by a guard rule: ${guards.map(reasonText).join(", ")}.` : null
  ].filter((part) => part !== null).join(" ")
}

/** The typed MCP error for a call without a connected account: a sentence for the agent, the details structured. */
export const notConnectedResult = (error: AccountNotConnected): ToolResult => ({
  ...textResult(
    error.shared
      ? `Not connected: nobody has connected the shared account of ${error.resourceName} yet. An admin can connect it at ${error.connectUrl}, then retry.`
      : `Not connected: ${error.resourceName} uses your own account, and you have not connected it. Connect it at ${error.connectUrl}, then retry.`,
    true
  ),
  structuredContent: { error: { type: "AccountNotConnected", resourceId: error.resourceId, connectUrl: error.connectUrl, shared: error.shared } }
})
