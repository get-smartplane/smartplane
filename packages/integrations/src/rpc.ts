import { ActionName, InvalidInput, OrgId, PieceId, ResourceId, TraceContext } from "@pc/domain"
import { Schema } from "effect"

/**
 * The contract between apps/api and the integrations Worker (a service binding, never public). apps/api
 * resolves credentials from envelope-encrypted secrets; the Worker only ever sees them for one run, as
 * `Redacted` values, and never stores or logs them.
 */
const Secret = Schema.Redacted(Schema.String)

export const RunAuth = Schema.Union([
  Schema.Struct({ type: Schema.tag("none") }),
  Schema.Struct({ type: Schema.tag("secret_text"), secret: Secret }),
  Schema.Struct({ type: Schema.tag("basic"), username: Schema.String, password: Secret }),
  Schema.Struct({ type: Schema.tag("custom"), props: Schema.Redacted(Schema.JsonObject) }),
  Schema.Struct({
    type: Schema.tag("oauth2"),
    accessToken: Secret,
    tokenType: Schema.String,
    scope: Schema.String,
    /** Provider-specific token response fields some pieces read (e.g. Slack's `authed_user`). */
    data: Schema.Redacted(Schema.JsonObject),
    /** The connection's non-secret OAuth2 fields, e.g. `{ subdomain }`. */
    props: Schema.Record(Schema.String, Schema.String)
  })
]).annotate({ identifier: "RunAuth" })
export type RunAuth = typeof RunAuth.Type

export const RunRequest = Schema.Struct({
  orgId: OrgId,
  resourceId: ResourceId,
  pieceId: PieceId,
  actionName: ActionName,
  auth: RunAuth,
  /** The agent's arguments; the Worker validates them against the action's catalog schema again. */
  props: Schema.JsonObject,
  trace: Schema.optionalKey(TraceContext)
}).annotate({ identifier: "RunRequest" })
export type RunRequest = typeof RunRequest.Type

export const RunOutput = Schema.Struct({
  /** The action's result as JSON; cut to a preview when `truncated`. */
  output: Schema.Json,
  truncated: Schema.Boolean,
  ms: Schema.Number
}).annotate({ identifier: "RunOutput" })
export type RunOutput = typeof RunOutput.Type

export class UnknownAction extends Schema.TaggedError<UnknownAction>()("UnknownAction", { pieceId: Schema.String, actionName: Schema.String }) {
  override get message() {
    return `${this.pieceId} has no action ${this.actionName}`
  }
}

export class UnsupportedAction extends Schema.TaggedError<UnsupportedAction>()("UnsupportedAction", {
  pieceId: Schema.String,
  actionName: Schema.String,
  reason: Schema.String
}) {
  override get message() {
    return `${this.pieceId}/${this.actionName} cannot run in Smartplane: ${this.reason}`
  }
}

/** The provider rejected the connection's credential (401). A 403 is an `UpstreamError`: the credential works but lacks access. */
export class AuthFailed extends Schema.TaggedError<AuthFailed>()("AuthFailed", { message: Schema.String }) {}

/** The action failed: the provider answered with an error, or the piece threw. Credentials are scrubbed. */
export class UpstreamError extends Schema.TaggedError<UpstreamError>()("UpstreamError", {
  message: Schema.String,
  status: Schema.NullOr(Schema.Int)
}) {}

export class Timeout extends Schema.TaggedError<Timeout>()("Timeout", { ms: Schema.Int }) {
  override get message() {
    return `the action did not finish within ${this.ms / 1000} seconds`
  }
}

export const RunError = Schema.Union([UnknownAction, UnsupportedAction, InvalidInput, AuthFailed, UpstreamError, Timeout]).annotate({
  identifier: "RunError"
})
export type RunError = typeof RunError.Type

export const RunResponse = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), result: RunOutput }),
  Schema.Struct({ ok: Schema.Literal(false), error: RunError })
]).annotate({ identifier: "RunResponse" })
export type RunResponse = typeof RunResponse.Type

/** RPC payloads travel as their JSON encoding: Redacted secrets become plain strings only on the wire. */
export const RunRequestJson = Schema.toCodecJson(RunRequest)
export const RunResponseJson = Schema.toCodecJson(RunResponse)

/** The integrations Worker's RPC surface, as apps/api sees its service binding. */
export interface IntegrationsRpc {
  readonly run: (request: unknown) => Promise<unknown>
}

/** Ceiling for one action run; the Worker enforces it, apps/api waits a little longer. */
export const RunTimeoutMs = 25_000
/** Larger outputs are replaced by a truncated preview. */
export const MaxOutputBytes = 256_000
