import type { AdminPortalIntent, AdminPortalLink, Forbidden, Org, Principal, UpdateOrg, UpstreamFailure } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission } from "../auth/permissions"
import { OrgsRepo } from "../org/orgs-repo"
import { WorkosAdmin } from "./workos-admin"

/** WorkOS documents Admin Portal links as valid for five minutes. */
const PortalLinkLifetime = { minutes: 5 }

/** Org-wide settings. Every method requires `org:manage`; every change is audited with before/after values. */
export class OrgSettings extends Context.Service<OrgSettings, {
  readonly get: (principal: Principal) => Effect.Effect<Org, Forbidden>
  readonly update: (principal: Principal, patch: UpdateOrg) => Effect.Effect<Org, Forbidden | UpstreamFailure>
  readonly adminPortalLink: (principal: Principal, intent: AdminPortalIntent) => Effect.Effect<AdminPortalLink, Forbidden | UpstreamFailure>
}>()("api/settings/OrgSettings") {
  static readonly layer = Layer.effect(
    OrgSettings,
    Effect.gen(function*() {
      const orgs = yield* OrgsRepo
      const workos = yield* WorkosAdmin
      const audit = yield* AuditLog

      // The principal was resolved from this org, so a missing row (or WorkOS id) is a defect.
      const load = (principal: Principal) => Effect.orDie(Effect.flatMap(orgs.find(principal.orgId), Effect.fromOption))
      const workosId = (principal: Principal) => Effect.orDie(Effect.flatMap(orgs.workosIdOf(principal.orgId), Effect.fromOption))

      const get = Effect.fn("OrgSettings.get")(function*(principal: Principal) {
        yield* requirePermission(principal, "org:manage")
        return yield* load(principal)
      })

      const update = Effect.fn("OrgSettings.update")(function*(principal: Principal, patch: UpdateOrg) {
        const before = yield* get(principal)
        const name = patch.name !== undefined && patch.name !== before.name ? patch.name : undefined
        const retention = patch.auditRetentionDays !== before.auditRetentionDays ? patch.auditRetentionDays : undefined
        // `null` (never use tool search) is a value, so absence is told apart by the key.
        const toolSearch = "toolSearchThreshold" in patch && patch.toolSearchThreshold !== before.toolSearchThreshold
          ? { from: before.toolSearchThreshold, to: patch.toolSearchThreshold ?? null }
          : undefined
        if (name === undefined && retention === undefined && toolSearch === undefined) return before
        // WorkOS first: if the mirror cannot be renamed, nothing changes here either.
        if (name !== undefined) yield* workos.renameOrganization(yield* workosId(principal), name)
        yield* orgs.update(principal.orgId, {
          ...(name === undefined ? {} : { name }),
          ...(retention === undefined ? {} : { auditRetentionDays: retention }),
          ...(toolSearch === undefined ? {} : { toolSearchThreshold: toolSearch.to })
        })
        yield* audit.by(principal, "org.updated", { type: "org", id: principal.orgId }, {
          ...(name === undefined ? {} : { name: { from: before.name, to: name } }),
          ...(retention === undefined ? {} : { auditRetentionDays: { from: before.auditRetentionDays, to: retention } }),
          ...(toolSearch === undefined ? {} : { toolSearchThreshold: toolSearch })
        })
        return yield* load(principal)
      })

      const adminPortalLink = Effect.fn("OrgSettings.adminPortalLink")(function*(principal: Principal, intent: AdminPortalIntent) {
        yield* requirePermission(principal, "org:manage")
        const url = yield* workos.portalLink(yield* workosId(principal), intent)
        yield* audit.by(principal, "org.admin_portal_opened", { type: "org", id: principal.orgId }, { intent })
        const link: AdminPortalLink = { intent, url, expiresAt: DateTime.add(yield* DateTime.now, PortalLinkLifetime) }
        return link
      })

      return OrgSettings.of({ get, update, adminPortalLink })
    })
  )
}
