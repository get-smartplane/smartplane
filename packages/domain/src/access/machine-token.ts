import { Context, Schema } from "effect"
import { MachineTokenId, OrgId, ProjectId, ResourceId, UserId } from "../ids"
import { HttpUrl, Name, Timestamp } from "../primitives"
import type { Principal } from "../principal"
import { MaxTokenTtlDays } from "./token"

/** Every machine token starts with this; `pc_` tokens can never be mistaken for one, nor the reverse. */
export const MachineTokenPrefix = "pcm_"

const TtlDays = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MaxTokenTtlDays }))

/**
 * A deployed service's credential for `POST /api/secrets/deliver`, and nothing else. It belongs to the org,
 * not its creator: offboarding the creator leaves it working, which is why access reviews list it. Only a
 * SHA-256 hash is stored. `allow` is its grant: the secrets and variables it may receive while deliverable.
 */
export class MachineToken extends Schema.Opaque<MachineToken>()(
  Schema.Struct({
    id: MachineTokenId,
    orgId: OrgId,
    /** The service it is for, e.g. `billing-api (Railway)`. */
    name: Name,
    prefix: Schema.NonEmptyString,
    projectId: Schema.NullOr(ProjectId),
    allow: Schema.Array(ResourceId),
    createdBy: UserId,
    createdAt: Timestamp,
    /** Always set: at most 90 days ahead, moved forward only by an audited renewal. */
    expiresAt: Timestamp,
    lastUsedAt: Schema.NullOr(Timestamp),
    lastUsedIp: Schema.NullOr(Schema.String),
    revokedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "MachineToken" })
) {}

/** `ttlDays` defaults to the maximum, 90. */
export const CreateMachineToken = Schema.Struct({
  name: Name,
  projectId: Schema.optionalKey(Schema.NullOr(ProjectId)),
  allow: Schema.NonEmptyArray(ResourceId).check(Schema.isMaxLength(200)),
  ttlDays: Schema.optionalKey(TtlDays)
}).annotate({ identifier: "CreateMachineToken" })
export type CreateMachineToken = typeof CreateMachineToken.Type

/** Sets the expiry to `ttlDays` (default 90) from now. */
export const RenewMachineToken = Schema.Struct({ ttlDays: Schema.optionalKey(TtlDays) }).annotate({ identifier: "RenewMachineToken" })
export type RenewMachineToken = typeof RenewMachineToken.Type

/** Returned exactly once, at creation. `deliverUrl` is what the service calls at boot. */
export class CreatedMachineToken extends Schema.Opaque<CreatedMachineToken>()(
  Schema.Struct({
    token: MachineToken,
    plaintext: Schema.Redacted(Schema.String),
    deliverUrl: HttpUrl
  }).annotate({ identifier: "CreatedMachineToken" })
) {}

/** Who calls the delivery endpoint: a member (personal token or AuthKit JWT) or a machine token. */
export type DeliveryCaller =
  | { readonly _tag: "Member"; readonly principal: Principal }
  | { readonly _tag: "Machine"; readonly token: MachineToken }

export class CurrentDeliveryCaller extends Context.Service<CurrentDeliveryCaller, DeliveryCaller>()("@pc/domain/CurrentDeliveryCaller") {}
