import { Schema } from "effect"
import { ResourceId } from "../ids"
import { PositiveInt, Timestamp } from "../primitives"

/** Plaintext secret input. Redacted so it never reaches logs, spans or error messages. */
export const SecretValue = Schema.Redacted(Schema.String.check(Schema.isBetweenLength(1, 65_536)))

/** Create-time config for a secret: the only place a secret value enters the system besides rotation. */
export const CreateSecretConfig = Schema.Struct({
  kind: Schema.tag("secret"),
  value: SecretValue
}).annotate({ identifier: "CreateSecretConfig" })

export const RotateSecret = Schema.Struct({
  value: SecretValue
}).annotate({ identifier: "RotateSecret" })
export type RotateSecret = typeof RotateSecret.Type

export class SecretRotated extends Schema.Opaque<SecretRotated>()(
  Schema.Struct({
    resourceId: ResourceId,
    version: PositiveInt
  }).annotate({ identifier: "SecretRotated" })
) {}

/**
 * A secret's current version, never its value. `version` 1 means it was never rotated; Smartplane-managed
 * OAuth token secrets gain versions as their tokens refresh.
 */
export class SecretStatus extends Schema.Opaque<SecretStatus>()(
  Schema.Struct({
    resourceId: ResourceId,
    version: PositiveInt,
    versionCreatedAt: Timestamp
  }).annotate({ identifier: "SecretStatus" })
) {}
