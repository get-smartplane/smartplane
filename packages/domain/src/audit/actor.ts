import { Schema } from "effect"
import { AccessTokenId, UserId } from "../ids"

export const ActorType = Schema.Literals(["user", "service_account", "system"])
export type ActorType = typeof ActorType.Type

/** Who did something. System actors name the subsystem, e.g. `scim`, `cron`, `queue`. */
export const Actor = Schema.Union([
  Schema.Struct({ type: Schema.tag("user"), id: UserId }),
  Schema.Struct({ type: Schema.tag("service_account"), id: AccessTokenId }),
  Schema.Struct({ type: Schema.tag("system"), id: Schema.NonEmptyString })
]).annotate({ identifier: "Actor" })
export type Actor = typeof Actor.Type
