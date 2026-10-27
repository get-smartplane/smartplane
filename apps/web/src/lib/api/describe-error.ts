import type { DenyReason } from "@pc/domain"
import { describeDenyReason } from "./deny-reason"
import type { ApiError } from "./errors"

export interface ErrorDescription {
  readonly title: string
  readonly description: string
}

/** Which check refused: the caller's grants, a rule, or a missing account connection. */
export const denialTitle = (reasons: ReadonlyArray<DenyReason>): string =>
  reasons.some((reason) => reason._tag === "NotConnected")
    ? "Account not connected"
    : reasons.some((reason) => reason._tag === "GuardViolation" || reason._tag === "GuardUnavailable")
    ? "Blocked by a rule"
    : "Not covered by your grants"

/** Turns any typed API failure into copy for alerts and toasts. */
export const describeError = (error: ApiError): ErrorDescription => {
  switch (error._tag) {
    case "Unauthorized":
      return { title: "Signed out", description: "Your session has ended. Sign in again to continue." }
    case "Forbidden":
      return {
        title: "Not allowed",
        description: error.permission ? `This needs the "${error.permission}" permission.` : error.message
      }
    case "NotFound":
      return { title: "Not found", description: `That ${error.entity.replace("_", " ")} no longer exists.` }
    case "Conflict":
      return { title: "Conflict", description: error.message }
    case "InvalidInput":
      return { title: "Invalid input", description: error.message }
    case "PolicyDenied":
      return { title: denialTitle(error.reasons), description: error.reasons.map((reason) => describeDenyReason(reason)).join(" ") }
    case "UpstreamFailure":
      return { title: `${error.upstream} is unavailable`, description: error.message }
    case "ModelTimedOut":
      return { title: "Took too long", description: "The model did not answer in time. Try again in a moment." }
    case "AuthorizationServerChanged":
      return {
        title: "Sign-in server changed",
        description: `${error.message}. Your OAuth client is only used with the server it was set up for; if the change is expected, set the OAuth client up again in the resource's settings.`
      }
    case "TransportFailure":
      return { title: "Connection problem", description: error.message }
  }
}
