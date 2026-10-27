import { Schema } from "effect"
import { AccessTokenId, OrgId, ProjectId, UserId } from "../ids"
import { HttpUrl, Name, Timestamp } from "../primitives"

/** SOC 2: tokens always expire, at most this many days after creation. */
export const MaxTokenTtlDays = 90

/** `personal` tokens act as their creator; `service_account` tokens are their own grant subject. */
export const AccessTokenKind = Schema.Literals(["personal", "service_account"])
export type AccessTokenKind = typeof AccessTokenKind.Type

/** Only a SHA-256 hash of the token is stored; `prefix` lets people recognise their tokens. */
export class AccessToken extends Schema.Opaque<AccessToken>()(
  Schema.Struct({
    id: AccessTokenId,
    orgId: OrgId,
    kind: AccessTokenKind,
    name: Name,
    prefix: Schema.NonEmptyString,
    createdBy: UserId,
    projectId: Schema.NullOr(ProjectId),
    expiresAt: Timestamp,
    lastUsedAt: Schema.NullOr(Timestamp),
    createdAt: Timestamp,
    revokedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "AccessToken" })
) {}

export const CreateAccessToken = Schema.Struct({
  name: Name,
  kind: AccessTokenKind,
  projectId: Schema.NullOr(ProjectId),
  ttlDays: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MaxTokenTtlDays }))
}).annotate({ identifier: "CreateAccessToken" })
export type CreateAccessToken = typeof CreateAccessToken.Type

/** Returned exactly once, at creation. The plaintext cannot be retrieved again. */
export class CreatedAccessToken extends Schema.Opaque<CreatedAccessToken>()(
  Schema.Struct({
    token: AccessToken,
    plaintext: Schema.Redacted(Schema.String),
    mcpUrl: HttpUrl
  }).annotate({ identifier: "CreatedAccessToken" })
) {}

/** `all` lists every token in the org and requires `tokens:manage`. */
export const AccessTokenFilter = Schema.Struct({
  scope: Schema.optionalKey(Schema.Literals(["mine", "all"]))
})
export type AccessTokenFilter = typeof AccessTokenFilter.Type
