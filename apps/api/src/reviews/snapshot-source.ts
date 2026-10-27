import { AccessTokenId, type AccessReviewScope, MembershipId, type OrgId, ResourceId, RoleSlug, TeamId, UserId } from "@pc/domain"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { GrantsRepo } from "../access/grants-repo"
import { MachineTokensRepo } from "../delivery/machine-tokens-repo"
import { decodeRows } from "../platform/sql"
import type { AccessState } from "./snapshot"

const MembershipRow = Schema.Struct({ membershipId: MembershipId, userId: Schema.NullOr(UserId), email: Schema.String, role: RoleSlug })
const TeamMemberRow = Schema.Struct({ teamId: TeamId, userId: UserId })
const TokenRow = Schema.Struct({ id: AccessTokenId, createdBy: UserId })
const ResourceRow = Schema.Struct({ id: ResourceId })

const groupBy = <A, K, V>(rows: ReadonlyArray<A>, key: (row: A) => K, value: (row: A) => V): Map<K, Array<V>> => {
  const groups = new Map<K, Array<V>>()
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), value(row)])
  return groups
}

/** Reads the current access state of an org for an access review snapshot. */
export class AccessSnapshotSource extends Context.Service<AccessSnapshotSource, {
  readonly read: (orgId: OrgId, scope: AccessReviewScope) => Effect.Effect<AccessState>
}>()("api/reviews/AccessSnapshotSource") {
  static readonly layer = Layer.effect(
    AccessSnapshotSource,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const grants = yield* GrantsRepo
      const machines = yield* MachineTokensRepo

      const inScope = Effect.fn("AccessSnapshotSource.inScope")(function*(orgId: OrgId, scope: AccessReviewScope) {
        const all = yield* grants.list(orgId, {})
        if (scope.type === "org") return all
        const resources = yield* decodeRows(ResourceRow)(
          sql`SELECT id FROM resources WHERE org_id = ${orgId} AND project_id = ${scope.projectId}`
        )
        const ids = new Set<string>(resources.map((resource) => resource.id))
        return all.filter((grant) => ids.has(grant.resourceId))
      })

      return AccessSnapshotSource.of({
        read: Effect.fn("AccessSnapshotSource.read")(function*(orgId: OrgId, scope: AccessReviewScope) {
          const [memberships, scoped, teamMembers, tokens, liveMachines] = yield* Effect.all([
            decodeRows(MembershipRow)(
              sql`SELECT m.id AS membership_id, m.user_id, COALESCE(u.email, m.email) AS email, m.role
                    FROM memberships m LEFT JOIN users u ON u.id = m.user_id
                   WHERE m.org_id = ${orgId} AND m.status = 'active' ORDER BY email`
            ),
            inScope(orgId, scope),
            decodeRows(TeamMemberRow)(
              sql`SELECT tm.team_id, tm.user_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.org_id = ${orgId}`
            ),
            decodeRows(TokenRow)(
              sql`SELECT id, created_by FROM access_tokens WHERE org_id = ${orgId} AND kind = 'service_account'`
            ),
            machines.live(orgId)
          ])
          const state: AccessState = {
            memberships,
            grants: scoped,
            teamMembers: groupBy(teamMembers, (row): string => row.teamId, (row) => row.userId),
            tokenCreators: new Map(tokens.map((token) => [token.id, token.createdBy])),
            machineTokens: liveMachines
              .filter((token) => scope.type === "org" || token.projectId === scope.projectId)
              .map((token) => ({
                machineTokenId: token.id,
                name: token.name,
                createdBy: token.createdBy,
                projectId: token.projectId,
                allow: token.allow,
                expiresAt: token.expiresAt,
                lastUsedAt: token.lastUsedAt
              }))
          }
          return state
        })
      })
    })
  )
}
