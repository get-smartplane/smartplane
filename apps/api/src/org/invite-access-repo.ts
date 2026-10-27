import { InviteAccess, type MembershipId, type OrgId, PendingInvite } from "@pc/domain"
import { Context, Effect, Layer, type Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows, encodeRow, JsonColumn } from "../platform/sql"

const PendingInviteRow = Schema.toCodecJson(
  Schema.Struct({ ...PendingInvite.fields, access: JsonColumn(InviteAccess) })
).pipe(Schema.decodeTo(PendingInvite))

/** The `invitation_access` columns for `invite`, for an insert inside a caller's batch. */
export const inviteAccessColumns = (orgId: OrgId, invite: PendingInvite) =>
  Effect.map(encodeRow(PendingInviteRow)(invite), (row) => ({ ...row, orgId }))

/** Access waiting on invitations. Rows exist only while the membership is `invited`. */
export class InviteAccessRepo extends Context.Service<InviteAccessRepo, {
  readonly list: (orgId: OrgId) => Effect.Effect<ReadonlyArray<PendingInvite>>
  readonly find: (orgId: OrgId, membershipId: MembershipId) => Effect.Effect<Option.Option<PendingInvite>>
}>()("api/org/InviteAccessRepo") {
  static readonly layer = Layer.effect(
    InviteAccessRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const select = sql`SELECT a.membership_id, a.access, a.set_by, a.updated_at
                           FROM invitation_access a JOIN memberships m ON m.id = a.membership_id AND m.status = 'invited'`
      return InviteAccessRepo.of({
        list: Effect.fn("InviteAccessRepo.list")((orgId: OrgId) =>
          decodeRows(PendingInviteRow)(sql`${select} WHERE a.org_id = ${orgId} ORDER BY a.updated_at DESC`)
        ),
        find: Effect.fn("InviteAccessRepo.find")((orgId: OrgId, membershipId: MembershipId) =>
          decodeFirst(PendingInviteRow)(sql`${select} WHERE a.org_id = ${orgId} AND a.membership_id = ${membershipId}`)
        )
      })
    })
  )
}
