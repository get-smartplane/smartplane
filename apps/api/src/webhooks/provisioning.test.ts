import { assert, describe, it } from "@effect/vitest"
import { MembershipId } from "@pc/domain"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { actorOf } from "../audit/actor"
import { Offboarding } from "../org/offboarding"
import { now, orgId } from "../testing/fixtures"
import { admin, invitationWorld } from "../testing/invitations"
import { seedOrg, selectRows } from "../testing/seed"
import { Provisioning } from "./provisioning"

const membershipId = MembershipId.make("mem_testmem01")

const membershipEvent = (event: "organization_membership.created" | "organization_membership.updated", id: string, status: "active" | "inactive") =>
  Provisioning.use((provisioning) =>
    provisioning.apply({ event, data: { id, user_id: "wos_usr_testuser01", organization_id: "org_workos", status, role: { slug: "member" } } }))

const status = Effect.map(selectRows("SELECT status FROM memberships WHERE id = ?", membershipId), (rows) => rows[0]?.status)

const setup = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  yield* membershipEvent("organization_membership.updated", "om_first", "active")
})

describe("WorkOS membership webhooks", () => {
  it.effect("never undo a removal made in Smartplane with a routine `updated` event, or a replayed `created`", () =>
    Effect.gen(function*() {
      yield* setup
      yield* Offboarding.use((offboarding) => offboarding.deprovisionMember(orgId, membershipId, actorOf(admin), "removed_by_admin"))
      yield* membershipEvent("organization_membership.updated", "om_first", "active")
      assert.strictEqual(yield* status, "deprovisioned")
      yield* membershipEvent("organization_membership.created", "om_first", "active")
      assert.strictEqual(yield* status, "deprovisioned")
    }).pipe(Effect.provide(invitationWorld([], []))))

  it.effect("re-add the member when WorkOS reports a new membership", () =>
    Effect.gen(function*() {
      yield* setup
      yield* Offboarding.use((offboarding) => offboarding.deprovisionMember(orgId, membershipId, actorOf(admin), "removed_by_admin"))
      yield* membershipEvent("organization_membership.created", "om_second", "active")
      assert.strictEqual(yield* status, "active")
    }).pipe(Effect.provide(invitationWorld([], []))))

  it.effect("reverse a removal that WorkOS or SCIM made when WorkOS reactivates the membership", () =>
    Effect.gen(function*() {
      yield* setup
      yield* membershipEvent("organization_membership.updated", "om_first", "inactive")
      assert.strictEqual(yield* status, "deprovisioned")
      yield* membershipEvent("organization_membership.updated", "om_first", "active")
      assert.strictEqual(yield* status, "active")
    }).pipe(Effect.provide(invitationWorld([], []))))

  it.effect("keep the first reason: a later SCIM removal does not make an admin's removal reversible", () =>
    Effect.gen(function*() {
      yield* setup
      yield* Offboarding.use((offboarding) => offboarding.deprovisionMember(orgId, membershipId, actorOf(admin), "removed_by_admin"))
      yield* membershipEvent("organization_membership.updated", "om_first", "inactive")
      yield* membershipEvent("organization_membership.updated", "om_first", "active")
      assert.strictEqual(yield* status, "deprovisioned")
    }).pipe(Effect.provide(invitationWorld([], []))))
})
