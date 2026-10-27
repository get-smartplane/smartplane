import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type InviteAccess, MembershipId, TeamId, UserId } from "@pc/domain"
import { DateTime, Effect, Option } from "effect"
import { TestClock } from "effect/testing"
import { systemActor } from "../audit/actor"
import { UsersRepo } from "../auth/users-repo"
import { now, orgId, userId } from "../testing/fixtures"
import { access, admin, backend, count, invitationWorld, inviteInput, seedInvitations, signIn, userIdOf, variable } from "../testing/invitations"
import { insertRow, selectRows } from "../testing/seed"
import { Provisioning } from "../webhooks/provisioning"
import { InvitationAcceptance } from "./invitation-acceptance"
import { Invitations } from "./invitations"
import { MembersRepo } from "./members-repo"
import { Offboarding } from "./offboarding"

describe("Invitations.inviteWithAccess", () => {
  it.effect("holds teams and grants until the invitation is accepted, then applies them once", () => {
    const events: Array<AuditEvent> = []
    const sent: Array<string> = []
    return Effect.gen(function*() {
      yield* seedInvitations
      const invited = yield* Invitations.use((invitations) => invitations.inviteWithAccess(admin, inviteInput()))

      assert.deepStrictEqual(invited.map((member) => [member.email, member.status, member.userId]), [
        ["grace@example.com", "invited", null],
        ["linus@example.com", "invited", null]
      ])
      assert.deepStrictEqual(sent, ["grace@example.com", "linus@example.com"])
      // Nothing applies before acceptance: there is no user to add or grant to yet.
      assert.strictEqual(yield* count("grants WHERE subject_type = 'user'"), 0)
      assert.strictEqual(yield* count("team_members"), 1)
      const pending = yield* Invitations.use((invitations) => invitations.listPending(admin))
      assert.strictEqual(pending.length, 2)
      assert.deepStrictEqual(pending[0]?.access.teamIds, [backend])
      assert.strictEqual(pending[0]?.setBy, userId)
      const invitedEvents = events.filter((event) => event.type === "member.invited")
      assert.strictEqual(invitedEvents.length, 2)
      assert.deepStrictEqual(invitedEvents[0]?.data.access, { teamIds: [backend], grants: [{ resourceId: variable, action: "use", conditions: {}, expiresAt: "2026-11-14T12:00:00.000Z" }] })

      assert.isTrue(Option.isSome(yield* signIn("grace@example.com")))
      const grace = yield* userIdOf("grace@example.com")
      const member = yield* MembersRepo.use((members) => members.findByEmail(orgId, "grace@example.com"))
      assert.strictEqual(Option.getOrThrow(member).status, "active")
      assert.strictEqual(yield* count("team_members WHERE team_id = ? AND user_id = ?", backend, grace), 1)
      const grants = yield* selectRows("SELECT resource_id, action, created_by, expires_at FROM grants WHERE subject_type = 'user' AND subject_id = ?", grace)
      assert.deepStrictEqual(grants, [{ resourceId: variable, action: "use", createdBy: userId, expiresAt: "2026-11-14T12:00:00.000Z" }])
      assert.strictEqual(yield* count("invitation_access WHERE membership_id = ?", Option.getOrThrow(member).id), 0)
      // Linus has not accepted; his setup is still waiting.
      assert.strictEqual((yield* Invitations.use((invitations) => invitations.listPending(admin))).length, 1)

      const applied = events.filter((event) => event.type === "grant.created" || event.type === "team.member_added")
      assert.deepStrictEqual(applied.map((event) => [event.type, event.actor, event.data.authorizedBy]), [
        ["team.member_added", systemActor("invitation"), userId],
        ["grant.created", systemActor("invitation"), userId]
      ])
      assert.strictEqual(events.find((event) => event.type === "member.joined")?.data.grantsCreated, 1)

      // A second acceptance (the WorkOS webhook racing the sign-in) applies nothing twice.
      const membershipId = Option.getOrThrow(member).id
      yield* InvitationAcceptance.use((acceptance) => acceptance.accept(orgId, membershipId, UserId.make(grace), "om_1"))
      assert.strictEqual(yield* count("grants WHERE subject_id = ?", grace), 1)
      assert.strictEqual(events.filter((event) => event.type === "member.joined").length, 1)
    }).pipe(Effect.provide(invitationWorld(events, sent)))
  })

  it.effect("applies the setup when WorkOS reports the accepted membership before the first sign-in", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seedInvitations
      yield* Invitations.use((invitations) => invitations.inviteWithAccess(admin, inviteInput({ emails: ["grace@example.com"] })))
      const grace = yield* UsersRepo.use((users) => users.upsert({ id: "wos_grace", email: "grace@example.com" }))
      yield* Provisioning.use((provisioning) =>
        provisioning.apply({
          event: "organization_membership.created",
          data: { id: "om_grace", user_id: "wos_grace", organization_id: "org_workos", status: "active", role: { slug: "member" } }
        }))
      assert.strictEqual(yield* count("memberships WHERE user_id = ? AND status = 'active' AND workos_membership_id = 'om_grace'", grace), 1)
      assert.strictEqual(yield* count("grants WHERE subject_id = ?", grace), 1)
      assert.strictEqual(yield* count("team_members WHERE user_id = ?", grace), 1)
      // The later sign-in finds an active membership and changes nothing.
      yield* signIn("grace@example.com")
      assert.strictEqual(yield* count("grants WHERE subject_id = ?", grace), 1)
      assert.strictEqual(events.filter((event) => event.type === "member.joined").length, 1)
    }).pipe(Effect.provide(invitationWorld(events, [])))
  })

  it.effect("skips grants that expired and teams that were deleted before acceptance", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seedInvitations
      yield* insertRow("teams", { id: "team_gonesoon1", orgId, name: "Gone", slug: "gone", createdAt: DateTime.formatIso(now) })
      const setup: InviteAccess = {
        teamIds: [backend, TeamId.make("team_gonesoon1")],
        grants: [{ resourceId: variable, action: "read", conditions: {}, expiresAt: DateTime.add(now, { days: 1 }) }]
      }
      yield* Invitations.use((invitations) => invitations.inviteWithAccess(admin, inviteInput({ emails: ["grace@example.com"], access: setup })))
      yield* selectRows("DELETE FROM teams WHERE id = 'team_gonesoon1'")
      yield* TestClock.adjust("2 days")
      yield* signIn("grace@example.com")
      const grace = yield* userIdOf("grace@example.com")
      assert.strictEqual(yield* count("grants WHERE subject_id = ?", grace), 0)
      assert.strictEqual(yield* count("team_members WHERE user_id = ?", grace), 1)
      assert.strictEqual(events.find((event) => event.type === "member.joined")?.data.skipped, 2)
    }).pipe(Effect.provide(invitationWorld(events, [])))
  })

  it.effect("offboarding a pending invitation drops its setup, so accepting it later grants nothing", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seedInvitations
      const [grace] = yield* Invitations.use((invitations) => invitations.inviteWithAccess(admin, inviteInput({ emails: ["grace@example.com"] })))
      const id = grace?.id ?? MembershipId.make("mem_missing001")
      const removed = yield* Offboarding.use((offboarding) => offboarding.deprovisionMember(orgId, id, systemActor("scim"), "scim_user_deleted"))

      assert.strictEqual(removed.status, "deprovisioned")
      assert.strictEqual(yield* count("invitation_access"), 0)
      assert.deepStrictEqual(yield* Invitations.use((invitations) => invitations.listPending(admin)), [])
      assert.strictEqual(events.find((event) => event.type === "member.deprovisioned")?.data.pendingAccessDropped, true)

      assert.isTrue(Option.isNone(yield* signIn("grace@example.com")))
      const user = yield* userIdOf("grace@example.com")
      assert.strictEqual(yield* count("grants WHERE subject_id = ?", user), 0)
      assert.strictEqual(yield* count("team_members WHERE user_id = ?", user), 0)
      assert.strictEqual(yield* count("memberships WHERE id = ? AND status = 'deprovisioned'", id), 1)
    }).pipe(Effect.provide(invitationWorld(events, [])))
  })
})
