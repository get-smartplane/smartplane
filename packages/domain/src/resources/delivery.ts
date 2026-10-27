import { Schema } from "effect"
import { ProjectId, ResourceId } from "../ids"
import { Timestamp } from "../primitives"
import type { ResourceConfig } from "./config"
import { EnvName, envNameFromName, SecretDelivery } from "./delivery-mode"

/**
 * The one decision on whether a resource's value may leave Smartplane. Variables always may; a secret only
 * when an admin marked it `deliverable`; nothing else is a value at all. A future `proxy_only` mode is
 * decided here and nowhere else.
 */
export const deliverability = (config: ResourceConfig): SecretDelivery => {
  if (config.kind === "variable") return "deliverable"
  if (config.kind === "secret") return config.delivery ?? "gateway_only"
  return "gateway_only"
}

/** The env name a secret or variable is delivered under: its `envName`, else its name upper-snake-cased. */
export const envNameOf = (resource: { readonly name: string; readonly config: ResourceConfig }): EnvName | undefined => {
  const explicit = resource.config.kind === "secret" || resource.config.kind === "variable" ? resource.config.envName : undefined
  return explicit ?? envNameFromName(resource.name)
}

/** `run`: `smartplane run -- <cmd>` on a laptop. `boot`: a deployed service fetching its env at start. */
export const DeliveryPurpose = Schema.Literals(["run", "boot"]).annotate({ identifier: "DeliveryPurpose" })
export type DeliveryPurpose = typeof DeliveryPurpose.Type

export const DeliverSecretsRequest = Schema.Struct({
  purpose: DeliveryPurpose,
  /** Env names to deliver; absent means everything the caller may receive. */
  names: Schema.optionalKey(Schema.Array(EnvName).check(Schema.isMaxLength(200))),
  /** Narrows to org-wide resources plus this project's; a project resource wins over an org-wide one of the same name. */
  projectId: Schema.optionalKey(ProjectId)
}).annotate({ identifier: "DeliverSecretsRequest" })
export type DeliverSecretsRequest = typeof DeliverSecretsRequest.Type

export const DeliveredKind = Schema.Literals(["secret", "variable"])
export type DeliveredKind = typeof DeliveredKind.Type

/** `value` is Redacted in process so it never reaches logs or spans; on the wire it is the plain string. */
export const DeliveredValue = Schema.Struct({
  name: Schema.String,
  value: Schema.Redacted(Schema.String),
  kind: DeliveredKind,
  /** A secret's version number, or a variable's last change time. */
  version: Schema.String,
  resourceId: ResourceId
}).annotate({ identifier: "DeliveredValue" })
export type DeliveredValue = typeof DeliveredValue.Type

/** `policy`: an active guard refused this delivery (or could not be evaluated: guards fail closed). */
export const DeliveryDenialReason = Schema.Literals(["not_deliverable", "no_grant", "unknown", "policy"])
export type DeliveryDenialReason = typeof DeliveryDenialReason.Type

export const DeliveryDenial = Schema.Struct({ name: Schema.String, reason: DeliveryDenialReason }).annotate({ identifier: "DeliveryDenial" })
export type DeliveryDenial = typeof DeliveryDenial.Type

/** `denied` names only what the caller asked for in `names`; `expiresAt` is the machine token's expiry, else null. */
export class DeliveredSecrets extends Schema.Opaque<DeliveredSecrets>()(
  Schema.Struct({
    env: Schema.Array(DeliveredValue),
    denied: Schema.Array(DeliveryDenial),
    expiresAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "DeliveredSecrets" })
) {}

/** Changes how a secret (or a variable's name) is delivered. `envName: null` returns to the derived name. */
export const UpdateDelivery = Schema.Struct({
  delivery: Schema.optionalKey(SecretDelivery),
  envName: Schema.optionalKey(Schema.NullOr(EnvName))
}).annotate({ identifier: "UpdateDelivery" })
export type UpdateDelivery = typeof UpdateDelivery.Type
