import { type Conflict, Member, MembershipId, OrgId, type MemberSource, type MemberStatus, type RoleSlug, type UserId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { conflictOnDuplicate, decodeFirst, decodeRows } from "../platform/sql"

const MemberRow = Schema.toCodecJson(Member)
const Membership = Schema.Struct({ orgId: OrgId, membershipId: MembershipId })
const Count = Schema.Struct({ count: Schema.Int })

/** Offboarding reasons that came from WorkOS or SCIM, which a later WorkOS "active" event may reverse. */
export const providerRemovals: ReadonlyArray<string> = ["membership_inactive", "scim_dsync.user.updated", "scim_dsync.user.deleted"]

export interface NewMember {
  readonly id: MembershipId
  readonly orgId: OrgId
  readonly userId: UserId | null
  readonly email: string
  readonly role: RoleSlug
  readonly status: MemberStatus
  readonly source: MemberSource
  readonly workosMembershipId: string | null
}

export class MembersRepo extends Context.Service<MembersRepo, {
  readonly list: (orgId: OrgId) => Effect.Effect<ReadonlyArray<Member>>
  readonly find: (orgId: OrgId, id: MembershipId) => Effect.Effect<Option.Option<Member>>
  readonly findByUser: (orgId: OrgId, userId: UserId) => Effect.Effect<Option.Option<Member>>
  readonly findByEmail: (orgId: OrgId, email: string) => Effect.Effect<Option.Option<Member>>
  readonly insert: (member: NewMember) => Effect.Effect<void, Conflict>
  /**
   * Activates a membership from a WorkOS membership event; false when it stays off. A removed membership
   * comes back only if WorkOS or SCIM removed it, or WorkOS reports a new membership (`created`, other id).
   */
  readonly activateFromWorkos: (id: MembershipId, userId: UserId, workosMembershipId: string, event: "created" | "updated") => Effect.Effect<boolean>
  readonly setRole: (orgId: OrgId, id: MembershipId, role: RoleSlug) => Effect.Effect<void>
  readonly countWithRole: (orgId: OrgId, role: RoleSlug) => Effect.Effect<number>
  readonly activeMembershipsOf: (userId: UserId) => Effect.Effect<ReadonlyArray<{ orgId: OrgId; membershipId: MembershipId }>>
}>()("api/org/MembersRepo") {
  static readonly layer = Layer.effect(
    MembersRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const select = sql`SELECT m.id, m.org_id, m.user_id, COALESCE(u.email, m.email) AS email, u.name, m.role, m.status,
                                m.source, u.last_seen_at, m.created_at, m.deprovisioned_at
                           FROM memberships m LEFT JOIN users u ON u.id = m.user_id`
      const one = decodeFirst(MemberRow)

      return MembersRepo.of({
        list: Effect.fn("MembersRepo.list")((orgId: OrgId) =>
          decodeRows(MemberRow)(sql`${select} WHERE m.org_id = ${orgId} ORDER BY email`)
        ),
        find: Effect.fn("MembersRepo.find")((orgId: OrgId, id: MembershipId) =>
          one(sql`${select} WHERE m.org_id = ${orgId} AND m.id = ${id}`)
        ),
        findByUser: Effect.fn("MembersRepo.findByUser")((orgId: OrgId, userId: UserId) =>
          one(sql`${select} WHERE m.org_id = ${orgId} AND m.user_id = ${userId}`)
        ),
        findByEmail: Effect.fn("MembersRepo.findByEmail")((orgId: OrgId, email: string) =>
          one(sql`${select} WHERE m.org_id = ${orgId} AND lower(m.email) = lower(${email})`)
        ),
        insert: Effect.fn("MembersRepo.insert")(function*(member: NewMember) {
          const createdAt = DateTime.formatIso(yield* DateTime.now)
          yield* sql`INSERT INTO memberships ${sql.insert({ ...member, createdAt })}`.pipe(conflictOnDuplicate("already a member"))
        }),
        activateFromWorkos: Effect.fn("MembersRepo.activateFromWorkos")(function*(id: MembershipId, userId: UserId, workosMembershipId: string, event: "created" | "updated") {
          const isNewMembership = event === "created" ? sql`(workos_membership_id IS NULL OR workos_membership_id != ${workosMembershipId})` : sql`0`
          const activated = yield* sql`UPDATE memberships SET status = 'active', user_id = ${userId}, deprovisioned_at = NULL, deprovision_reason = NULL,
                                              workos_membership_id = ${workosMembershipId}
                                        WHERE id = ${id}
                                          AND (status != 'deprovisioned' OR ${sql.in("deprovision_reason", providerRemovals)} OR ${isNewMembership})
                                        RETURNING id`.pipe(Effect.orDie)
          return activated.length > 0
        }),
        setRole: Effect.fn("MembersRepo.setRole")((orgId: OrgId, id: MembershipId, role: RoleSlug) =>
          sql`UPDATE memberships SET role = ${role} WHERE org_id = ${orgId} AND id = ${id}`.pipe(Effect.asVoid, Effect.orDie)
        ),
        countWithRole: Effect.fn("MembersRepo.countWithRole")((orgId: OrgId, role: RoleSlug) =>
          decodeFirst(Count)(
            sql`SELECT COUNT(*) AS count FROM memberships WHERE org_id = ${orgId} AND role = ${role} AND status != 'deprovisioned'`
          ).pipe(Effect.map(Option.match({ onNone: () => 0, onSome: (row) => row.count })))
        ),
        activeMembershipsOf: Effect.fn("MembersRepo.activeMembershipsOf")((userId: UserId) =>
          decodeRows(Membership)(
            sql`SELECT org_id, id AS membership_id FROM memberships WHERE user_id = ${userId} AND status = 'active'`
          )
        )
      })
    })
  )
}
