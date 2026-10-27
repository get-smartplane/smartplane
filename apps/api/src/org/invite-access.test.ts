import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type InviteAccess, type InviteWithAccess, MembershipId, ResourceId, RoleSlug, TeamId } from "@pc/domain"
import { DateTime, Effect } from "effect"
import { now, orgId, userPrincipal } from "../testing/fixtures"
import { access, admin, backend, count, invitationWorld, inviteInput, seedInvitations, useGrant } from "../testing/invitations"
import { insertRow } from "../testing/seed"
import { Invitations } from "./invitations"

describe("Invitations: who may set up what", () => {
  it.effect("only owners can invite owners, and each part of the setup needs its own permission", () => {
    const sent: Array<string> = []
    return Effect.gen(function*() {
      yield* seedInvitations
      const invite = (principal: typeof admin, overrides: Partial<InviteWithAccess>) =>
        Invitations.use((invitations) => invitations.inviteWithAccess(principal, inviteInput(overrides))).pipe(Effect.flip)

      const ownership = yield* invite(admin, { role: RoleSlug.make("owner") })
      assert.strictEqual(ownership._tag, "Forbidden")
      assert.strictEqual(ownership.message, "only owners can grant the owner role")

      const membersOnly = userPrincipal({ role: RoleSlug.make("admin"), permissions: ["members:manage"] })
      const grants = yield* invite(membersOnly, { access: { teamIds: [], grants: access.grants } })
      assert.deepStrictEqual([grants._tag, "permission" in grants ? grants.permission : null], ["Forbidden", "grants:manage"])
      const teams = yield* invite(membersOnly, { access: { teamIds: [backend], grants: [] } })
      assert.deepStrictEqual([teams._tag, "permission" in teams ? teams.permission : null], ["Forbidden", "teams:manage"])
      assert.deepStrictEqual(sent, [])

      const owner = userPrincipal({ role: RoleSlug.make("owner"), permissions: admin.permissions })
      const owners = yield* Invitations.use((invitations) => invitations.inviteWithAccess(owner, inviteInput({ emails: ["grace@example.com"], role: RoleSlug.make("owner") })))
      assert.strictEqual(owners[0]?.role, "owner")
    }).pipe(Effect.provide(invitationWorld([], sent)))
  })

  it.effect("refuses the whole batch before sending anything when one part is invalid", () => {
    const sent: Array<string> = []
    return Effect.gen(function*() {
      yield* seedInvitations
      yield* insertRow("teams", { id: "team_synced001", orgId, name: "Synced", slug: "synced", directoryGroupId: "dir_1", createdAt: DateTime.formatIso(now) })
      const invite = (overrides: Partial<InviteWithAccess>) =>
        Invitations.use((invitations) => invitations.inviteWithAccess(admin, inviteInput(overrides))).pipe(Effect.flip)

      assert.strictEqual((yield* invite({ emails: ["grace@example.com", "ada@example.com"] }))._tag, "Conflict")
      assert.strictEqual((yield* invite({ access: { teamIds: [TeamId.make("team_synced001")], grants: [] } }))._tag, "Conflict")
      const missing = yield* invite({ access: { teamIds: [], grants: [{ ...useGrant, resourceId: ResourceId.make("res_nosuchres1") }] } })
      assert.strictEqual(missing._tag, "NotFound")
      const past = yield* invite({ access: { teamIds: [], grants: [{ ...useGrant, expiresAt: DateTime.subtract(now, { days: 1 }) }] } })
      assert.deepStrictEqual([past._tag, "field" in past ? past.field : null], ["InvalidInput", "access.grants.0.expiresAt"])
      assert.deepStrictEqual(sent, [])
      assert.strictEqual(yield* count("memberships WHERE status = 'invited'"), 0)
    }).pipe(Effect.provide(invitationWorld([], sent)))
  })

  it.effect("writes each invitee whole: a WorkOS failure keeps the ones before it and none after", () => {
    const sent: Array<string> = []
    return Effect.gen(function*() {
      yield* seedInvitations
      const error = yield* Invitations.use((invitations) =>
        invitations.inviteWithAccess(admin, inviteInput({ emails: ["grace@example.com", "linus@example.com", "ken@example.com"] }))).pipe(Effect.flip)
      assert.strictEqual(error._tag, "UpstreamFailure")
      assert.strictEqual(yield* count("memberships WHERE status = 'invited'"), 1)
      assert.strictEqual(yield* count("invitation_access"), 1)
    }).pipe(Effect.provide(invitationWorld([], sent, "linus@example.com")))
  })
})

describe("Invitations.setAccess", () => {
  it.effect("replaces a pending setup, audits before and after, and clears it when empty", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seedInvitations
      const [grace] = yield* Invitations.use((invitations) => invitations.inviteWithAccess(admin, inviteInput({ emails: ["grace@example.com"] })))
      const id = grace?.id ?? MembershipId.make("mem_missing001")
      const teamsOnly: InviteAccess = { teamIds: [backend], grants: [] }
      const saved = yield* Invitations.use((invitations) => invitations.setAccess(admin, id, teamsOnly))
      assert.deepStrictEqual(saved.access, teamsOnly)
      const updated = events.find((event) => event.type === "member.invite_updated")
      assert.deepStrictEqual(updated?.data.after, { teamIds: [backend], grants: [] })
      assert.strictEqual((updated?.data.before as { grants: Array<unknown> } | null)?.grants.length, 1)

      // Unchanged teams need no teams:manage; only the grants changed.
      const grantsOnlyAdmin = userPrincipal({ role: RoleSlug.make("admin"), permissions: ["members:manage", "grants:manage"] })
      yield* Invitations.use((invitations) => invitations.setAccess(grantsOnlyAdmin, id, { teamIds: [backend], grants: access.grants }))

      yield* Invitations.use((invitations) => invitations.setAccess(admin, id, { teamIds: [], grants: [] }))
      assert.strictEqual(yield* count("invitation_access"), 0)

      const active = yield* Invitations.use((invitations) => invitations.setAccess(admin, MembershipId.make("mem_testmem01"), teamsOnly)).pipe(Effect.flip)
      assert.strictEqual(active._tag, "Conflict")
    }).pipe(Effect.provide(invitationWorld(events, [])))
  })
})
