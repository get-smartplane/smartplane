import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, AuditUnavailable, MembershipId } from "@pc/domain"
import { DateTime, Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { AuditLog } from "../audit/audit-log"
import { systemActor } from "../audit/actor"
import { ConnectionsRepo } from "../connections/connections-repo"
import { AuditQueue } from "../platform/audit-queue"
import { TestDatabase } from "../testing/database"
import { now, orgId } from "../testing/fixtures"
import { insertRow, memoryAuditQueue, seedOrg, seedResource, seedToken, seedUser, seedUserGrant, selectRows } from "../testing/seed"
import { MembersRepo } from "./members-repo"
import { Offboarding } from "./offboarding"

const layer = (events: Array<AuditEvent>, queue: Layer.Layer<AuditQueue> = memoryAuditQueue(events)) =>
  Offboarding.layer.pipe(
    Layer.provideMerge(Layer.merge(MembersRepo.layer, ConnectionsRepo.layer)),
    Layer.provide(AuditLog.layer.pipe(Layer.provide(queue))),
    Layer.provideMerge(TestDatabase)
  )

const downQueue = Layer.succeed(AuditQueue, { send: () => Effect.fail(new AuditUnavailable({ message: "down" })) })

const count = (query: string, ...params: Array<unknown>) =>
  selectRows(`SELECT COUNT(*) AS n FROM ${query}`, ...params).pipe(Effect.map((rows) => rows[0]?.n))

describe("deprovisionMember", () => {
  it.effect("switches the membership off and revokes tokens, direct grants and team memberships", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      yield* seedUser("usr_colleague1", "grace@example.com", "mem_colleague1")
      yield* seedResource("res_variable01")
      yield* seedToken("tok_personal01", "pc_personal")
      yield* seedToken("tok_service001", "pc_service", { kind: "service_account", membershipId: null })
      yield* seedUserGrant("grt_mine00001", "res_variable01")
      yield* seedUserGrant("grt_theirs0001", "res_variable01", "usr_colleague1")

      const member = yield* Offboarding.use((offboarding) =>
        offboarding.deprovisionMember(orgId, MembershipId.make("mem_testmem01"), systemActor("scim"), "scim_user_deleted")
      )

      assert.strictEqual(member.status, "deprovisioned")
      assert.isNotNull(member.deprovisionedAt)
      assert.strictEqual(yield* count("access_tokens WHERE id = ? AND revoked_at IS NOT NULL", "tok_personal01"), 1)
      // Service-account tokens belong to the org, not to the person who created them.
      assert.strictEqual(yield* count("access_tokens WHERE id = ? AND revoked_at IS NULL", "tok_service001"), 1)
      assert.strictEqual(yield* count("grants WHERE id = ? AND revoked_by = 'scim'", "grt_mine00001"), 1)
      assert.strictEqual(yield* count("grants WHERE id = ? AND revoked_at IS NULL", "grt_theirs0001"), 1)
      assert.strictEqual(yield* count("team_members WHERE user_id = ?", "usr_testuser01"), 0)
      assert.strictEqual(yield* count("memberships WHERE id = ? AND status = 'active'", "mem_colleague1"), 1)

      assert.strictEqual(events.length, 1)
      assert.strictEqual(events[0]?.type, "member.deprovisioned")
      assert.deepStrictEqual(events[0]?.actor, { type: "system", id: "scim" })
      assert.strictEqual(events[0]?.data.reason, "scim_user_deleted")
    }).pipe(Effect.provide(layer(events)))
  })

  it.effect("deletes the member's own connected accounts and their credentials, and nobody else's", () => {
    const events: Array<AuditEvent> = []
    const connection = (id: string, resourceId: string, userId: string | null) =>
      insertRow("connections", {
        id,
        orgId,
        resourceId,
        userId,
        mode: userId === null ? "shared" : "per_user",
        method: "secret",
        status: "connected",
        connectedBy: userId ?? "usr_colleague1",
        connectedAt: DateTime.formatIso(now),
        ciphertext: "c",
        iv: "i",
        wrappedDek: "w",
        kekId: "k"
      })
    return Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      yield* seedUser("usr_colleague1", "grace@example.com", "mem_colleague1")
      yield* seedResource("res_gmail00001")
      yield* seedResource("res_figma00001")
      yield* connection("con_mine000001", "res_gmail00001", "usr_testuser01")
      yield* connection("con_mine000002", "res_figma00001", "usr_testuser01")
      yield* connection("con_theirs0001", "res_gmail00001", "usr_colleague1")
      yield* connection("con_shared0001", "res_figma00001", null)

      yield* Offboarding.use((offboarding) =>
        offboarding.deprovisionMember(orgId, MembershipId.make("mem_testmem01"), systemActor("scim"), "scim_user_deleted")
      )

      assert.strictEqual(yield* count("connections WHERE user_id = ?", "usr_testuser01"), 0)
      assert.deepStrictEqual((yield* selectRows("SELECT id FROM connections ORDER BY id")).map((row) => row.id), ["con_shared0001", "con_theirs0001"])
      const disconnected = events.filter((event) => event.type === "connection.disconnected")
      assert.deepStrictEqual(disconnected.map((event) => [event.target?.id, event.data.reason]), [["res_gmail00001", "deprovisioned"], ["res_figma00001", "deprovisioned"]])
      assert.notInclude(JSON.stringify(events), "ciphertext")
    }).pipe(Effect.provide(layer(events)))
  })

  it.effect("is idempotent and audits only the first time", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const run = Offboarding.use((offboarding) =>
        offboarding.deprovisionMember(orgId, MembershipId.make("mem_testmem01"), systemActor("workos"), "membership_deleted")
      )
      yield* run
      const again = yield* run
      assert.strictEqual(again.status, "deprovisioned")
      assert.strictEqual(events.length, 1)
    }).pipe(Effect.provide(layer(events)))
  })

  it.effect("fails with NotFound for a membership of another org", () =>
    Effect.gen(function*() {
      yield* seedOrg
      const error = yield* Offboarding.use((offboarding) =>
        offboarding.deprovisionMember(orgId, MembershipId.make("mem_nosuchmem1"), systemActor("workos"), "x")
      ).pipe(Effect.flip)
      assert.strictEqual(error._tag, "NotFound")
    }).pipe(Effect.provide(layer([]))))

  it.effect("commits nothing when the audit log cannot take the event, so a retry offboards and audits together", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      yield* seedToken("tok_personal01", "pc_personal")
      const exit = yield* Effect.exit(Offboarding.use((offboarding) =>
        offboarding.deprovisionMember(orgId, MembershipId.make("mem_testmem01"), systemActor("scim"), "scim_user_deleted")
      ))
      assert.strictEqual(exit._tag, "Failure")
      assert.strictEqual(yield* count("memberships WHERE id = ? AND status = 'active'", "mem_testmem01"), 1)
      assert.strictEqual(yield* count("access_tokens WHERE id = ? AND revoked_at IS NULL", "tok_personal01"), 1)
    }).pipe(Effect.provide(layer([], downQueue))))
})
