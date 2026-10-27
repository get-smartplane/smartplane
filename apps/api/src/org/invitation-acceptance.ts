import { GrantConditions, GrantSubject, type InviteGrant, type MembershipId, type OrgId, type UserId } from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { systemActor } from "../audit/actor"
import { AuditLog } from "../audit/audit-log"
import { Ids } from "../platform/ids"
import { JsonColumn } from "../platform/sql"
import { InviteAccessRepo } from "./invite-access-repo"

const encodeSubject = Schema.encodeEffect(JsonColumn(GrantSubject))
const encodeConditions = Schema.encodeEffect(JsonColumn(GrantConditions))

/**
 * Accepting an invitation: the membership turns active and its access setup (teams, direct grants) applies,
 * all in one D1 batch. Every insert is guarded by the setup row, which the batch deletes last, so a second,
 * concurrent acceptance (sign-in racing the WorkOS webhook) applies nothing twice. Teams deleted or put under
 * directory sync, and resources deleted, since the invitation are skipped; so are grants already expired.
 */
export class InvitationAcceptance extends Context.Service<InvitationAcceptance, {
  readonly accept: (orgId: OrgId, membershipId: MembershipId, userId: UserId, workosMembershipId: string | null) => Effect.Effect<void>
}>()("api/org/InvitationAcceptance") {
  static readonly layer = Layer.effect(
    InvitationAcceptance,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const pending = yield* InviteAccessRepo
      const audit = yield* AuditLog
      const actor = systemActor("invitation")

      const accept = Effect.fn("InvitationAcceptance.accept")(function*(orgId: OrgId, membershipId: MembershipId, userId: UserId, workosMembershipId: string | null) {
        yield* Effect.annotateCurrentSpan({ "org.id": orgId, "member.id": membershipId })
        const setup = Option.getOrUndefined(yield* pending.find(orgId, membershipId))
        const now = yield* DateTime.now
        const at = DateTime.formatIso(now)
        const live = (grant: InviteGrant) => grant.expiresAt === null || DateTime.isGreaterThan(grant.expiresAt, now)
        const grants = yield* Effect.forEach((setup?.access.grants ?? []).filter(live), (grant) =>
          Effect.map(Ids.grant, (id) => ({ id, ...grant })))
        const guarded = sql`EXISTS (SELECT 1 FROM invitation_access WHERE membership_id = ${membershipId} AND org_id = ${orgId})`
        const subject = yield* Effect.orDie(encodeSubject({ type: "user", id: userId }))

        const joinTeams = (setup?.access.teamIds ?? []).map((teamId) =>
          sql`INSERT INTO team_members (team_id, user_id, added_at)
              SELECT t.id, ${userId}, ${at} FROM teams t
               WHERE t.id = ${teamId} AND t.org_id = ${orgId} AND t.directory_group_id IS NULL AND ${guarded}
              ON CONFLICT DO NOTHING RETURNING team_id`)
        const makeGrants = yield* Effect.forEach(grants, (grant) =>
          Effect.map(Effect.orDie(encodeConditions(grant.conditions)), (conditions) =>
            sql`INSERT INTO grants (id, org_id, subject, subject_type, subject_id, resource_id, action, conditions, expires_at, created_by, created_at)
                SELECT ${grant.id}, ${orgId}, ${subject}, 'user', ${userId}, r.id, ${grant.action}, ${conditions},
                       ${grant.expiresAt === null ? null : DateTime.formatIso(grant.expiresAt)}, ${setup?.setBy ?? userId}, ${at}
                  FROM resources r WHERE r.id = ${grant.resourceId} AND r.org_id = ${orgId} AND r.deleted_at IS NULL AND ${guarded}
                RETURNING id`))

        const [activated, ...applied] = yield* sql.batch([
          sql`UPDATE memberships SET status = 'active', user_id = ${userId}, deprovisioned_at = NULL,
                     workos_membership_id = COALESCE(${workosMembershipId}, workos_membership_id)
               WHERE id = ${membershipId} AND org_id = ${orgId} AND status = 'invited' RETURNING id`,
          ...joinTeams,
          ...makeGrants,
          sql`DELETE FROM invitation_access WHERE membership_id = ${membershipId} AND org_id = ${orgId} RETURNING membership_id`
        ]).pipe(Effect.orDie)
        // Someone else accepted it first; they recorded it.
        if (activated.length === 0) return

        const joined = setup?.access.teamIds.filter((_, index) => (applied[index]?.length ?? 0) > 0) ?? []
        const granted = grants.filter((_, index) => (applied[joinTeams.length + index]?.length ?? 0) > 0)
        const authorized = { via: "invitation", membershipId, authorizedBy: setup?.setBy ?? null }
        yield* audit.record({
          orgId,
          type: "member.joined",
          actor: { type: "user", id: userId },
          target: { type: "member", id: membershipId },
          data: { via: "invitation", teamsJoined: joined.length, grantsCreated: granted.length, skipped: (setup?.access.teamIds.length ?? 0) + (setup?.access.grants.length ?? 0) - joined.length - granted.length }
        })
        yield* Effect.forEach(joined, (teamId) =>
          audit.record({ orgId, type: "team.member_added", actor, target: { type: "team", id: teamId }, data: { userId, ...authorized } }), { discard: true })
        yield* Effect.forEach(granted, (grant) =>
          audit.record({
            orgId,
            type: "grant.created",
            actor,
            target: { type: "grant", id: grant.id },
            data: {
              subject: { type: "user", id: userId },
              resourceId: grant.resourceId,
              action: grant.action,
              conditions: grant.conditions,
              expiresAt: grant.expiresAt === null ? null : DateTime.formatIso(grant.expiresAt),
              ...authorized
            }
          }), { discard: true })
      })

      return InvitationAcceptance.of({ accept })
    })
  )
}
