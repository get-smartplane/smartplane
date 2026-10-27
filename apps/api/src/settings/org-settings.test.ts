import { assert, describe, it } from "@effect/vitest"
import type { AuditEvent } from "@pc/domain"
import { Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { OrgsRepo } from "../org/orgs-repo"
import { TestDatabase } from "../testing/database"
import { userPrincipal } from "../testing/fixtures"
import { memoryAuditQueue, seedOrg } from "../testing/seed"
import { OrgSettings } from "./org-settings"
import { WorkosAdmin } from "./workos-admin"

const owner = userPrincipal({ permissions: ["org:manage"] })

const layer = (events: Array<AuditEvent>, renamed: Array<string>) =>
  OrgSettings.layer.pipe(
    Layer.provide(Layer.mergeAll(
      OrgsRepo.layer,
      AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(events))),
      Layer.succeed(WorkosAdmin, {
        portalLink: (organization, intent) => Effect.succeed(`https://setup.workos.com/portal?org=${organization}&intent=${intent}`),
        renameOrganization: (_, name) => Effect.sync(() => void renamed.push(name))
      })
    )),
    Layer.provideMerge(TestDatabase)
  )

describe("org settings", () => {
  it.effect("updates name and retention, mirrors the rename to WorkOS and audits before/after", () => {
    const events: Array<AuditEvent> = []
    const renamed: Array<string> = []
    return Effect.gen(function*() {
      yield* seedOrg
      const settings = yield* OrgSettings
      const org = yield* settings.update(owner, { name: "Acme Corp", auditRetentionDays: 730 })
      assert.strictEqual(org.name, "Acme Corp")
      assert.strictEqual(org.auditRetentionDays, 730)
      assert.deepStrictEqual(renamed, ["Acme Corp"])
      assert.deepStrictEqual(events[0]?.data, {
        name: { from: "Acme", to: "Acme Corp" },
        auditRetentionDays: { from: 365, to: 730 }
      })
      yield* settings.update(owner, { auditRetentionDays: 730 })
      assert.strictEqual(events.length, 1, "a no-op update is not an event")
    }).pipe(Effect.provide(layer(events, renamed)))
  })

  it.effect("sets the tool search threshold, including never (null), and audits before/after", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seedOrg
      const settings = yield* OrgSettings
      assert.strictEqual((yield* settings.get(owner)).toolSearchThreshold, 40)
      assert.strictEqual((yield* settings.update(owner, { toolSearchThreshold: null })).toolSearchThreshold, null)
      assert.strictEqual((yield* settings.update(owner, { toolSearchThreshold: 0 })).toolSearchThreshold, 0)
      yield* settings.update(owner, { name: "Acme" })
      assert.deepStrictEqual(events.map((event) => event.data), [
        { toolSearchThreshold: { from: 40, to: null } },
        { toolSearchThreshold: { from: null, to: 0 } }
      ])
    }).pipe(Effect.provide(layer(events, [])))
  })

  it.effect("hands out audited Admin Portal links to org:manage only", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seedOrg
      const settings = yield* OrgSettings
      const link = yield* settings.adminPortalLink(owner, "sso")
      assert.include(link.url, "org=org_workos")
      assert.strictEqual(events[0]?.type, "org.admin_portal_opened")
      assert.notInclude(JSON.stringify(events), link.url, "the portal URL is a credential and stays out of the audit log")
      const error = yield* settings.adminPortalLink(userPrincipal({ permissions: ["members:manage"] }), "sso").pipe(Effect.flip)
      assert.strictEqual(error._tag, "Forbidden")
    }).pipe(Effect.provide(layer(events, [])))
  })
})
