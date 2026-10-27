import { type Actor, type Member, type MembershipId, NotFound, type OrgId } from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { ConnectionsRepo } from "../connections/connections-repo"
import { MembersRepo } from "./members-repo"

/**
 * The one offboarding path (SOC 2): dashboard removal, WorkOS membership events and SCIM deprovisioning
 * all call `deprovisionMember`. In one atomic D1 batch the membership is switched off, the member's
 * personal tokens are revoked, their direct grants are revoked, they leave every team of the org and their
 * per-user connected accounts (with their encrypted credentials) are deleted. For a pending invitation, the
 * access set up with it (teams to join, grants to receive) is deleted before it could ever apply.
 * The membership row is kept so audit history keeps resolving.
 */
export class Offboarding extends Context.Service<Offboarding, {
  readonly deprovisionMember: (
    orgId: OrgId,
    membershipId: MembershipId,
    actor: Actor,
    reason: string
  ) => Effect.Effect<Member, NotFound>
}>()("api/org/Offboarding") {
  static readonly layer = Layer.effect(
    Offboarding,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const members = yield* MembersRepo
      const audit = yield* AuditLog
      const connections = yield* ConnectionsRepo

      const deprovisionMember = Effect.fn("Offboarding.deprovisionMember")(
        function*(orgId: OrgId, membershipId: MembershipId, actor: Actor, reason: string) {
          yield* Effect.annotateCurrentSpan({ "org.id": orgId, "member.id": membershipId, "offboarding.reason": reason })
          const notFound = new NotFound({ entity: "member", id: membershipId })
          const before = yield* Effect.mapError(Effect.fromOption(yield* members.find(orgId, membershipId)), () => notFound)
          const now = DateTime.formatIso(yield* DateTime.now)
          const userId = before.userId ?? ""
          const ownConnections = before.userId === null ? [] : yield* connections.ofUser(orgId, before.userId)
          const pendingSetup = yield* sql`SELECT membership_id FROM invitation_access WHERE membership_id = ${membershipId} AND org_id = ${orgId}`.pipe(Effect.orDie)
          // Audited before the batch: if the audit log cannot take the events, nothing is committed and the
          // caller (dashboard, WorkOS or SCIM retry) tries again; a commit can never go unrecorded.
          yield* Effect.forEach(ownConnections, (connection) =>
            audit.record({
              orgId,
              type: "connection.disconnected",
              actor,
              target: { type: "resource", id: connection.resourceId },
              data: { connectionId: connection.id, mode: connection.mode, userId: connection.userId, reason: "deprovisioned" }
            }), { discard: true })
          if (before.status !== "deprovisioned") {
            yield* audit.record({
              orgId,
              type: "member.deprovisioned",
              actor,
              target: { type: "member", id: membershipId },
              data: { reason, userId: before.userId, email: before.email, pendingAccessDropped: pendingSetup.length > 0 }
            })
          }
          yield* sql.batch([
            sql`UPDATE memberships SET status = 'deprovisioned', deprovisioned_at = COALESCE(deprovisioned_at, ${now}),
                       deprovision_reason = CASE WHEN status = 'deprovisioned' THEN deprovision_reason ELSE ${reason} END
                 WHERE id = ${membershipId} AND org_id = ${orgId}`,
            sql`UPDATE access_tokens SET revoked_at = ${now}
                 WHERE org_id = ${orgId} AND kind = 'personal' AND revoked_at IS NULL
                   AND (membership_id = ${membershipId} OR created_by = ${userId})`,
            sql`UPDATE grants SET revoked_at = ${now}, revoked_by = ${actor.id}
                 WHERE org_id = ${orgId} AND subject_type = 'user' AND subject_id = ${userId} AND revoked_at IS NULL`,
            sql`DELETE FROM team_members
                 WHERE user_id = ${userId} AND team_id IN (SELECT id FROM teams WHERE org_id = ${orgId})`,
            sql`DELETE FROM connections WHERE org_id = ${orgId} AND user_id = ${userId}`,
            // A pending invitation's teams and grants were never applied; dropping the setup cancels them.
            sql`DELETE FROM invitation_access WHERE membership_id = ${membershipId} AND org_id = ${orgId}`
          ]).pipe(Effect.orDie)
          return yield* Effect.mapError(Effect.fromOption(yield* members.find(orgId, membershipId)), () => notFound)
        }
      )

      return Offboarding.of({ deprovisionMember })
    })
  )
}

