import type { DenyReason } from "@pc/domain"

/** Why a call was refused, in a sentence (same wording as the dashboard). */
export const describeDenyReason = (reason: DenyReason): string => {
  switch (reason._tag) {
    case "UnknownTool":
      return `No tool named "${reason.tool}" is available to the caller.`
    case "UnknownSkill":
      return `No skill named "${reason.name}" is available to the caller.`
    case "NoGrant":
      return "No grant covers this resource."
    case "ActionNotGranted":
      return `The grant does not allow "${reason.required}".`
    case "ToolNotAllowed":
      return `The tool "${reason.tool}" is not on the grant's allow-list.`
    case "ArgumentNotAllowed":
      return `The grant only allows "${reason.tool}" for certain values of "${reason.path}".`
    case "GuardViolation":
      return `A rule flagged this action (${Math.round(reason.probability * 100)}% likely violation).`
    case "GuardUnavailable":
      return "A rule could not be evaluated, so the action was denied."
    case "NotConnected":
      return "The account this resource acts as is not connected; connect it in the dashboard."
  }
}
