import type { Conflict, Forbidden, InvalidInput, ModelTimedOut, NotFound, PolicyDenied, Unauthorized, UnauthorizedReason, UpstreamFailure } from "@pc/domain"
import type { PlatformError, Schema, Terminal } from "effect"
import type { CliError } from "effect/cli"
import type { HttpClientError } from "effect/http"
import type { ChildExit } from "./child-exit"
import { authFailure, CliFailure, failure, usageFailure } from "./failure"
import { describeDenyReason } from "./deny-reason"

/** Everything a command can fail with; the entry point turns each into a message and an exit code. */
export type AppError =
  | CliFailure
  | ChildExit
  | Unauthorized
  | Forbidden
  | NotFound
  | Conflict
  | InvalidInput
  | PolicyDenied
  | UpstreamFailure
  | ModelTimedOut
  | HttpClientError.HttpClientError
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Terminal.QuitError
  | CliError.CliError

const unauthorized: Record<UnauthorizedReason, string> = {
  missing_credentials: "No access token was sent.",
  invalid_credentials: "The access token is invalid or has been revoked.",
  expired: "The access token has expired.",
  no_organization: "This account does not belong to an organization yet.",
  deprovisioned: "This membership has been deprovisioned."
}

const transport = (error: HttpClientError.HttpClientError): CliFailure => {
  const status = error.response?.status
  if (status !== undefined) return failure(`Unexpected HTTP ${status} from ${error.request.url}.`)
  return failure(`Could not reach ${error.request.url}.`, "Check your network, or --api-url / SMARTPLANE_API_URL.")
}

export const toFailure = (error: AppError): CliFailure => {
  switch (error._tag) {
    case "CliFailure":
      return error
    case "ChildExit":
      return failure(error.detail ?? `The command exited with status ${error.code}.`)
    case "Unauthorized":
      return authFailure(unauthorized[error.reason])
    case "Forbidden":
      return failure(error.permission ? `Not allowed: this needs the "${error.permission}" permission.` : `Not allowed: ${error.message}`)
    case "NotFound":
      return failure(`No ${error.entity.replace(/_/g, " ")} with id ${error.id}.`)
    case "Conflict":
      return failure(error.message)
    case "InvalidInput":
      return failure(error.field ? `Invalid ${error.field}: ${error.message}` : error.message)
    case "PolicyDenied":
      return failure(`Denied by policy. ${error.reasons.map((reason) => describeDenyReason(reason)).join(" ")}`)
    case "UpstreamFailure":
      return failure(`${error.upstream} is unavailable: ${error.message}`)
    case "ModelTimedOut":
      return failure(`The ${error.purpose} model took longer than ${Math.round(error.timeoutMs / 1000)} s.`, "Try again in a moment.")
    case "HttpClientError":
      return transport(error)
    case "SchemaError":
      // Raised both for request payloads the contract rejects and for responses this CLI version cannot read.
      return failure(`Invalid data: ${error.message}`, "Check the flag values; if they look right, update the CLI.")
    case "PlatformError":
      return failure(error.message)
    case "QuitError":
      return failure("Cancelled.")
    default:
      // effect/cli parse errors have already been printed with the command's help.
      return usageFailure(error.message)
  }
}
