import { Schema } from "effect"
import { OrgId } from "../ids"
import { HttpUrl, Name, Slug, Timestamp } from "../primitives"

/**
 * Days audit events stay queryable in D1 before living only in the R2 archive. SOC 2 auditors expect at
 * least a year of readily available evidence; ten years bounds D1 growth.
 */
export const AuditRetentionDays = Schema.Int.check(Schema.isBetween({ minimum: 365, maximum: 3650 })).annotate({
  identifier: "AuditRetentionDays"
})

/**
 * Above how many tools a principal's `tools/list` switches to search mode (`smartplane__search_tools` and
 * `smartplane__call_tool` instead of every tool). `0` is always, `null` never. Agents choose worse from long
 * lists, and some clients warn above about 40 tools.
 */
export const ToolSearchThreshold = Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))).annotate({
  identifier: "ToolSearchThreshold"
})
export type ToolSearchThreshold = typeof ToolSearchThreshold.Type
export const DefaultToolSearchThreshold = 40

/** A tenant. Mirrors a WorkOS Organization, which owns SSO and directory sync. */
export class Org extends Schema.Opaque<Org>()(
  Schema.Struct({
    id: OrgId,
    name: Name,
    slug: Slug,
    auditRetentionDays: AuditRetentionDays,
    toolSearchThreshold: ToolSearchThreshold,
    createdAt: Timestamp
  }).annotate({ identifier: "Org" })
) {}

export const CreateOrg = Schema.Struct({ name: Name }).annotate({ identifier: "CreateOrg" })
export type CreateOrg = typeof CreateOrg.Type

/** Org settings; the slug is stable so links and archive keys never move. */
export const UpdateOrg = Schema.Struct({
  name: Schema.optionalKey(Name),
  auditRetentionDays: Schema.optionalKey(AuditRetentionDays),
  toolSearchThreshold: Schema.optionalKey(ToolSearchThreshold)
}).annotate({ identifier: "UpdateOrg" })
export type UpdateOrg = typeof UpdateOrg.Type

/** What the WorkOS Admin Portal session lets the customer's IT admin configure. */
export const AdminPortalIntent = Schema.Literals(["sso", "dsync", "audit_logs", "log_streams", "domain_verification"])
export type AdminPortalIntent = typeof AdminPortalIntent.Type

export const AdminPortalLinkRequest = Schema.Struct({ intent: AdminPortalIntent }).annotate({
  identifier: "AdminPortalLinkRequest"
})
export type AdminPortalLinkRequest = typeof AdminPortalLinkRequest.Type

/** A one-time WorkOS Admin Portal link: open it right away, it expires within minutes. */
export class AdminPortalLink extends Schema.Opaque<AdminPortalLink>()(
  Schema.Struct({ intent: AdminPortalIntent, url: HttpUrl, expiresAt: Timestamp }).annotate({ identifier: "AdminPortalLink" })
) {}
